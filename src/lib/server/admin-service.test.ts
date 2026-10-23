import { beforeEach, describe, expect, it } from "vitest";
import { createAccountService, assertRecentAuth } from "./account-service";
import { createAdminService, type AuthAdmin } from "./admin-service";
import { createChallengeService } from "./challenge-service";
import { createCommunityService } from "./community-service";
import { createDonationService } from "./donation-service";
import { createMemoryStore } from "./memory-store";
import { createProfileService } from "./profile-service";
import { createProgressService } from "./progress-service";
import { createShopService } from "./shop-service";
import { listAudit } from "./audit";
import { metricsSummary } from "./metrics";
import { assertFeature } from "./settings";

let t = Date.UTC(2026, 9, 20, 15, 0, 0);
const clock = () => t;
beforeEach(() => { t = Date.UTC(2026, 9, 20, 15, 0, 0); });

function world() {
  const people: Record<string, { name: string; role?: string; balance?: number }> = { ADM: { name: "root", role: "admin", balance: 0 }, A: { name: "ana", balance: 100 }, B: { name: "beto", balance: 100 }, C: { name: "carla", balance: 100 } };
  const d: Record<string, Record<string, unknown>> = { usernames: {}, publicProfiles: {}, profiles: {}, users: {}, wallets: {} };
  for (const [uid, p] of Object.entries(people)) {
    d.usernames![p.name] = { uid, username: p.name };
    d.publicProfiles![uid] = { uid, username: p.name, avatar: "🎮", showInRanking: true };
    d.profiles![uid] = { uid, username: p.name, displayName: p.name, avatar: "🦊", bio: "mala palabra", xp: 0, level: 1, joinedAt: t, privacy: { showActivity: true } };
    d.users![uid] = { uid, role: p.role ?? "member", email: `${p.name}@x.co` };
    d.wallets![uid] = { balance: p.balance ?? 0, updatedAt: 0 };
  }
  const store = createMemoryStore(d);
  const calls: string[] = [];
  const auth: AuthAdmin = {
    setDisabled: async (uid, v) => { calls.push(`disabled:${uid}:${v}`); },
    revokeSessions: async (uid) => { calls.push(`revoke:${uid}`); },
    deleteUser: async (uid) => { calls.push(`delete:${uid}`); },
  };
  const community = createCommunityService({ store, clock });
  const progress = createProgressService({ store, clock, notify: community.notify });
  const admin = createAdminService({ store, auth, clock, notify: community.notify, addActivity: progress.addActivity });
  const challenges = createChallengeService({ store, clock, notify: community.notify, onResult: (uid, e) => progress.recordEvent(uid, { type: "challenge", ...e }).then(() => undefined) });
  return {
    store, calls, auth, admin, community, progress, challenges,
    profiles: createProfileService({ store, progress }), shop: createShopService({ store, progress, clock }),
    account: createAccountService({ store, auth, clock }),
    donations: createDonationService({ store, config: { provider: "manual" }, clock, notify: community.notify }),
  };
}
const balance = async (w: ReturnType<typeof world>, uid: string) => (await w.store.get<{ balance: number }>(`wallets/${uid}`))!.balance;
const game = (key: string, g: "memoria" | "trivia" | "reflejos" = "trivia") => ({ type: "game" as const, key, game: g, valid: true, score: 100 });

describe("interruptores de funciones", () => {
  it("apagar los retos bloquea crear, aceptar y jugar; encenderlos los reactiva; queda auditado", async () => {
    const w = world();
    await w.admin.setFeature("ADM", "challenges", false, "Sospecha de fraude");
    await expect(w.challenges.create("A", { opponent: "beto", game: "memoria", stake: 5 })).rejects.toThrow("desactivada");
    t += 1000;
    await w.admin.setFeature("ADM", "challenges", true, "Revisado, todo en orden");
    await expect(w.challenges.create("A", { opponent: "beto", game: "memoria", stake: 5 })).resolves.toBeTruthy();
    const log = await listAudit(w.store);
    expect(log.map((l) => l.action)).toEqual(["feature_enabled", "feature_disabled"]);
    expect(log[0]!.admin).toBe("root");
  });
  it("apagar la colección bloquea compras y apagar registros bloquea el alta", async () => {
    const w = world();
    await w.admin.setFeature("ADM", "shop", false, "Mantenimiento de catálogo");
    await expect(w.shop.buy("A", "frame_neon")).rejects.toThrow("desactivada");
    await w.admin.setFeature("ADM", "registrations", false, "Ola de cuentas falsas");
    await expect(assertFeature(w.store, "registrations")).rejects.toThrow("desactivada");
    await expect(w.admin.setFeature("ADM", "inventada", false, "motivo válido")).rejects.toThrow("no válida");
    await expect(w.admin.setFeature("ADM", "shop", true, "x")).rejects.toThrow("motivo");
  });
});

describe("configuración de minijuegos", () => {
  it("cambia las recompensas, respeta los límites y puede desactivar un juego", async () => {
    const w = world();
    await w.admin.setGameConfig("ADM", { game: "trivia", enabled: true, xp: 30, coins: 20 });
    const r = await w.progress.recordEvent("A", game("g1"));
    expect(r.xp).toBe(30); expect(r.coins).toBe(20);
    await expect(w.admin.setGameConfig("ADM", { game: "trivia", enabled: true, xp: 999, coins: 1 })).rejects.toThrow();
    await expect(w.admin.setGameConfig("ADM", { game: "ajedrez", enabled: true, xp: 1, coins: 1 })).rejects.toThrow();
    await w.admin.setGameConfig("ADM", { game: "memoria", enabled: false, xp: 10, coins: 5 });
    const off = await w.progress.recordEvent("A", game("g2", "memoria"));
    expect(off.xp + off.coins).toBe(0);
  });
});

describe("usuarios: suspensión y bonificaciones", () => {
  it("suspender deshabilita la cuenta, cierra sesiones, marca el flag y no deja suspender admins ni a uno mismo", async () => {
    const w = world();
    await w.admin.suspend("ADM", "beto", "Trampas repetidas en retos");
    expect(w.calls).toEqual(["disabled:B:true", "revoke:B"]);
    expect((await w.admin.userDetail("beto")).suspended).toBe(true);
    await expect(w.challenges.create("B", { opponent: "ana", game: "memoria", stake: 5 })).rejects.toThrow("suspendida");
    await expect(w.admin.suspend("ADM", "root", "motivo válido")).rejects.toThrow("ti mismo");
    await expect(w.admin.suspend("ADM", "ana", "x")).rejects.toThrow("motivo");
    await w.store.set("users/C/role", "admin");
    await expect(w.admin.suspend("ADM", "carla", "motivo válido")).rejects.toThrow("administrador");
    await w.admin.unsuspend("ADM", "beto");
    expect(w.calls.slice(-1)).toEqual(["disabled:B:false"]);
    expect((await w.admin.userDetail("beto")).suspended).toBe(false);
  });
  it("las bonificaciones quedan en el libro, avisan al usuario, tienen tope y se auditan", async () => {
    const w = world();
    await w.admin.grantBonus("ADM", "ana", { amount: 50, reason: "Participó en el live de estreno" });
    expect(await balance(w, "A")).toBe(150);
    const d = await w.admin.userDetail("ana");
    expect(d.ledger[0]).toMatchObject({ amount: 50, type: "admin_bonus" });
    expect((await w.community.listNotifications("A")).notifications.map((n) => n.title)).toContain("Bonificación recibida");
    await expect(w.admin.grantBonus("ADM", "ana", { amount: 5000, reason: "demasiado" })).rejects.toThrow();
    await expect(w.admin.grantBonus("ADM", "ana", { amount: 5, reason: "x" })).rejects.toThrow("motivo");
    for (let i = 0; i < 29; i++) await w.admin.grantBonus("ADM", "ana", { amount: 1, reason: "bonificación de prueba" });
    await expect(w.admin.grantBonus("ADM", "ana", { amount: 1, reason: "una más de la cuenta" })).rejects.toThrow("Demasiadas");
  });
  it("la búsqueda por prefijo devuelve cuentas con su estado, y el detalle no expone nada sin permiso de ruta", async () => {
    const w = world();
    expect((await w.admin.searchUsers("a")).length).toBe(0);
    expect((await w.admin.searchUsers("be")).map((u) => u.username)).toEqual(["beto"]);
    expect((await w.admin.userDetail("ana")).email).toBe("ana@x.co");
    await expect(w.admin.userDetail("nadie")).rejects.toThrow("No encontramos");
  });
  it("moderar el perfil restablece los campos elegidos, avisa y audita", async () => {
    const w = world();
    await expect(w.admin.moderateProfile("ADM", "ana", { reason: "bio ofensiva" })).rejects.toThrow();
    await w.admin.moderateProfile("ADM", "ana", { clearBio: true, resetAvatar: true, reason: "Bio ofensiva" });
    const p = await w.profiles.publicView("ana", null);
    expect(p.bio).toBe(""); expect(p.avatar).toBe("🎮");
    expect((await w.community.listNotifications("A")).notifications.map((n) => n.title)).toContain("Revisamos tu perfil");
  });
});

describe("reportes", () => {
  it("un usuario reporta, el administrador lo resuelve una sola vez, hay límites y deduplicación", async () => {
    const w = world();
    await w.admin.createReport("A", { username: "beto", reason: "trampa", detail: "Resultados imposibles" });
    await expect(w.admin.createReport("A", { username: "beto", reason: "spam" })).rejects.toThrow("hoy");
    await expect(w.admin.createReport("A", { username: "ana", reason: "spam" })).rejects.toThrow("ti mismo");
    await expect(w.admin.createReport("A", { username: "nadie", reason: "spam" })).rejects.toThrow("No encontramos");
    await expect(w.admin.createReport("A", { username: "carla", reason: "inventado" })).rejects.toThrow();
    const open = await w.admin.listReports();
    expect(open).toHaveLength(1); expect(open[0]).toMatchObject({ target: "beto", reporter: "ana", reason: "trampa" });
    await w.admin.resolveReport("ADM", open[0]!.id, "actioned", "Se suspendió la cuenta");
    await expect(w.admin.resolveReport("ADM", open[0]!.id, "dismissed", "Ya estaba resuelto")).rejects.toThrow("ya fue resuelto");
    expect(await w.admin.listReports()).toHaveLength(0);
    expect((await w.admin.listReports("all"))[0]!.status).toBe("actioned");
    expect((await w.admin.userDetail("beto")).reportsAgainst).toBe(1);
  });
  it("limita a 5 reportes por día por usuario", async () => {
    const w = world();
    for (const u of ["beto", "carla", "root"]) await w.admin.createReport("A", { username: u, reason: "spam" });
    await w.store.update({ "usernames/dani": { uid: "D", username: "dani" }, "usernames/eva": { uid: "E", username: "eva" }, "usernames/fido": { uid: "F", username: "fido" } });
    await w.admin.createReport("A", { username: "dani", reason: "spam" }); await w.admin.createReport("A", { username: "eva", reason: "spam" });
    await expect(w.admin.createReport("A", { username: "fido", reason: "spam" })).rejects.toThrow("Demasiadas");
  });
});

describe("insignias del equipo", () => {
  it("se crean, se otorgan una vez, aparecen en el perfil y se pueden retirar", async () => {
    const w = world();
    await w.admin.createBadge("ADM", { name: "Presente en el live", emoji: "🎥", desc: "Estuvo en el live de estreno" });
    const badge = (await w.admin.listBadges()).custom[0]!;
    await w.admin.grantBadge("ADM", "ana", badge.id);
    await expect(w.admin.grantBadge("ADM", "ana", badge.id)).rejects.toThrow("ya tiene");
    await w.admin.grantBadge("ADM", "ana", "first_game"); // también insignias del sistema
    const pub = await w.profiles.publicView("ana", null);
    expect(pub.badges!.map((b) => b.name)).toEqual(expect.arrayContaining(["Presente en el live", "Espíritu arcade"]));
    expect((await w.progress.view("A")).achievements.find((a) => a.id === badge.id)!.unlocked).toBe(true);
    expect((await w.community.listNotifications("A")).notifications.map((n) => n.title)).toContain("¡Insignia recibida!");
    expect((await w.store.get<Record<string, unknown>>("communityFeed"))).not.toBeNull();
    await w.admin.revokeBadge("ADM", "ana", badge.id);
    expect((await w.profiles.publicView("ana", null)).badges!.map((b) => b.id)).not.toContain(badge.id);
    await expect(w.admin.deleteBadge("ADM", "first_game")).rejects.toThrow("sistema");
    await w.admin.deleteBadge("ADM", badge.id);
    await expect(w.admin.grantBadge("ADM", "ana", badge.id)).rejects.toThrow("no encontrada");
  });
});

describe("métricas y auditoría", () => {
  it("los contadores agregados suben con la actividad real (sin datos personales)", async () => {
    const w = world();
    await w.progress.recordEvent("A", game("m1")); await w.progress.recordEvent("A", game("m2")); await w.progress.recordEvent("B", { type: "vote", key: "v1" });
    const c = await w.challenges.create("A", { opponent: "beto", game: "memoria", stake: 5 });
    await w.admin.createReport("B", { username: "ana", reason: "spam" });
    const m = await metricsSummary(w.store, t);
    expect(m.totals).toMatchObject({ games_played: 2, games_valid: 2, votes: 1, active_users: 2, challenges_created: 1, reports: 1 });
    expect(m.days.at(-1)).toMatchObject({ games_played: 2 });
    expect(m.days).toHaveLength(14);
    expect(JSON.stringify(m)).not.toMatch(/ana|beto|uid/i);
    void c;
    const o = await w.admin.overview();
    expect(o.openReports).toBe(1); expect(o.features.games).toBe(true);
  });
  it("el registro de auditoría es global, cronológico y de solo lectura desde el cliente", async () => {
    const w = world();
    await w.admin.setFeature("ADM", "games", false, "Prueba de auditoría");
    t += 1000; await w.admin.suspend("ADM", "beto", "Motivo suficiente aquí");
    const log = await w.admin.audit();
    expect(log.map((l) => l.action)).toEqual(["user_suspended", "feature_disabled"]);
    expect(log[0]).toMatchObject({ admin: "root", username: "beto" });
  });
});

describe("eliminación y exportación de cuenta", () => {
  it("recencia de la autenticación y misma cuenta", () => {
    expect(() => assertRecentAuth({ uid: "A", auth_time: t / 1000 - 60 }, "A", t)).not.toThrow();
    expect(() => assertRecentAuth({ uid: "A", auth_time: t / 1000 - 3600 }, "A", t)).toThrow("confirma tu contraseña");
    expect(() => assertRecentAuth({ uid: "B", auth_time: t / 1000 }, "A", t)).toThrow("no corresponde");
    expect(() => assertRecentAuth({ uid: "A" }, "A", t)).toThrow();
  });
  it("no permite eliminar con retos en curso ni con confirmación equivocada", async () => {
    const w = world();
    await w.challenges.create("A", { opponent: "beto", game: "memoria", stake: 5 });
    await expect(w.account.deleteAccount("A", "ana")).rejects.toThrow("en curso");
    await expect(w.account.deleteAccount("A", "otro")).rejects.toThrow("no coincide");
    expect(w.calls).toEqual([]);
  });
  it("borra los datos personales, libera el nombre, anonimiza retos y donaciones y elimina la cuenta de acceso", async () => {
    const w = world();
    // actividad: partida, reto terminado (empate sin jugar), donación manual con agradecimiento público
    await w.progress.recordEvent("A", game("x1"));
    const c = await w.challenges.create("A", { opponent: "beto", game: "memoria", stake: 5 });
    await w.challenges.cancel("A", c.id);
    await w.donations.recordManual("ADM", { username: "ana", amountCOP: 20_000, reference: "T-1", thanksName: "Ana la generosa" });
    await w.admin.createReport("A", { username: "beto", reason: "spam" });
    await w.admin.grantBadge("ADM", "ana", "first_steps");
    await w.account.deleteAccount("A", "ana");
    expect(w.calls).toEqual(["delete:A"]);
    for (const path of ["users/A", "profiles/A", "publicProfiles/A", "usernames/ana", "wallets/A", "walletTransactions/A", "userAchievements/A", "playerStats/A", "xpLog/A", "activity/A", "notifications/A", "userChallenges/A", "userDonations/A", "leaderboards/alltime/A"]) {
      expect(await w.store.get(path), path).toBeNull();
    }
    expect(await w.store.get("deletedAccounts/A")).toMatchObject({ deletedAt: t });
    const feed = await w.store.get<Record<string, { uid: string }>>("communityFeed");
    expect(Object.values(feed ?? {}).some((f) => f.uid === "A")).toBe(false);
    const ch = await w.store.get<{ challengerName: string; challengerUid: string }>(`challenges/${c.id}`);
    expect(ch!.challengerName).toBe("usuario eliminado");
    const donations = await w.store.get<Record<string, { uid: string | null; thanks: unknown; amountCOP: number }>>("donations");
    const d = Object.values(donations!)[0]!;
    expect(d.uid ?? null).toBeNull(); expect(d.thanks ?? null).toBeNull(); expect(d.amountCOP).toBe(20_000); // el registro contable se conserva
    expect(await w.store.get("donationThanks")).toBeNull();
    const reports = await w.store.get<Record<string, { reporterUid: string }>>("reports");
    expect(Object.values(reports!)[0]!.reporterUid).toBe("deleted");
    await w.account.deleteAccount("A", "ana").catch(() => {}); // reintentar no rompe
    expect(JSON.stringify(await w.store.get("usernames"))).not.toContain("ana");
  });
  it("exportar devuelve los datos propios y ninguno ajeno", async () => {
    const w = world();
    await w.progress.recordEvent("A", game("e1"));
    await w.admin.suspend("ADM", "ana", "Motivo para la prueba");
    const x = await w.account.exportData("A");
    expect(x.account).toMatchObject({ email: "ana@x.co" });
    expect(JSON.stringify(x)).not.toContain("Motivo para la prueba"); // notas internas de moderación no se exportan
    expect(JSON.stringify(x)).not.toContain("beto@x.co");
    expect(Object.keys(x.walletTransactions[0] ?? {})).toContain("amount");
  });
});
