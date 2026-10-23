import { GAME_DEFAULTS, type GameConfig, type GameId } from "./game-config";
import { levelForXp } from "./progression";

// ---------- tiempo (Colombia: UTC-5, sin horario de verano) ----------
export const TZ_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
export const dayKey = (ms: number) => new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
export function prevDayKey(day: string) { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
/** Semana ISO (lunes a domingo) en hora de Colombia. */
export function weekKey(ms: number): string {
  const d = new Date(ms + TZ_OFFSET_MS);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // jueves de esa semana
  const y = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / DAY_MS - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(week).padStart(2, "0")}`;
}
export const prevWeekKey = (ms: number) => weekKey(ms - 7 * DAY_MS);

// ---------- topes diarios ----------
export const DAILY_XP_CAP = 200;
export const DAILY_COIN_CAP = 100;

// ---------- eventos y estadísticas ----------
export type ProgressEvent =
  | { type: "game"; key: string; game: "memoria" | "trivia" | "reflejos"; valid: boolean; score: number; reactionMs?: number }
  | { type: "challenge"; key: string; game: string; result: "win" | "loss" | "draw" }
  | { type: "vote"; key: string }
  | { type: "profile_completed"; key: string };

export type Stats = {
  gamesPlayed: number; gamesValid: number; triviaValid: number; memoriaValid: number; reflejosValid: number;
  bestReaction?: number; bestMemoria?: number; bestTrivia?: number;
  challengesPlayed: number; challengesWon: number; challengesLost: number; challengesDrawn: number;
  votes: number; activeDays: number; currentStreak: number; longestStreak: number; lastDay?: string;
  profileCompleted: boolean; weeklyTitles: number; items: number;
};
export const emptyStats = (): Stats => ({
  gamesPlayed: 0, gamesValid: 0, triviaValid: 0, memoriaValid: 0, reflejosValid: 0,
  challengesPlayed: 0, challengesWon: 0, challengesLost: 0, challengesDrawn: 0,
  votes: 0, activeDays: 0, currentStreak: 0, longestStreak: 0, profileCompleted: false, weeklyTitles: 0, items: 0,
});

/** Aplica un evento a las estadísticas y actualiza la racha. Puro. */
export function applyEvent(prev: Stats, e: ProgressEvent, day: string): { stats: Stats; newDay: boolean } {
  const s: Stats = { ...emptyStats(), ...prev };
  let newDay = false;
  if (s.lastDay !== day) {
    newDay = true;
    s.currentStreak = s.lastDay === prevDayKey(day) ? s.currentStreak + 1 : 1;
    s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
    s.activeDays += 1;
    s.lastDay = day;
  }
  if (e.type === "game") {
    s.gamesPlayed++;
    if (e.valid) {
      s.gamesValid++;
      if (e.game === "trivia") { s.triviaValid++; s.bestTrivia = Math.max(s.bestTrivia ?? 0, e.score); }
      if (e.game === "memoria") { s.memoriaValid++; s.bestMemoria = Math.max(s.bestMemoria ?? 0, e.score); }
      if (e.game === "reflejos") { s.reflejosValid++; if (e.reactionMs !== undefined) s.bestReaction = Math.min(s.bestReaction ?? Infinity, e.reactionMs); }
    }
  } else if (e.type === "challenge") {
    s.challengesPlayed++;
    if (e.result === "win") s.challengesWon++; else if (e.result === "loss") s.challengesLost++; else s.challengesDrawn++;
  } else if (e.type === "vote") s.votes++;
  else if (e.type === "profile_completed") s.profileCompleted = true;
  return { stats: s, newDay };
}

// ---------- recompensas base (con tope diario) ----------
export function baseReward(e: ProgressEvent, cfg: Record<GameId, GameConfig> = GAME_DEFAULTS): { xp: number; coins: number } {
  if (e.type === "game") return e.valid && cfg[e.game].enabled ? { xp: cfg[e.game].xp, coins: cfg[e.game].coins } : { xp: 0, coins: 0 };
  if (e.type === "challenge") return { xp: e.result === "win" ? 20 : 10, coins: 0 }; // las monedas del reto ya se mueven entre jugadores
  return { xp: 0, coins: 0 };
}

export const STREAK_MILESTONES: Record<number, number> = { 3: 20, 7: 50, 14: 100, 30: 250 }; // días → XP

// ---------- misiones ----------
export type MissionKind = "game" | "game_valid" | "trivia_valid" | "vote" | "challenge_done" | "challenge_win" | "active_day";
export type MissionDef = { id: string; period: "daily" | "weekly"; title: string; desc: string; kind: MissionKind; target: number; xp: number; coins: number };

export const MISSION_POOL: MissionDef[] = [
  { id: "d_play3", period: "daily", title: "Calentamiento", desc: "Juega 3 partidas.", kind: "game", target: 3, xp: 20, coins: 10 },
  { id: "d_win2", period: "daily", title: "Pulso firme", desc: "Consigue 2 partidas válidas.", kind: "game_valid", target: 2, xp: 25, coins: 12 },
  { id: "d_trivia", period: "daily", title: "Mente despierta", desc: "Acierta una trivia.", kind: "trivia_valid", target: 1, xp: 15, coins: 8 },
  { id: "d_vote", period: "daily", title: "Tu voz cuenta", desc: "Vota en una encuesta de la comunidad.", kind: "vote", target: 1, xp: 10, coins: 5 },
  { id: "d_challenge", period: "daily", title: "Cara a cara", desc: "Termina un reto contra otro miembro.", kind: "challenge_done", target: 1, xp: 20, coins: 10 },
  { id: "w_play15", period: "weekly", title: "Maratón arcade", desc: "Juega 15 partidas esta semana.", kind: "game", target: 15, xp: 80, coins: 40 },
  { id: "w_duels", period: "weekly", title: "Duelista", desc: "Gana 2 retos esta semana.", kind: "challenge_win", target: 2, xp: 100, coins: 50 },
  { id: "w_days5", period: "weekly", title: "Presencia constante", desc: "Sé activo 5 días distintos.", kind: "active_day", target: 5, xp: 100, coins: 50 },
  { id: "w_vote3", period: "weekly", title: "Voz de la comunidad", desc: "Vota en 3 encuestas.", kind: "vote", target: 3, xp: 50, coins: 25 },
];

function hash(str: string): number { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Misiones del periodo: determinista por fecha/semana, iguales para todos. */
export function missionsFor(period: "daily" | "weekly", key: string): MissionDef[] {
  const pool = MISSION_POOL.filter((m) => m.period === period);
  const rnd = seeded(hash(`${period}:${key}`));
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j]!, arr[i]!]; }
  return arr.slice(0, 3);
}
export function kindsOf(e: ProgressEvent, newDay: boolean): MissionKind[] {
  const k: MissionKind[] = [];
  if (e.type === "game") { k.push("game"); if (e.valid) { k.push("game_valid"); if (e.game === "trivia") k.push("trivia_valid"); } }
  if (e.type === "challenge") { k.push("challenge_done"); if (e.result === "win") k.push("challenge_win"); }
  if (e.type === "vote") k.push("vote");
  if (newDay) k.push("active_day");
  return k;
}

// ---------- insignias ----------
export type AchievementDef = {
  id: string; name: string; desc: string; emoji: string; xp: number; unlocksItem?: string;
  check: (s: Stats, level: number) => boolean; progress: (s: Stats, level: number) => { value: number; target: number };
};
const countAch = (id: string, name: string, desc: string, emoji: string, xp: number, get: (s: Stats, l: number) => number, target: number, unlocksItem?: string): AchievementDef =>
  ({ id, name, desc, emoji, xp, unlocksItem, check: (s, l) => get(s, l) >= target, progress: (s, l) => ({ value: Math.min(get(s, l), target), target }) });

export const ACHIEVEMENTS: AchievementDef[] = [
  countAch("first_steps", "Primeros pasos", "Completa tu perfil (nombre, biografía o avatar).", "🌱", 10, (s) => (s.profileCompleted ? 1 : 0), 1),
  countAch("first_game", "Espíritu arcade", "Juega tu primera partida.", "🎮", 10, (s) => s.gamesPlayed, 1),
  countAch("sharp_mind", "Mente afilada", "Acierta 10 trivias.", "🧠", 40, (s) => s.triviaValid, 10, "title_mind"),
  countAch("memory_ace", "Memoria de elefante", "Supera 10 partidas de memoria.", "🐘", 40, (s) => s.memoriaValid, 10),
  { id: "quick_reflexes", name: "Reflejos de rayo", desc: "Registra un tiempo de reacción de 250 ms o menos.", emoji: "⚡", xp: 40,
    check: (s) => s.bestReaction !== undefined && s.bestReaction <= 250,
    progress: (s) => ({ value: s.bestReaction !== undefined && s.bestReaction <= 250 ? 1 : 0, target: 1 }) },
  countAch("on_fire", "En racha", "Mantén una racha de 7 días.", "🔥", 60, (s) => s.longestStreak, 7, "frame_fire"),
  countAch("challenger", "Valiente", "Termina tu primer reto.", "⚔️", 20, (s) => s.challengesPlayed, 1),
  countAch("duelist", "Duelista", "Gana 5 retos.", "🏹", 60, (s) => s.challengesWon, 5, "title_duelist"),
  countAch("community_voice", "Voz de la comunidad", "Vota en 3 encuestas.", "🗳️", 20, (s) => s.votes, 3),
  countAch("level_5", "Veterano", "Alcanza el nivel 5.", "🛡️", 50, (_s, l) => l, 5),
  countAch("weekly_champion", "Campeón semanal", "Termina primero en el ranking semanal.", "🏆", 100, (s) => s.weeklyTitles, 1, "title_champion"),
  countAch("collector", "Coleccionista", "Reúne 3 elementos en tu colección.", "💎", 30, (s) => s.items, 3),
];

// ---------- catálogo cosmético (sin valor monetario, no se vende ni se transfiere) ----------
export type Slot = "frame" | "theme" | "title";
export type CatalogItem = {
  id: string; slot: Slot; name: string; desc: string; price: number; css?: string; emoji?: string;
  requires?: { achievement?: string; level?: number };
};
export const CATALOG: CatalogItem[] = [
  { id: "frame_none", slot: "frame", name: "Sin marco", desc: "Avatar limpio.", price: 0 },
  { id: "frame_neon", slot: "frame", name: "Neón azul", desc: "Un halo eléctrico.", price: 100, css: "0 0 0 3px #718cff, 0 0 18px #718cff" },
  { id: "frame_violet", slot: "frame", name: "Violeta nocturno", desc: "Brillo violeta suave.", price: 150, css: "0 0 0 3px #b39bff, 0 0 18px #b39bff" },
  { id: "frame_gold", slot: "frame", name: "Dorado veterano", desc: "Para quienes llegan al nivel 5.", price: 250, css: "0 0 0 3px #f5c451, 0 0 18px #f5c451", requires: { level: 5 } },
  { id: "frame_fire", slot: "frame", name: "Llama de racha", desc: "Desbloqueado por la insignia «En racha».", price: 0, css: "0 0 0 3px #ff7a45, 0 0 20px #ff5a1f", requires: { achievement: "on_fire" } },
  { id: "theme_default", slot: "theme", name: "Azul marino", desc: "El tema clásico del Refugio.", price: 0, css: "linear-gradient(135deg,#111a2e,#0b1226)" },
  { id: "theme_aurora", slot: "theme", name: "Aurora", desc: "Verdes y violetas.", price: 200, css: "linear-gradient(135deg,#123b3a,#2b1b5a)" },
  { id: "theme_sunset", slot: "theme", name: "Atardecer", desc: "Naranja y magenta.", price: 200, css: "linear-gradient(135deg,#4a1d3d,#5a2a1b)" },
  { id: "theme_matrix", slot: "theme", name: "Código verde", desc: "Estilo terminal.", price: 300, css: "linear-gradient(135deg,#06210f,#0a1a0d)" },
  { id: "title_novato", slot: "title", name: "Recién llegado", desc: "Todos empezamos aquí.", price: 0, emoji: "🌱" },
  { id: "title_explorer", slot: "title", name: "Explorador", desc: "Siempre curioso.", price: 50, emoji: "🧭" },
  { id: "title_mind", slot: "title", name: "Mente afilada", desc: "Desbloqueado por la insignia «Mente afilada».", price: 0, emoji: "🧠", requires: { achievement: "sharp_mind" } },
  { id: "title_duelist", slot: "title", name: "Duelista", desc: "Desbloqueado por la insignia «Duelista».", price: 0, emoji: "🏹", requires: { achievement: "duelist" } },
  { id: "title_champion", slot: "title", name: "Campeón semanal", desc: "Desbloqueado por la insignia «Campeón semanal».", price: 0, emoji: "🏆", requires: { achievement: "weekly_champion" } },
];
export const DEFAULTS: Record<Slot, string> = { frame: "frame_none", theme: "theme_default", title: "title_novato" };
export const itemById = (id: string) => CATALOG.find((i) => i.id === id);
/** ¿Es gratis y de base (todos lo tienen)? */
export const isDefaultItem = (id: string) => Object.values(DEFAULTS).includes(id);

export { levelForXp };
