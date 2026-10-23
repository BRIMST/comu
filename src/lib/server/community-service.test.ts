import { beforeEach, describe, expect, it } from "vitest";
import { createCommunityService } from "./community-service";
import { createChallengeService } from "./challenge-service";
import { createMemoryStore } from "./memory-store";
import { PLAY_WINDOW_MS } from "../domain/challenges";

let t = 1_700_000_000_000;
const clock = () => t;
const H = 3_600_000;
const mk = () => { const store = createMemoryStore({}); return { store, svc: createCommunityService({ store, clock }) }; };
beforeEach(() => { t = 1_700_000_000_000; });

describe("votaciones", () => {
  async function poll() {
    const { store, svc } = mk();
    const p = await svc.createPoll("admin", { question: "¿Qué jugamos mañana?", kind: "juego", options: ["Uno", "Dos", "Tres"], closesAt: t + H });
    return { store, svc, p };
  }
  it("un usuario solo cuenta una vez, aunque envíe votos simultáneos", async () => {
    const { svc, p } = await poll();
    const r = await Promise.allSettled(Array.from({ length: 10 }, () => svc.vote("u1", p.id, "o2")));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const v = (await svc.listPolls("u1"))[0]!;
    expect(v.totalVotes).toBe(1);
    expect(v.myVote).toBe("o2");
  });
  it("varios usuarios suman y los resultados se ocultan hasta votar", async () => {
    const { svc, p } = await poll();
    expect((await svc.listPolls("u1"))[0]!.options[0]!.votes).toBeNull();
    await Promise.all(["u1", "u2", "u3"].map((u, i) => svc.vote(u, p.id, i < 2 ? "o1" : "o3")));
    const v = (await svc.listPolls("u2"))[0]!;
    expect(v.options.map((o) => o.votes)).toEqual([2, 0, 1]);
    expect((await svc.listPolls("otro"))[0]!.totalVotes).toBeNull();
  });
  it("rechaza opciones inválidas, votaciones cerradas y vencidas", async () => {
    const { svc, p } = await poll();
    await expect(svc.vote("u1", p.id, "o9")).rejects.toThrow("Opción");
    await expect(svc.vote("u1", "noexiste1234", "o1")).rejects.toThrow("no encontrada");
    t += 2 * H;
    await expect(svc.vote("u1", p.id, "o1")).rejects.toThrow("cerró");
    const p2 = await svc.createPoll("admin", { question: "Otra pregunta aquí", kind: "general", options: ["a", "b"], closesAt: t + H });
    await svc.closePoll("admin", p2.id);
    await expect(svc.vote("u1", p2.id, "o1")).rejects.toThrow("cerró");
  });
  it("valida la creación", async () => {
    const { svc } = mk();
    await expect(svc.createPoll("a", { question: "hola", kind: "general", options: ["a", "b"], closesAt: t + H })).rejects.toThrow();
    await expect(svc.createPoll("a", { question: "Pregunta válida", kind: "general", options: ["solo una"], closesAt: t + H })).rejects.toThrow();
    await expect(svc.createPoll("a", { question: "Pregunta válida", kind: "general", options: ["a", "b"], closesAt: t - 1 })).rejects.toThrow("futura");
  });
});

describe("eventos", () => {
  it("separa próximos e historial y valida enlaces https", async () => {
    const { svc } = mk();
    await svc.createEvent("admin", { title: "Live de estreno", kind: "live", startsAt: t + H, links: [{ label: "TikTok", url: "https://www.tiktok.com/@canal" }] });
    await svc.createEvent("admin", { title: "Evento pasado", kind: "evento", startsAt: t - 10 * H });
    const e = await svc.listEvents();
    expect(e.upcoming.map((x) => x.title)).toEqual(["Live de estreno"]);
    expect(e.history.map((x) => x.title)).toEqual(["Evento pasado"]);
    await expect(svc.createEvent("admin", { title: "Malo", kind: "live", startsAt: t + H, links: [{ label: "x", url: "javascript:alert(1)" }] })).rejects.toThrow();
    await expect(svc.createEvent("admin", { title: "Malo", kind: "live", startsAt: t + H, links: [{ label: "x", url: "http://inseguro.com" }] })).rejects.toThrow("https");
  });
  it("un evento cancelado pasa al historial", async () => {
    const { svc } = mk();
    const ev = await svc.createEvent("admin", { title: "Se cancela", kind: "live", startsAt: t + H });
    await svc.cancelEvent("admin", ev.id);
    expect((await svc.listEvents()).upcoming).toHaveLength(0);
  });
  it("la vista pública no expone quién lo creó", async () => {
    const { svc } = mk();
    await svc.createEvent("admin-uid-secreto", { title: "Evento público", kind: "live", startsAt: t + H });
    expect(JSON.stringify(await svc.lives("u1"))).not.toContain("admin-uid-secreto");
  });
});

describe("misiones y propuestas", () => {
  it("el progreso se limita al objetivo y completa la misión", async () => {
    const { svc } = mk();
    const m = await svc.createMission("admin", { title: "Mil votos", target: 100, unit: "votos" });
    await svc.setMissionProgress("admin", m.id, 40);
    expect((await svc.listMissions())[0]!.status).toBe("open");
    await svc.setMissionProgress("admin", m.id, 500);
    const done = (await svc.listMissions())[0]!;
    expect(done.progress).toBe(100); expect(done.status).toBe("completed");
    await expect(svc.setMissionProgress("admin", m.id, -1)).rejects.toThrow();
  });
  it("limita las propuestas a 3 al día", async () => {
    const { svc } = mk();
    for (let i = 0; i < 3; i++) await svc.submitProposal("u1", "ana", `Propuesta número ${i} para el creador`);
    await expect(svc.submitProposal("u1", "ana", "Una propuesta más de las permitidas")).rejects.toThrow("Demasiadas");
    await expect(svc.submitProposal("u2", "beto", "corta")).rejects.toThrow();
    t += 25 * H;
    await svc.submitProposal("u1", "ana", "Ya pasó un día, otra propuesta");
  });
});

describe("notificaciones", () => {
  it("no duplica por clave, respeta silencios y marca como leídas", async () => {
    const { svc } = mk();
    await svc.notify("u1", "k1", "challenges", "Hola", "uno");
    await svc.notify("u1", "k1", "challenges", "Hola", "uno otra vez");
    await svc.notify("u1", "k2", "levels", "Nivel", "dos");
    let n = await svc.listNotifications("u1");
    expect(n.notifications).toHaveLength(2); expect(n.unread).toBe(2);
    await svc.setPrefs("u1", { levels: true, inventado: true });
    await svc.notify("u1", "k3", "levels", "Nivel 3", "silenciada");
    n = await svc.listNotifications("u1");
    expect(n.notifications.map((x) => x.key)).toEqual(["k1"]);
    expect(n.prefs.levels).toBe(true);
    await svc.markRead("u1", ["k1"]);
    expect((await svc.listNotifications("u1")).unread).toBe(0);
  });
  it("las notificaciones de otro usuario no se mezclan", async () => {
    const { svc } = mk();
    await svc.notify("u1", "k1", "admin", "Solo u1", "x");
    expect((await svc.listNotifications("u2")).notifications).toHaveLength(0);
  });
  it("anuncios, eventos y votaciones llegan a todos y se marcan leídos por usuario", async () => {
    const { svc } = mk();
    await svc.publishAnnouncement("admin", { title: "Mantenimiento", body: "Esta noche" });
    await svc.createEvent("admin", { title: "Gran live", kind: "live", startsAt: t + H });
    await svc.createPoll("admin", { question: "¿Qué playlist?", kind: "playlist", options: ["A", "B"], closesAt: t + H });
    const a = await svc.listNotifications("u1");
    expect(a.notifications.map((x) => x.category).sort()).toEqual(["admin", "events", "polls"]);
    await svc.markRead("u1", "all");
    expect((await svc.listNotifications("u1")).unread).toBe(0);
    expect((await svc.listNotifications("u2")).unread).toBe(3);
    await svc.setPrefs("u2", { polls: true });
    expect((await svc.listNotifications("u2")).notifications.map((x) => x.category)).not.toContain("polls");
    t += 15 * 24 * H;
    expect((await svc.listNotifications("u2")).notifications).toHaveLength(0);
  });
});

describe("auditoría", () => {
  it("cada acción de administración deja registro", async () => {
    const { store, svc } = mk();
    await svc.createEvent("admin1", { title: "Evento", kind: "evento", startsAt: t + H });
    await svc.publishAnnouncement("admin1", { title: "Aviso", body: "Texto" });
    await svc.setChannels("admin1", { links: [{ label: "YouTube", url: "https://youtube.com/@canal" }] });
    const logs = await store.get<Record<string, { action: string }>>("adminAuditLogs/admin1");
    expect(Object.values(logs!).map((l) => l.action).sort()).toEqual(["announcement_published", "channels_updated", "event_created"]);
  });
});

describe("retos → notificaciones", () => {
  it("avisa de invitación, aceptación y resultado una sola vez", async () => {
    const data = (uid: string, name: string, balance: number) => ({ usernames: { [name]: { uid, username: name } }, publicProfiles: { [uid]: { username: name } }, users: { [uid]: {} }, wallets: { [uid]: { balance, updatedAt: 0 } } });
    const store = createMemoryStore({
      usernames: { ana: { uid: "A", username: "ana" }, beto: { uid: "B", username: "beto" } },
      publicProfiles: { A: { username: "ana" }, B: { username: "beto" } },
      users: { A: {}, B: {} }, wallets: { A: { balance: 100, updatedAt: 0 }, B: { balance: 100, updatedAt: 0 } },
    });
    void data;
    const community = createCommunityService({ store, clock });
    const ch = createChallengeService({ store, clock, notify: community.notify });
    const c = await ch.create("A", { opponent: "beto", game: "trivia", stake: 10 });
    expect((await community.listNotifications("B")).notifications.map((n) => n.title)).toEqual(["Te retaron"]);
    await ch.accept("B", c.id);
    expect((await community.listNotifications("A")).notifications.map((n) => n.title)).toContain("Reto aceptado");
    t += PLAY_WINDOW_MS + 1;
    await Promise.all([ch.refresh(c.id), ch.refresh(c.id), ch.detail("A", c.id)]);
    for (const u of ["A", "B"]) {
      const titles = (await community.listNotifications(u)).notifications.map((n) => n.title);
      expect(titles.filter((x) => x === "Resultado del reto")).toHaveLength(1);
    }
  });
  it("si falla el aviso, el reto sigue funcionando", async () => {
    const store = createMemoryStore({
      usernames: { beto: { uid: "B", username: "beto" } }, publicProfiles: { A: { username: "ana" } },
      users: { A: {}, B: {} }, wallets: { A: { balance: 100, updatedAt: 0 } },
    });
    const ch = createChallengeService({ store, clock, notify: async () => { throw new Error("boom"); } });
    await expect(ch.create("A", { opponent: "beto", game: "memoria", stake: 5 })).resolves.toBeTruthy();
  });
});
