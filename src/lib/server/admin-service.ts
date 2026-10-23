import { ACHIEVEMENTS } from "../domain/progress";
import {
  badgeInput, bonusInput, moderationInput, reasonText, reportInput, type CustomBadge, type ReportRecord,
} from "../domain/admin";
import { FEATURES, type Feature } from "../domain/features";
import { gameConfigInput } from "../domain/game-config";
import type { Notifier } from "../domain/community";
import { dayKey } from "../domain/progress";
import { listAudit, writeAudit } from "./audit";
import { ApiError } from "./errors";
import { bump, metricsSummary } from "./metrics";
import { rateLimit } from "./rate-limit";
import { getFeatures, getGameConfig } from "./settings";
import type { Store } from "./store";
import { applyWalletOp } from "./wallet";

/** Operaciones de administración de cuentas en Firebase Auth (inyectables para pruebas). */
export type AuthAdmin = { setDisabled(uid: string, disabled: boolean): Promise<void>; revokeSessions(uid: string): Promise<void>; deleteUser(uid: string): Promise<void> };
type Deps = { store: Store; auth: AuthAdmin; clock?: () => number; notify?: Notifier; addActivity?: (uid: string, text: string, icon: string) => Promise<void> };
const bad = (e: { error: { issues: { message: string }[] } }) => new ApiError(e.error.issues[0]?.message ?? "Datos no válidos.");
const DAY = 86_400_000;

export function createAdminService({ store, auth, clock = Date.now, notify, addActivity }: Deps) {
  const tell: Notifier = async (...a) => { try { await notify?.(...a); } catch { /* noop */ } };
  const audit = (adminUid: string, action: string, meta: Record<string, unknown> = {}) => writeAudit(store, clock(), adminUid, action, meta);

  async function resolveUser(username: string) {
    const rec = await store.get<{ uid: string }>(`usernames/${username.toLowerCase()}`);
    if (!rec) throw new ApiError("No encontramos a ese usuario.", 404);
    return rec.uid;
  }

  // ---------- resumen, funciones y juegos ----------
  async function overview() {
    const [metrics, features, games, reports] = await Promise.all([
      metricsSummary(store, clock()), getFeatures(store), getGameConfig(store),
      store.list<ReportRecord>("reports", { orderBy: "createdAt", limitLast: 100 }),
    ]);
    return { metrics, features, games, openReports: reports.filter((r) => r.status === "open").length };
  }
  async function setFeature(adminUid: string, feature: string, enabled: boolean, reason: string) {
    if (!(FEATURES as readonly string[]).includes(feature)) throw new ApiError("Función no válida.");
    const r = reasonText.safeParse(reason); if (!r.success) throw bad(r);
    await store.set(`siteSettings/features/${feature as Feature}`, enabled);
    await audit(adminUid, enabled ? "feature_enabled" : "feature_disabled", { feature, reason: r.data });
  }
  async function setGameConfig(adminUid: string, input: unknown) {
    const p = gameConfigInput.safeParse(input); if (!p.success) throw bad(p);
    await store.set(`siteSettings/gameConfig/${p.data.game}`, { enabled: p.data.enabled, xp: p.data.xp, coins: p.data.coins });
    await audit(adminUid, "game_config_updated", { ...p.data });
  }

  // ---------- usuarios ----------
  async function searchUsers(q: string) {
    const prefix = q.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/.test(prefix)) return [];
    const rows = await store.listKeys<{ uid: string; username: string }>("usernames", prefix, 12);
    return Promise.all(rows.map(async ({ value }) => {
      const [u, p] = await Promise.all([store.get<{ role?: string; suspended?: boolean }>(`users/${value.uid}`), store.get<{ level?: number; avatar?: string }>(`profiles/${value.uid}`)]);
      return { username: value.username, avatar: p?.avatar ?? "🎮", level: p?.level ?? 1, role: u?.role ?? "member", suspended: u?.suspended === true };
    }));
  }
  async function userDetail(username: string) {
    const uid = await resolveUser(username);
    const [user, profile, wallet, ledger, stats, reports, ch] = await Promise.all([
      store.get<{ email?: string | null; role?: string; createdAt?: number; suspended?: boolean; suspension?: { reason: string; at: number; by: string } }>(`users/${uid}`),
      store.get<{ displayName?: string; bio?: string; avatar?: string; xp?: number; level?: number; joinedAt?: number }>(`profiles/${uid}`),
      store.get<{ balance?: number }>(`wallets/${uid}`),
      store.list<{ amount: number; type: string; description: string; createdAt: number }>(`walletTransactions/${uid}`, { orderBy: "createdAt", limitLast: 15 }),
      store.get<Record<string, unknown>>(`playerStats/${uid}`),
      store.list<ReportRecord>("reports", { orderBy: "createdAt", limitLast: 100 }),
      store.get<Record<string, true>>(`userChallenges/${uid}`),
    ]);
    return {
      username: username.toLowerCase(), email: user?.email ?? null, role: user?.role ?? "member", createdAt: user?.createdAt ?? null,
      suspended: user?.suspended === true, suspension: user?.suspension ?? null,
      profile: { displayName: profile?.displayName ?? username, bio: profile?.bio ?? "", avatar: profile?.avatar ?? "🎮", xp: profile?.xp ?? 0, level: profile?.level ?? 1 },
      balance: Number(wallet?.balance ?? 0),
      ledger: ledger.sort((a, b) => b.createdAt - a.createdAt).map(({ id, amount, type, description, createdAt }) => ({ id, amount, type, description, createdAt })),
      stats: { gamesPlayed: Number(stats?.gamesPlayed ?? 0), challengesWon: Number(stats?.challengesWon ?? 0), challengesLost: Number(stats?.challengesLost ?? 0), activeDays: Number(stats?.activeDays ?? 0) },
      challengesCount: Object.keys(ch ?? {}).length,
      reportsAgainst: reports.filter((r) => r.targetUid === uid).length,
    };
  }
  async function suspend(adminUid: string, username: string, reason: string) {
    const r = reasonText.safeParse(reason); if (!r.success) throw bad(r);
    const uid = await resolveUser(username);
    if (uid === adminUid) throw new ApiError("No puedes suspenderte a ti mismo.", 400);
    const u = await store.get<{ role?: string }>(`users/${uid}`);
    if (u?.role === "admin") throw new ApiError("No se puede suspender a otro administrador desde el panel.", 403);
    await store.update({ [`users/${uid}/suspended`]: true, [`users/${uid}/suspension`]: { reason: r.data, at: clock(), by: adminUid } });
    await audit(adminUid, "user_suspended", { username: username.toLowerCase(), reason: r.data });
    await auth.setDisabled(uid, true); // impide iniciar sesión
    await auth.revokeSessions(uid);    // cierra las sesiones abiertas
  }
  async function unsuspend(adminUid: string, username: string) {
    const uid = await resolveUser(username);
    await store.update({ [`users/${uid}/suspended`]: null, [`users/${uid}/suspension`]: null });
    await auth.setDisabled(uid, false);
    await audit(adminUid, "user_unsuspended", { username: username.toLowerCase() });
  }
  /** Bonificación por actividad comunitaria verificada por el equipo (p. ej. participó en un live). Tope y auditoría. */
  async function grantBonus(adminUid: string, username: string, input: unknown) {
    const p = bonusInput.safeParse(input); if (!p.success) throw bad(p);
    await rateLimit(store, clock(), adminUid, "admin_bonus", 30, DAY);
    const uid = await resolveUser(username);
    const id = store.newKey("adminBonuses");
    const res = await applyWalletOp(store, uid, `bonus:${id}`, p.data.amount, "admin_bonus", `Bonificación de la comunidad: ${p.data.reason}`, {}, clock());
    if (res !== "applied") throw new ApiError("No se pudo aplicar la bonificación.", 500);
    await audit(adminUid, "bonus_granted", { username: username.toLowerCase(), amount: p.data.amount, reason: p.data.reason });
    await tell(uid, `bonus:${id}`, "admin", "Bonificación recibida", `+${p.data.amount} 🪙 — ${p.data.reason}`, "/monedero");
  }
  /** Moderación de contenido de perfil: restablece campos ofensivos. */
  async function moderateProfile(adminUid: string, username: string, input: unknown) {
    const p = moderationInput.safeParse(input); if (!p.success) throw bad(p);
    const uid = await resolveUser(username);
    const updates: Record<string, unknown> = {};
    if (p.data.clearBio) updates[`profiles/${uid}/bio`] = "";
    if (p.data.resetName) { updates[`profiles/${uid}/displayName`] = username.toLowerCase(); updates[`publicProfiles/${uid}/displayName`] = username.toLowerCase(); }
    if (p.data.resetAvatar) { updates[`profiles/${uid}/avatar`] = "🎮"; updates[`publicProfiles/${uid}/avatar`] = "🎮"; }
    await store.update(updates);
    await audit(adminUid, "profile_moderated", { username: username.toLowerCase(), fields: Object.keys(p.data).filter((k) => k !== "reason" && (p.data as Record<string, unknown>)[k] === true), reason: p.data.reason });
    await tell(uid, `mod:${clock()}`, "admin", "Revisamos tu perfil", "El equipo restableció parte de tu perfil por incumplir las normas de la comunidad.", `/perfil/${username.toLowerCase()}`);
  }

  // ---------- reportes ----------
  async function createReport(reporterUid: string, input: unknown) {
    const p = reportInput.safeParse(input); if (!p.success) throw new ApiError("Revisa el usuario y el motivo.");
    await rateLimit(store, clock(), reporterUid, "report", 5, DAY);
    const targetUid = await resolveUser(p.data.username);
    if (targetUid === reporterUid) throw new ApiError("No puedes reportarte a ti mismo.");
    let fresh = false;
    await store.transaction(`reportDedupe/${reporterUid}/${targetUid}`, (cur: string | null) => { const d = dayKey(clock()); fresh = cur !== d; return fresh ? d : undefined; });
    if (!fresh) throw new ApiError("Ya reportaste a este usuario hoy. El equipo lo revisará.", 409);
    const id = store.newKey("reports");
    const r: ReportRecord = { id, reporterUid, targetUid, targetUsername: p.data.username, reason: p.data.reason, detail: p.data.detail, status: "open", createdAt: clock() };
    await store.set(`reports/${id}`, r);
    await bump(store, clock(), "reports");
  }
  async function listReports(status: "open" | "all" = "open") {
    const rows = await store.list<ReportRecord>("reports", { orderBy: "createdAt", limitLast: 80 });
    const names = new Map<string, string>();
    for (const uid of new Set(rows.map((r) => r.reporterUid))) names.set(uid, (await store.get<{ username?: string }>(`publicProfiles/${uid}`))?.username ?? "(cuenta eliminada)");
    return rows.filter((r) => status === "all" || r.status === "open").sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ id: r.id, target: r.targetUsername, reporter: names.get(r.reporterUid) ?? "", reason: r.reason, detail: r.detail, status: r.status, createdAt: r.createdAt, note: r.note ?? "" }));
  }
  async function resolveReport(adminUid: string, id: string, resolution: "dismissed" | "actioned", note: string) {
    const n = reasonText.safeParse(note); if (!n.success) throw bad(n);
    let ok = false;
    const r = await store.transaction<ReportRecord>(`reports/${id}`, (cur) => { if (cur === null) return null; ok = cur.status === "open"; return ok ? { ...cur, status: resolution, resolvedBy: adminUid, resolvedAt: clock(), note: n.data } : undefined; });
    if (!r.value) throw new ApiError("Reporte no encontrado.", 404);
    if (!ok) throw new ApiError("Este reporte ya fue resuelto.", 409);
    await audit(adminUid, "report_resolved", { id, resolution, target: r.value.targetUsername });
  }

  // ---------- insignias ----------
  async function createBadge(adminUid: string, input: unknown) {
    const p = badgeInput.safeParse(input); if (!p.success) throw bad(p);
    const id = store.newKey("customBadges");
    const b: CustomBadge = { id, ...p.data, createdAt: clock() };
    await store.set(`customBadges/${id}`, b);
    await audit(adminUid, "badge_created", { id, name: b.name });
  }
  async function listBadges() {
    const custom = (await store.list<CustomBadge>("customBadges", { orderBy: "createdAt", limitLast: 50 })).sort((a, b) => b.createdAt - a.createdAt);
    return { custom, builtin: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, desc: a.desc })) };
  }
  async function badgeName(id: string) {
    const builtin = ACHIEVEMENTS.find((a) => a.id === id);
    if (builtin) return builtin.name;
    const c = await store.get<CustomBadge>(`customBadges/${id}`);
    if (!c) throw new ApiError("Insignia no encontrada.", 404);
    return c.name;
  }
  async function grantBadge(adminUid: string, username: string, badgeId: string) {
    const name = await badgeName(badgeId);
    const uid = await resolveUser(username);
    let fresh = false;
    await store.transaction(`userAchievements/${uid}/${badgeId}`, (cur) => { fresh = cur === null; return fresh ? { unlockedAt: clock(), source: "admin", by: adminUid } : undefined; });
    if (!fresh) throw new ApiError("Ese usuario ya tiene esa insignia.", 409);
    await audit(adminUid, "badge_granted", { username: username.toLowerCase(), badgeId, name });
    await tell(uid, `ach:${uid}:${badgeId}`, "badges", "¡Insignia recibida!", name, "/coleccion");
    await addActivity?.(uid, `recibió la insignia «${name}»`, "🏅");
  }
  async function revokeBadge(adminUid: string, username: string, badgeId: string) {
    const name = await badgeName(badgeId);
    const uid = await resolveUser(username);
    await store.set(`userAchievements/${uid}/${badgeId}`, null);
    await audit(adminUid, "badge_revoked", { username: username.toLowerCase(), badgeId, name });
  }
  async function deleteBadge(adminUid: string, badgeId: string) {
    if (ACHIEVEMENTS.some((a) => a.id === badgeId)) throw new ApiError("Las insignias del sistema no se pueden eliminar.", 400);
    const name = await badgeName(badgeId);
    await store.set(`customBadges/${badgeId}`, null);
    await audit(adminUid, "badge_deleted", { badgeId, name });
  }

  return { overview, setFeature, setGameConfig, searchUsers, userDetail, suspend, unsuspend, grantBonus, moderateProfile, createReport, listReports, resolveReport, createBadge, listBadges, grantBadge, revokeBadge, deleteBadge, audit: (n = 60) => listAudit(store, n) };
}
