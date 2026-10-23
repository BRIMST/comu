import {
  CATEGORIES, announcementInput, channelsInput, eventInput, missionInput, pollInput, proposalText,
  type Category, type EventRecord, type MissionRecord, type Notifier, type PollRecord,
} from "../domain/community";
import { ApiError } from "./errors";
import { writeAudit } from "./audit";
import { rateLimit } from "./rate-limit";
import type { Store } from "./store";

type Deps = { store: Store; clock?: () => number };
const DAY = 24 * 60 * 60 * 1000;
const BROADCAST_WINDOW = 14 * DAY;
const DEFAULT_EVENT_LENGTH = 2 * 60 * 60 * 1000;

type Personal = { type: Category; title: string; body: string; link?: string; createdAt: number; read?: boolean };
type Announcement = { id: string; title: string; body: string; createdAt: number };

export function createCommunityService({ store, clock = Date.now }: Deps) {
  const limit = (uid: string, bucket: string, max: number, windowMs: number) => rateLimit(store, clock(), uid, bucket, max, windowMs);
  const bad = (e: { error: { issues: { message: string }[] } }) => new ApiError(e.error.issues[0]?.message ?? "Datos no válidos.");

  // ---------- auditoría (solo acciones de administración) ----------
  const audit = (adminUid: string, action: string, meta: Record<string, unknown> = {}) => writeAudit(store, clock(), adminUid, action, meta);

  // ---------- notificaciones ----------
  const notify: Notifier = async (uid, key, category, title, body, link) => {
    const muted = await store.get<boolean>(`notificationPrefs/${uid}/muted/${category}`);
    if (muted) return;
    const entry: Personal = { type: category, title, body, createdAt: clock(), read: false, ...(link ? { link } : {}) };
    await store.transaction(`notifications/${uid}/${key}`, (cur) => (cur === null ? entry : undefined));
  };

  async function getPrefs(uid: string) {
    const p = await store.get<{ muted?: Record<string, boolean> }>(`notificationPrefs/${uid}`);
    return Object.fromEntries(CATEGORIES.map((c) => [c, p?.muted?.[c] === true])) as Record<Category, boolean>;
  }
  async function setPrefs(uid: string, muted: Record<string, unknown>) {
    const clean: Record<string, true> = {};
    for (const c of CATEGORIES) if (muted[c] === true) clean[c] = true;
    await store.set(`notificationPrefs/${uid}/muted`, Object.keys(clean).length ? clean : null);
  }

  async function broadcasts() {
    const since = clock() - BROADCAST_WINDOW;
    const [events, polls, anns] = await Promise.all([
      store.list<EventRecord>("events", { orderBy: "createdAt", limitLast: 15 }),
      store.list<PollRecord>("polls", { orderBy: "createdAt", limitLast: 15 }),
      store.list<Announcement>("announcements", { orderBy: "createdAt", limitLast: 15 }),
    ]);
    return [
      ...events.filter((e) => e.status !== "cancelled").map((e) => ({ key: `event:${e.id}`, type: "events" as Category, title: "Nuevo evento", body: e.title, link: "/lives", createdAt: e.createdAt })),
      ...polls.map((p) => ({ key: `poll:${p.id}`, type: "polls" as Category, title: "Nueva votación", body: p.question, link: "/lives", createdAt: p.createdAt })),
      ...anns.map((a) => ({ key: `ann:${a.id}`, type: "admin" as Category, title: a.title, body: a.body, link: undefined as string | undefined, createdAt: a.createdAt })),
    ].filter((b) => b.createdAt >= since);
  }

  async function listNotifications(uid: string) {
    const [personal, bcast, prefs, reads] = await Promise.all([
      store.list<Personal>(`notifications/${uid}`, { orderBy: "createdAt", limitLast: 50 }),
      broadcasts(),
      getPrefs(uid),
      store.get<Record<string, number>>(`notificationPrefs/${uid}/reads`),
    ]);
    const items = [
      ...personal.map((n) => ({ key: n.id, category: n.type, title: n.title, body: n.body, link: n.link ?? null, createdAt: n.createdAt, read: n.read === true, broadcast: false })),
      ...bcast.map((b) => ({ key: b.key, category: b.type, title: b.title, body: b.body, link: b.link ?? null, createdAt: b.createdAt, read: !!reads?.[b.key], broadcast: true })),
    ].filter((n) => !prefs[n.category]).sort((a, b) => b.createdAt - a.createdAt);
    return { notifications: items, unread: items.filter((n) => !n.read).length, prefs };
  }

  async function markRead(uid: string, keys: string[] | "all") {
    const { notifications } = await listNotifications(uid);
    const targets = keys === "all" ? notifications.filter((n) => !n.read) : notifications.filter((n) => keys.includes(n.key));
    const now = clock();
    const updates: Record<string, unknown> = {};
    for (const n of targets) updates[n.broadcast ? `notificationPrefs/${uid}/reads/${n.key}` : `notifications/${uid}/${n.key}/read`] = n.broadcast ? now : true;
    if (Object.keys(updates).length) await store.update(updates);
  }

  // ---------- eventos ----------
  async function createEvent(adminUid: string, input: unknown) {
    const p = eventInput.safeParse(input); if (!p.success) throw bad(p);
    const id = store.newKey("events");
    const ev: EventRecord = { id, ...p.data, status: "scheduled", createdAt: clock(), createdBy: adminUid };
    await store.set(`events/${id}`, JSON.parse(JSON.stringify(ev)));
    await audit(adminUid, "event_created", { id, title: ev.title });
    return ev;
  }
  async function cancelEvent(adminUid: string, id: string) {
    const r = await store.transaction<EventRecord>(`events/${id}`, (cur) => (cur === null ? null : { ...cur, status: "cancelled" }));
    if (!r.value) throw new ApiError("Evento no encontrado.", 404);
    await audit(adminUid, "event_cancelled", { id });
  }
  async function listEvents() {
    const now = clock();
    const all = await store.list<EventRecord>("events", { orderBy: "startsAt", limitLast: 60 });
    const end = (e: EventRecord) => e.endsAt ?? e.startsAt + DEFAULT_EVENT_LENGTH;
    return {
      upcoming: all.filter((e) => e.status === "scheduled" && end(e) >= now).sort((a, b) => a.startsAt - b.startsAt),
      history: all.filter((e) => e.status === "cancelled" || end(e) < now).sort((a, b) => b.startsAt - a.startsAt),
    };
  }

  // ---------- votaciones ----------
  async function createPoll(adminUid: string, input: unknown) {
    const p = pollInput.safeParse(input); if (!p.success) throw bad(p);
    if (p.data.closesAt <= clock()) throw new ApiError("La fecha de cierre debe ser futura.");
    const id = store.newKey("polls");
    const poll: PollRecord = {
      id, question: p.data.question, kind: p.data.kind, options: p.data.options.map((text, i) => ({ id: `o${i + 1}`, text })),
      createdAt: clock(), closesAt: p.data.closesAt, status: "open", createdBy: adminUid,
    };
    await store.set(`polls/${id}`, poll);
    await audit(adminUid, "poll_created", { id, question: poll.question });
    return poll;
  }
  async function closePoll(adminUid: string, id: string) {
    const r = await store.transaction<PollRecord>(`polls/${id}`, (cur) => (cur === null ? null : { ...cur, status: "closed" }));
    if (!r.value) throw new ApiError("Votación no encontrada.", 404);
    await audit(adminUid, "poll_closed", { id });
  }
  async function vote(uid: string, pollId: string, optionId: string) {
    await limit(uid, "vote", 30, 60_000);
    const now = clock();
    let res = "missing" as "missing" | "closed" | "invalid" | "dup" | "ok";
    await store.transaction<PollRecord>(`polls/${pollId}`, (cur) => {
      if (cur === null) return null;
      if (cur.status !== "open" || now >= cur.closesAt) { res = "closed"; return undefined; }
      if (!cur.options.some((o) => o.id === optionId)) { res = "invalid"; return undefined; }
      if (cur.voters?.[uid]) { res = "dup"; return undefined; }
      res = "ok";
      return { ...cur, voters: { ...(cur.voters ?? {}), [uid]: optionId }, counts: { ...(cur.counts ?? {}), [optionId]: (cur.counts?.[optionId] ?? 0) + 1 } };
    });
    if (res === "ok") return;
    throw new ApiError({ missing: "Votación no encontrada.", closed: "Esta votación ya cerró.", invalid: "Opción no válida.", dup: "Ya votaste en esta encuesta." }[res], res === "missing" ? 404 : 409);
  }
  async function listPolls(uid: string) {
    const now = clock();
    const polls = await store.list<PollRecord>("polls", { orderBy: "createdAt", limitLast: 20 });
    return polls.sort((a, b) => b.createdAt - a.createdAt).map((p) => {
      const open = p.status === "open" && now < p.closesAt;
      const myVote = p.voters?.[uid] ?? null;
      const showResults = !open || myVote !== null; // no mostramos resultados antes de votar para no sesgar
      return {
        id: p.id, question: p.question, kind: p.kind, closesAt: p.closesAt, open, myVote,
        totalVotes: showResults ? Object.values(p.counts ?? {}).reduce((a, b) => a + b, 0) : null,
        options: p.options.map((o) => ({ id: o.id, text: o.text, votes: showResults ? p.counts?.[o.id] ?? 0 : null })),
      };
    });
  }

  // ---------- misiones comunitarias (progreso registrado manualmente por un administrador) ----------
  async function createMission(adminUid: string, input: unknown) {
    const p = missionInput.safeParse(input); if (!p.success) throw bad(p);
    const id = store.newKey("communityMissions");
    const m: MissionRecord = { id, ...p.data, progress: 0, status: "open", createdAt: clock(), createdBy: adminUid };
    await store.set(`communityMissions/${id}`, m);
    await audit(adminUid, "mission_created", { id, title: m.title });
    return m;
  }
  async function setMissionProgress(adminUid: string, id: string, progress: unknown) {
    if (typeof progress !== "number" || !Number.isInteger(progress) || progress < 0) throw new ApiError("El progreso debe ser un entero positivo.");
    const r = await store.transaction<MissionRecord>(`communityMissions/${id}`, (cur) => {
      if (cur === null) return null;
      if (cur.status === "closed") return undefined;
      const value = Math.min(progress, cur.target);
      return { ...cur, progress: value, status: value >= cur.target ? "completed" : "open" };
    });
    if (!r.committed || !r.value) throw new ApiError("Misión no encontrada o cerrada.", 404);
    await audit(adminUid, "mission_progress", { id, progress });
  }
  async function closeMission(adminUid: string, id: string) {
    const r = await store.transaction<MissionRecord>(`communityMissions/${id}`, (cur) => (cur === null ? null : { ...cur, status: "closed" }));
    if (!r.value) throw new ApiError("Misión no encontrada.", 404);
    await audit(adminUid, "mission_closed", { id });
  }
  const listMissions = async () => (await store.list<MissionRecord>("communityMissions", { orderBy: "createdAt", limitLast: 20 })).sort((a, b) => b.createdAt - a.createdAt);

  // ---------- anuncios y canales oficiales ----------
  async function publishAnnouncement(adminUid: string, input: unknown) {
    const p = announcementInput.safeParse(input); if (!p.success) throw bad(p);
    const id = store.newKey("announcements");
    await store.set(`announcements/${id}`, { id, ...p.data, createdAt: clock() });
    await audit(adminUid, "announcement_published", { id, title: p.data.title });
  }
  async function setChannels(adminUid: string, input: unknown) {
    const p = channelsInput.safeParse(input); if (!p.success) throw bad(p);
    await store.set("siteSettings/channels", p.data.links.length ? p.data.links : null);
    await audit(adminUid, "channels_updated", { count: p.data.links.length });
  }
  const getChannels = async () => (await store.get<{ label: string; url: string }[]>("siteSettings/channels")) ?? [];

  // ---------- propuestas de retos para el creador ----------
  async function submitProposal(uid: string, username: string, text: unknown) {
    const p = proposalText.safeParse(text); if (!p.success) throw bad(p);
    await limit(uid, "proposal", 3, DAY);
    const id = store.newKey("challengeProposals");
    await store.set(`challengeProposals/${id}`, { id, uid, username, text: p.data, status: "new", createdAt: clock() });
  }
  async function listProposals() {
    return (await store.list<{ id: string; username: string; text: string; status: string; createdAt: number }>("challengeProposals", { orderBy: "createdAt", limitLast: 50 })).sort((a, b) => b.createdAt - a.createdAt);
  }
  async function reviewProposal(adminUid: string, id: string, status: string) {
    if (!["reviewed", "dismissed"].includes(status)) throw new ApiError("Estado no válido.");
    const r = await store.transaction<{ status: string }>(`challengeProposals/${id}`, (cur) => (cur === null ? null : { ...cur, status }));
    if (!r.value) throw new ApiError("Propuesta no encontrada.", 404);
    await audit(adminUid, "proposal_reviewed", { id, status });
  }

  async function lives(uid: string) {
    const [ev, polls, missions, channels] = await Promise.all([listEvents(), listPolls(uid), listMissions(), getChannels()]);
    const pub = <T extends { createdBy?: string }>(r: T): Omit<T, "createdBy"> => { const { createdBy: _c, ...rest } = r; void _c; return rest; };
    return { upcoming: ev.upcoming.map(pub), history: ev.history.map(pub), polls, missions: missions.map(pub), channels };
  }

  return {
    notify, getPrefs, setPrefs, listNotifications, markRead,
    createEvent, cancelEvent, listEvents, createPoll, closePoll, vote, listPolls,
    createMission, setMissionProgress, closeMission, listMissions,
    publishAnnouncement, setChannels, getChannels, submitProposal, listProposals, reviewProposal, lives, audit,
  };
}
