import type { Notifier } from "../domain/community";
import {
  ACHIEVEMENTS, DAILY_COIN_CAP, DAILY_XP_CAP, STREAK_MILESTONES, applyEvent, baseReward, dayKey, emptyStats, itemById, kindsOf,
  levelForXp, missionsFor, weekKey, type MissionDef, type ProgressEvent, type Stats,
} from "../domain/progress";
import { levelProgress } from "../domain/progression";
import { bump } from "./metrics";
import { getGameConfig } from "./settings";
import type { Store } from "./store";
import { applyWalletOp } from "./wallet";

type Profile = { username?: string; xp?: number; level?: number; [k: string]: unknown };
type Deps = { store: Store; clock?: () => number; notify?: Notifier };

export function createProgressService({ store, clock = Date.now, notify }: Deps) {
  const tell: Notifier = async (...a) => { try { await notify?.(...a); } catch { /* las notificaciones nunca rompen el progreso */ } };

  /** Reclama una clave una sola vez (idempotencia). */
  async function claim(path: string): Promise<boolean> {
    let ok = false;
    const now = clock();
    await store.transaction(path, (cur) => { if (cur === null) { ok = true; return { at: now }; } ok = false; return undefined; });
    return ok;
  }

  /** Actividad pública: va al perfil del jugador y, si no la ocultó, al feed de la comunidad. */
  async function addActivity(uid: string, text: string, icon: string) {
    const now = clock();
    const key = `${now}-${store.newKey("activity").slice(-5)}`;
    const profile = await store.get<{ username?: string; privacy?: { showActivity?: boolean } }>(`profiles/${uid}`);
    const updates: Record<string, unknown> = { [`activity/${uid}/${key}`]: { text, icon, createdAt: now } };
    if (profile?.privacy?.showActivity !== false) updates[`communityFeed/${key}`] = { uid, username: profile?.username ?? uid.slice(0, 8), text, icon, createdAt: now };
    await store.update(updates);
  }

  /** Consume del tope diario (XP o monedas) y devuelve cuánto se puede conceder. */
  async function takeCap(uid: string, kind: "xp" | "coins", want: number): Promise<number> {
    if (want <= 0) return 0;
    const day = dayKey(clock());
    const cap = kind === "xp" ? DAILY_XP_CAP : DAILY_COIN_CAP;
    let granted = 0;
    await store.transaction<{ day: string; xp: number; coins: number }>(`dailyCaps/${uid}`, (cur) => {
      const base = cur && cur.day === day ? cur : { day, xp: 0, coins: 0 };
      granted = Math.max(0, Math.min(want, cap - base[kind]));
      return { ...base, [kind]: base[kind] + granted };
    });
    return granted;
  }

  async function bumpBoard(path: string, username: string, fn: (row: Record<string, number>) => Record<string, number>) {
    const now = clock();
    await store.transaction<Record<string, unknown>>(path, (row) => ({ ...fn((row ?? {}) as Record<string, number>), username, updatedAt: now }) as Record<string, unknown>);
  }

  /** Concede XP: sube nivel, actualiza el espejo público, el ranking y el historial. Solo se llama desde flujos ya reclamados. */
  async function grantXp(uid: string, amount: number, reason: string, capped = false): Promise<number> {
    const grant = capped ? await takeCap(uid, "xp", amount) : amount;
    if (grant <= 0) return 0;
    const now = clock();
    let exists = false, prevLevel = 1, newXp = 0, username = uid.slice(0, 8);
    await store.transaction<Profile>(`profiles/${uid}`, (p) => {
      if (p === null) { exists = false; return null; }
      exists = true; prevLevel = Number(p.level ?? 1); newXp = Number(p.xp ?? 0) + grant; username = String(p.username ?? username);
      return { ...p, xp: newXp, level: levelForXp(newXp), updatedAt: now };
    });
    if (!exists) return 0;
    const newLevel = levelForXp(newXp);
    await store.update({ [`publicProfiles/${uid}/xp`]: newXp, [`publicProfiles/${uid}/level`]: newLevel });
    await bumpBoard(`leaderboards/weekly/${weekKey(now)}/${uid}`, username, (r) => ({ ...r, xp: (r.xp ?? 0) + grant }));
    await bumpBoard(`leaderboards/alltime/${uid}`, username, (r) => ({ ...r, xp: (r.xp ?? 0) + grant }));
    await store.set(`xpLog/${uid}/${now}-${store.newKey("xpLog").slice(-5)}`, { amount: grant, reason, createdAt: now });
    if (newLevel > prevLevel) {
      await tell(uid, `lvl:${uid}:${newLevel}`, "levels", "¡Subiste de nivel!", `Ahora eres nivel ${newLevel}.`, "/progresion");
      await addActivity(uid, `alcanzó el nivel ${newLevel}`, "✨");
    }
    return grant;
  }

  async function grantCoins(uid: string, key: string, amount: number, type: string, desc: string, capped = false): Promise<number> {
    const grant = capped ? await takeCap(uid, "coins", amount) : amount;
    if (grant <= 0) return 0;
    const res = await applyWalletOp(store, uid, key, grant, type, desc, {}, clock());
    return res === "applied" ? grant : 0;
  }

  async function giveItem(uid: string, itemId: string, source: string) {
    const created = await claim(`inventory/${uid}/${itemId}`);
    if (!created) return;
    await store.set(`inventory/${uid}/${itemId}`, { acquiredAt: clock(), source });
    await store.transaction<Stats>(`playerStats/${uid}`, (s) => ({ ...emptyStats(), ...(s ?? {}), items: ((s?.items) ?? 0) + 1 }));
  }

  async function checkAchievements(uid: string, stats: Stats, level: number, username: string) {
    const owned = (await store.get<Record<string, unknown>>(`userAchievements/${uid}`)) ?? {};
    for (const a of ACHIEVEMENTS) {
      if (owned[a.id] || !a.check(stats, level)) continue;
      let ok = false;
      await store.transaction(`userAchievements/${uid}/${a.id}`, (cur) => { if (cur === null) { ok = true; return { unlockedAt: clock() }; } ok = false; return undefined; });
      if (!ok) continue;
      await grantXp(uid, a.xp, `Insignia: ${a.name}`);
      if (a.unlocksItem) await giveItem(uid, a.unlocksItem, `achievement:${a.id}`);
      await tell(uid, `ach:${uid}:${a.id}`, "badges", "¡Insignia desbloqueada!", `${a.emoji} ${a.name}`, "/coleccion");
      await addActivity(uid, `desbloqueó la insignia «${a.name}»`, a.emoji);
    }
    void username;
  }

  async function advanceMission(uid: string, periodKey: string, m: MissionDef) {
    let completedNow = false;
    await store.transaction<{ progress: number; done: boolean }>(`missions/${uid}/${periodKey}/${m.id}`, (cur) => {
      if (cur !== null && cur.done) { completedNow = false; return undefined; }
      const progress = Math.min(m.target, (cur?.progress ?? 0) + 1);
      completedNow = progress >= m.target;
      return { progress, done: completedNow };
    });
    if (!completedNow) return;
    await grantXp(uid, m.xp, `Misión: ${m.title}`);
    await grantCoins(uid, `mission:${periodKey}:${m.id}`, m.coins, "mission_reward", `Misión completada: ${m.title}`);
    await tell(uid, `mission:${uid}:${periodKey}:${m.id}`, "missions", "¡Misión completada!", `${m.title}: +${m.xp} XP, +${m.coins} 🪙`, "/progresion");
  }

  /**
   * Punto único de entrada del progreso. Idempotente por `evt.key`: si el mismo evento llega dos veces
   * (reintentos, reanudación de un reto), no se repite nada. Nota: es "como máximo una vez" para XP y
   * estadísticas; las monedas usan además claves propias en el libro.
   */
  async function recordEvent(uid: string, evt: ProgressEvent) {
    if (!(await claim(`playerEvents/${uid}/${evt.key}`))) return { duplicate: true as const, xp: 0, coins: 0 };
    const now = clock();
    const day = dayKey(now);
    const profile = await store.get<Profile>(`profiles/${uid}`);
    const username = String(profile?.username ?? uid.slice(0, 8));

    let after: Stats = emptyStats(), before: Stats = emptyStats(), newDay = false;
    await store.transaction<Stats>(`playerStats/${uid}`, (cur) => {
      before = { ...emptyStats(), ...(cur ?? {}) };
      const r = applyEvent(before, evt, day);
      after = r.stats; newDay = r.newDay;
      return r.stats;
    });

    // recompensas base con tope diario
    const base = baseReward(evt, await getGameConfig(store));
    const xp = await grantXp(uid, base.xp, evt.type === "game" ? `Partida de ${evt.game}` : "Reto jugado", true);
    const coins = evt.type === "game" ? await grantCoins(uid, `game:${evt.key}`, base.coins, "game_reward", `Recompensa: ${evt.game}`, true) : 0;

    // métricas agregadas
    if (evt.type === "game") { await bump(store, now, "games_played"); if (evt.valid) await bump(store, now, "games_valid"); }
    if (evt.type === "vote") await bump(store, now, "votes");
    if (newDay) await bump(store, now, "active_users");

    // rachas
    if (newDay) {
      const bonus = STREAK_MILESTONES[after.currentStreak];
      if (bonus && (await claim(`playerEvents/${uid}/streak-${after.currentStreak}-${day}`))) {
        await grantXp(uid, bonus, `Racha de ${after.currentStreak} días`);
        await tell(uid, `streak:${uid}:${after.currentStreak}:${day}`, "missions", "¡Racha de actividad!", `${after.currentStreak} días seguidos: +${bonus} XP`, "/progresion");
      }
      await bumpBoard(`leaderboards/active/${uid}`, username, (r) => ({ ...r, days: after.activeDays, streak: after.longestStreak }));
    }

    // clasificaciones derivadas
    if (evt.type === "challenge" && evt.result === "win") {
      await bumpBoard(`leaderboards/wins/${uid}`, username, (r) => ({ ...r, wins: (r.wins ?? 0) + 1 }));
      await addActivity(uid, "ganó un reto", "🏆");
    }
    if (evt.type === "game" && evt.game === "reflejos" && evt.valid && evt.reactionMs !== undefined && evt.reactionMs === after.bestReaction && (before.bestReaction ?? Infinity) > evt.reactionMs) {
      await bumpBoard(`leaderboards/reaction/${uid}`, username, (r) => ({ ...r, ms: evt.reactionMs! }));
      await addActivity(uid, `batió su récord de reflejos: ${evt.reactionMs} ms`, "⚡");
    }

    // misiones
    const kinds = kindsOf(evt, newDay);
    const daily = missionsFor("daily", day), weekly = missionsFor("weekly", weekKey(now));
    for (const k of kinds) {
      for (const m of daily) if (m.kind === k) await advanceMission(uid, day, m);
      for (const m of weekly) if (m.kind === k) await advanceMission(uid, weekKey(now), m);
    }

    // insignias (el nivel puede haber cambiado)
    const level = Number((await store.get<Profile>(`profiles/${uid}`))?.level ?? 1);
    const fresh = (await store.get<Stats>(`playerStats/${uid}`)) ?? after;
    await checkAchievements(uid, { ...emptyStats(), ...fresh }, level, username);
    return { duplicate: false as const, xp, coins };
  }

  /** Vuelve a evaluar las insignias (p. ej. tras comprar un elemento o ganar un título semanal). */
  async function refreshAchievements(uid: string) {
    const st = { ...emptyStats(), ...((await store.get<Stats>(`playerStats/${uid}`)) ?? {}) };
    const level = Number((await store.get<Profile>(`profiles/${uid}`))?.level ?? 1);
    await checkAchievements(uid, st, level, "");
  }
  async function awardWeeklyChampion(uid: string) {
    await store.transaction<Stats>(`playerStats/${uid}`, (s) => ({ ...emptyStats(), ...(s ?? {}), weeklyTitles: (s?.weeklyTitles ?? 0) + 1 }));
    await refreshAchievements(uid);
  }

  /** Insignias creadas por el equipo que el usuario ya tiene. */
  async function customBadgesOf(ach: Record<string, { unlockedAt: number }>) {
    const ids = Object.keys(ach).filter((id) => !ACHIEVEMENTS.some((a) => a.id === id));
    if (!ids.length) return [];
    const defs = await Promise.all(ids.map((id) => store.get<{ name: string; emoji: string; desc: string }>(`customBadges/${id}`)));
    return ids.flatMap((id, i) => (defs[i] ? [{ id, ...defs[i]!, unlockedAt: ach[id]!.unlockedAt }] : []));
  }

  // ---------- vista de progreso ----------
  async function view(uid: string) {
    const now = clock(), day = dayKey(now), wk = weekKey(now);
    const [profile, stats, caps, ach, dailyP, weeklyP, xpLog] = await Promise.all([
      store.get<Profile>(`profiles/${uid}`),
      store.get<Stats>(`playerStats/${uid}`),
      store.get<{ day: string; xp: number; coins: number }>(`dailyCaps/${uid}`),
      store.get<Record<string, { unlockedAt: number }>>(`userAchievements/${uid}`),
      store.get<Record<string, { progress: number; done: boolean }>>(`missions/${uid}/${day}`),
      store.get<Record<string, { progress: number; done: boolean }>>(`missions/${uid}/${wk}`),
      store.list<{ amount: number; reason: string; createdAt: number }>(`xpLog/${uid}`, { orderBy: "createdAt", limitLast: 20 }),
    ]);
    const s: Stats = { ...emptyStats(), ...(stats ?? {}) };
    const xp = Number(profile?.xp ?? 0);
    const level = Number(profile?.level ?? levelForXp(xp));
    const lp = levelProgress(xp);
    const mv = (defs: MissionDef[], p: typeof dailyP) => defs.map((m) => ({ id: m.id, title: m.title, desc: m.desc, target: m.target, xp: m.xp, coins: m.coins, progress: p?.[m.id]?.progress ?? 0, done: p?.[m.id]?.done === true }));
    const today = caps && caps.day === day ? caps : { xp: 0, coins: 0 };
    return {
      level: lp.level, xp, levelProgress: lp,
      streak: { current: s.lastDay === day || s.lastDay === dayKey(now - 86_400_000) ? s.currentStreak : 0, longest: s.longestStreak, activeToday: s.lastDay === day },
      missions: { daily: mv(missionsFor("daily", day), dailyP), weekly: mv(missionsFor("weekly", wk), weeklyP) },
      achievements: [
        ...ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, emoji: a.emoji, xp: a.xp, unlocked: !!ach?.[a.id], unlockedAt: ach?.[a.id]?.unlockedAt ?? null, progress: a.progress(s, level), unlocksItem: a.unlocksItem ? itemById(a.unlocksItem)?.name ?? null : null })),
        ...(await customBadgesOf(ach ?? {})).map((b) => ({ id: b.id, name: b.name, desc: b.desc, emoji: b.emoji, xp: 0, unlocked: true, unlockedAt: b.unlockedAt, progress: { value: 1, target: 1 }, unlocksItem: null })),
      ],
      caps: { xpUsed: today.xp, xpMax: DAILY_XP_CAP, coinsUsed: today.coins, coinsMax: DAILY_COIN_CAP },
      history: xpLog.sort((a, b) => b.createdAt - a.createdAt).map((x) => ({ amount: x.amount, reason: x.reason, createdAt: x.createdAt })),
    };
  }

  return { recordEvent, awardWeeklyChampion, refreshAchievements, giveItem, view, grantXp, addActivity, customBadgesOf };
}
