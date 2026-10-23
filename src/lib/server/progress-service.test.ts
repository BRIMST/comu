import { beforeEach, describe, expect, it } from "vitest";
import { createChallengeService } from "./challenge-service";
import { createCommunityService } from "./community-service";
import { createMemoryStore } from "./memory-store";
import { createProfileService } from "./profile-service";
import { createProgressService } from "./progress-service";
import { createRankingService } from "./ranking-service";
import { createShopService } from "./shop-service";
import { PLAY_WINDOW_MS } from "../domain/challenges";
import { DAILY_COIN_CAP, DAILY_XP_CAP, applyEvent, dayKey, emptyStats, missionsFor, weekKey } from "../domain/progress";

const DAY = 86_400_000;
let t = Date.UTC(2026, 9, 14, 15, 0, 0); // miércoles 14 oct 2026, 10:00 en Colombia
const clock = () => t;
beforeEach(() => { t = Date.UTC(2026, 9, 14, 15, 0, 0); });

function world(users: Record<string, { name: string; balance?: number; level?: number; xp?: number }> = { A: { name: "ana", balance: 100 }, B: { name: "beto", balance: 100 }, C: { name: "carla", balance: 100 } }) {
  const data: Record<string, Record<string, unknown>> = { usernames: {}, publicProfiles: {}, profiles: {}, users: {}, wallets: {} };
  for (const [uid, u] of Object.entries(users)) {
    data.usernames![u.name] = { uid, username: u.name };
    data.publicProfiles![uid] = { uid, username: u.name, avatar: "🎮", level: u.level ?? 1, xp: u.xp ?? 0 };
    data.profiles![uid] = { uid, username: u.name, displayName: u.name, avatar: "🎮", bio: "Nuevo miembro del Refugio", level: u.level ?? 1, xp: u.xp ?? 0, joinedAt: t - 10 * DAY };
    data.users![uid] = { uid, role: "member" };
    data.wallets![uid] = { balance: u.balance ?? 0, updatedAt: 0 };
  }
  const store = createMemoryStore(data);
  const community = createCommunityService({ store, clock });
  const progress = createProgressService({ store, clock, notify: community.notify });
  return {
    store, community, progress,
    profiles: createProfileService({ store, progress }),
    shop: createShopService({ store, progress, clock }),
    ranking: createRankingService({ store, progress, clock }),
    challenges: createChallengeService({ store, clock, notify: community.notify, onResult: (uid, e) => progress.recordEvent(uid, { type: "challenge", ...e }).then(() => undefined) }),
  };
}
const game = (key: string, valid = true, g: "memoria" | "trivia" | "reflejos" = "trivia", extra: { reactionMs?: number } = {}) => ({ type: "game" as const, key, game: g, valid, score: valid ? 100 : 0, ...extra });
const ledger = async (w: ReturnType<typeof world>, uid: string) => Object.entries((await w.store.get<Record<string, { amount: number; type: string }>>(`walletTransactions/${uid}`)) ?? {});
const balance = async (w: ReturnType<typeof world>, uid: string) => (await w.store.get<{ balance: number }>(`wallets/${uid}`))!.balance;

describe("fechas (hora de Colombia)", () => {
  it("el día cambia a medianoche local, no UTC", () => {
    expect(dayKey(Date.UTC(2026, 9, 15, 4, 59))).toBe("2026-10-14"); // 23:59 en Bogotá
    expect(dayKey(Date.UTC(2026, 9, 15, 5, 0))).toBe("2026-10-15");
  });
  it("semana ISO lunes-domingo", () => {
    expect(weekKey(Date.UTC(2026, 9, 12, 12))).toBe("2026-W42"); // lunes
    expect(weekKey(Date.UTC(2026, 9, 18, 12))).toBe("2026-W42"); // domingo
    expect(weekKey(Date.UTC(2026, 9, 19, 12))).toBe("2026-W43");
    expect(weekKey(Date.UTC(2026, 11, 31, 12))).toBe("2026-W53");
    expect(weekKey(Date.UTC(2027, 0, 1, 12))).toBe("2026-W53");
  });
  it("misiones deterministas: mismas para todos el mismo día", () => {
    expect(missionsFor("daily", "2026-10-14").map((m) => m.id)).toEqual(missionsFor("daily", "2026-10-14").map((m) => m.id));
    expect(missionsFor("daily", "2026-10-14")).toHaveLength(3);
    expect(missionsFor("weekly", "2026-W42")).toHaveLength(3);
  });
});

describe("racha (puro)", () => {
  it("suma días consecutivos, reinicia tras un hueco y no cuenta dos veces el mismo día", () => {
    const e = { type: "vote" as const, key: "k" };
    let s = applyEvent(emptyStats(), e, "2026-10-14").stats;
    expect(s.currentStreak).toBe(1);
    const same = applyEvent(s, e, "2026-10-14"); expect(same.newDay).toBe(false); expect(same.stats.currentStreak).toBe(1);
    s = applyEvent(s, e, "2026-10-15").stats; expect(s.currentStreak).toBe(2);
    s = applyEvent(s, e, "2026-10-18").stats; expect(s.currentStreak).toBe(1); expect(s.longestStreak).toBe(2); expect(s.activeDays).toBe(3);
  });
});

describe("eventos, topes y recompensas", () => {
  it("un evento repetido no suma dos veces", async () => {
    const w = world();
    await Promise.all([w.progress.recordEvent("A", game("s1")), w.progress.recordEvent("A", game("s1")), w.progress.recordEvent("A", game("s1"))]);
    const v = await w.progress.view("A");
    expect(v.xp).toBeGreaterThan(0);
    const once = v.xp;
    await w.progress.recordEvent("A", game("s1"));
    expect((await w.progress.view("A")).xp).toBe(once);
    expect((await ledger(w, "A")).filter(([k]) => k === "game:s1")).toHaveLength(1);
  });
  it("las partidas no válidas no dan XP ni monedas", async () => {
    const w = world();
    await w.progress.recordEvent("A", game("bad", false, "memoria"));
    const v = await w.progress.view("A");
    expect(v.history.filter((h) => h.reason.startsWith("Partida"))).toHaveLength(0);
    expect(await balance(w, "A")).toBe(100);
  });
  it("respeta los topes diarios de XP y monedas por partidas", async () => {
    const w = world();
    for (let i = 0; i < 60; i++) await w.progress.recordEvent("A", game(`g${i}`, true, i % 2 ? "trivia" : "memoria"));
    const caps = (await w.progress.view("A")).caps;
    expect(caps.xpUsed).toBeLessThanOrEqual(DAILY_XP_CAP);
    expect(caps.coinsUsed).toBeLessThanOrEqual(DAILY_COIN_CAP);
    expect(caps.xpUsed).toBe(DAILY_XP_CAP);
    const gameCoins = (await ledger(w, "A")).filter(([, e]) => e.type === "game_reward").reduce((a, [, e]) => a + e.amount, 0);
    expect(gameCoins).toBeLessThanOrEqual(DAILY_COIN_CAP);
    // al día siguiente se renueva
    t += DAY;
    await w.progress.recordEvent("A", game("nextday"));
    expect((await w.progress.view("A")).caps.xpUsed).toBeGreaterThan(0);
  });
});

describe("misiones y rachas", () => {
  it("una misión se completa una sola vez y paga una sola vez", async () => {
    const w = world();
    for (let i = 0; i < 40; i++) await w.progress.recordEvent("A", game(`m${i}`, true, i % 2 ? "trivia" : "memoria"));
    const v = await w.progress.view("A");
    const done = v.missions.daily.filter((m) => m.done);
    expect(done.length).toBeGreaterThan(0);
    for (const m of done) {
      const day = dayKey(t);
      expect((await ledger(w, "A")).filter(([k]) => k === `mission:${day}:${m.id}`)).toHaveLength(1);
    }
    expect(v.missions.daily.every((m) => m.progress <= m.target)).toBe(true);
  });
  it("la racha de 3 días da bono una sola vez y avisa", async () => {
    const w = world();
    for (let d = 0; d < 3; d++) { await w.progress.recordEvent("A", { type: "vote", key: `v${d}` }); t += DAY; }
    const v = await w.progress.view("A");
    expect(v.streak.current).toBe(3);
    expect(v.history.filter((h) => h.reason === "Racha de 3 días")).toHaveLength(1);
    t -= DAY; await w.progress.recordEvent("A", { type: "vote", key: "extra" });
    expect((await w.progress.view("A")).history.filter((h) => h.reason === "Racha de 3 días")).toHaveLength(1);
  });
  it("la racha se pierde si pasa un día sin actividad", async () => {
    const w = world();
    await w.progress.recordEvent("A", { type: "vote", key: "v1" });
    t += 3 * DAY;
    expect((await w.progress.view("A")).streak.current).toBe(0);
  });
});

describe("insignias", () => {
  it("se desbloquean una vez, dan XP, avisan y quedan en la actividad pública", async () => {
    const w = world();
    await Promise.all([w.progress.recordEvent("A", game("a1")), w.progress.recordEvent("A", game("a2"))]);
    const v = await w.progress.view("A");
    expect(v.achievements.find((a) => a.id === "first_game")!.unlocked).toBe(true);
    const notes = (await w.community.listNotifications("A")).notifications.filter((n) => n.title === "¡Insignia desbloqueada!");
    expect(notes.map((n) => n.body).filter((b) => b.includes("Espíritu arcade"))).toHaveLength(1);
    const pub = await w.profiles.publicView("ana", null);
    expect(pub.badges!.map((b) => b.id)).toContain("first_game");
  });
  it("«Mente afilada» desbloquea un título de la colección", async () => {
    const w = world();
    for (let i = 0; i < 10; i++) await w.progress.recordEvent("A", game(`t${i}`));
    const cat = await w.shop.catalog("A");
    expect(cat.items.find((i) => i.id === "title_mind")!.owned).toBe(true);
  });
});

describe("retos → progreso", () => {
  it("cada jugador suma estadística de victoria/derrota una sola vez y el ranking de victorias cuenta", async () => {
    const w = world();
    const c = await w.challenges.create("A", { opponent: "beto", game: "trivia", stake: 10 });
    await w.challenges.accept("B", c.id);
    await w.challenges.start("A", c.id);
    t += 3000;
    const sec = await w.store.get<{ questions: { answer: number }[] }>(`challengeSecrets/${c.id}`);
    await w.challenges.submit("A", c.id, sec!.questions.map((q) => q.answer));
    t += PLAY_WINDOW_MS;
    await Promise.all([w.challenges.refresh(c.id), w.challenges.refresh(c.id), w.challenges.detail("B", c.id)]);
    const [pa, pb] = await Promise.all([w.profiles.publicView("ana", "A"), w.profiles.publicView("beto", "B")]);
    expect(pa.stats!.wins).toBe(1); expect(pa.stats!.losses).toBe(0);
    expect(pb.stats!.losses).toBe(1); expect(pb.stats!.wins).toBe(0);
    const wins = await w.ranking.ranking("wins");
    expect(wins.entries!.map((e) => [e.username, e.value])).toEqual([["ana", 1]]);
  });
});

describe("privacidad del perfil y ranking", () => {
  it("quien oculta estadísticas/insignias/actividad deja de mostrarlas a los demás, pero el dueño las ve", async () => {
    const w = world();
    await w.progress.recordEvent("A", game("p1"));
    await w.profiles.update("A", { displayName: "Ana", bio: "Hola", avatar: "🦊", showInRanking: true, showActivity: false, showStats: false, showBadges: false });
    const other = await w.profiles.publicView("ana", "B");
    expect(other.stats).toBeNull(); expect(other.badges).toBeNull(); expect(other.activity).toBeNull(); expect(other.privacy).toBeUndefined();
    const owner = await w.profiles.publicView("ana", "A");
    expect(owner.stats).not.toBeNull(); expect(owner.badges).not.toBeNull(); expect(owner.privacy!.showStats).toBe(false);
  });
  it("completar el perfil dispara la insignia «Primeros pasos»", async () => {
    const w = world();
    await w.profiles.update("A", { displayName: "Ana", bio: "Me gusta jugar", avatar: "🦊", showInRanking: true, showActivity: true, showStats: true, showBadges: true });
    expect((await w.progress.view("A")).achievements.find((a) => a.id === "first_steps")!.unlocked).toBe(true);
  });
  it("valida los datos del perfil", async () => {
    const w = world();
    await expect(w.profiles.update("A", { displayName: "A", bio: "", avatar: "x" })).rejects.toThrow();
    await expect(w.profiles.update("A", { displayName: "Ana", bio: "x".repeat(200), avatar: "x" })).rejects.toThrow();
    await expect(w.profiles.publicView("nadie", null)).rejects.toThrow("no encontrado");
  });
  it("quien oculta su perfil no aparece en el ranking público", async () => {
    const w = world();
    await w.progress.recordEvent("A", game("r1")); await w.progress.recordEvent("B", game("r2"));
    await w.profiles.update("B", { displayName: "Beto", bio: "", avatar: "🎮", showInRanking: false, showActivity: true, showStats: true, showBadges: true });
    const r = await w.ranking.ranking("weekly");
    expect(r.entries!.map((e) => e.username)).toEqual(["ana"]);
    expect((await w.ranking.ranking("alltime")).entries!.map((e) => e.username)).toEqual(["ana"]);
  });
  it("mejores reflejos: gana el tiempo más bajo", async () => {
    const w = world();
    await w.progress.recordEvent("A", game("x1", true, "reflejos", { reactionMs: 310 }));
    await w.progress.recordEvent("B", game("x2", true, "reflejos", { reactionMs: 240 }));
    await w.progress.recordEvent("B", game("x3", true, "reflejos", { reactionMs: 400 })); // no empeora su récord
    const r = await w.ranking.ranking("reaction");
    expect(r.entries!.map((e) => [e.username, e.value])).toEqual([["beto", 240], ["ana", 310]]);
    expect((await w.progress.view("B")).achievements.find((a) => a.id === "quick_reflexes")!.unlocked).toBe(true);
  });
});

describe("ranking semanal sin borrar históricos", () => {
  it("la semana nueva empieza vacía, el histórico se conserva y el campeón se congela una sola vez", async () => {
    const w = world();
    await w.progress.recordEvent("A", game("w1")); await w.progress.recordEvent("A", game("w2")); await w.progress.recordEvent("B", game("w3"));
    const before = await w.ranking.ranking("weekly");
    expect(before.entries![0]!.username).toBe("ana");
    t += 7 * DAY;
    expect((await w.ranking.ranking("weekly")).entries).toHaveLength(0);
    expect((await w.ranking.ranking("alltime")).entries!.length).toBe(2);
    const ch = await w.ranking.ranking("champions");
    expect(ch.weeks![0]!.top[0]!.username).toBe("ana");
    await w.ranking.ranking("champions"); await w.ranking.ensureChampions();
    const v = await w.progress.view("A");
    expect(v.achievements.find((a) => a.id === "weekly_champion")!.unlocked).toBe(true);
    expect((await w.store.get<{ weeklyTitles: number }>("playerStats/A"))!.weeklyTitles).toBe(1);
    expect((await w.shop.catalog("A")).items.find((i) => i.id === "title_champion")!.owned).toBe(true);
  });
});

describe("colección", () => {
  it("comprar descuenta una sola vez aunque se repita en paralelo", async () => {
    const w = world({ A: { name: "ana", balance: 500 } });
    await Promise.allSettled([w.shop.buy("A", "frame_neon"), w.shop.buy("A", "frame_neon"), w.shop.buy("A", "frame_neon")]);
    expect(await balance(w, "A")).toBe(400);
    expect((await w.shop.catalog("A")).items.find((i) => i.id === "frame_neon")!.owned).toBe(true);
    await expect(w.shop.buy("A", "frame_neon")).rejects.toThrow("Ya tienes");
  });
  it("no deja comprar sin saldo, con nivel insuficiente ni elementos de insignia", async () => {
    const w = world({ A: { name: "ana", balance: 20 } });
    await expect(w.shop.buy("A", "frame_neon")).rejects.toThrow("monedas suficientes");
    expect(await balance(w, "A")).toBe(20);
    await expect(w.shop.buy("A", "frame_gold")).rejects.toThrow("nivel 5");
    await expect(w.shop.buy("A", "title_duelist")).rejects.toThrow("insignia");
    await expect(w.shop.buy("A", "inexistente")).rejects.toThrow("no encontrado");
  });
  it("solo se equipa lo que se tiene, en su ranura, y se refleja en el perfil", async () => {
    const w = world({ A: { name: "ana", balance: 500 } });
    await expect(w.shop.equip("A", "frame", "frame_neon")).rejects.toThrow("Todavía no");
    await expect(w.shop.equip("A", "theme", "frame_none")).rejects.toThrow();
    await w.shop.buy("A", "frame_neon");
    await w.shop.equip("A", "frame", "frame_neon");
    expect((await w.profiles.publicView("ana", null)).equipped.frame).toBe("frame_neon");
    await w.shop.equip("A", "frame", null);
    expect((await w.profiles.publicView("ana", null)).equipped.frame).toBe("frame_none");
  });
  it("reúne 3 elementos y desbloquea «Coleccionista»", async () => {
    const w = world({ A: { name: "ana", balance: 1000 } });
    for (const id of ["frame_neon", "frame_violet", "title_explorer"]) await w.shop.buy("A", id);
    expect((await w.progress.view("A")).achievements.find((a) => a.id === "collector")!.unlocked).toBe(true);
  });
  it("el total de monedas se conserva en compras (solo salen del sistema por la compra)", async () => {
    const w = world({ A: { name: "ana", balance: 300 } });
    await w.shop.buy("A", "theme_aurora");
    const entries = await ledger(w, "A");
    expect(entries.find(([k]) => k === "shop:A:theme_aurora")![1].amount).toBe(-200);
    expect(await balance(w, "A")).toBe(100);
  });
});
