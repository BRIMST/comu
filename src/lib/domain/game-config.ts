import { z } from "zod";

export const GAME_IDS = ["reflejos", "memoria", "trivia"] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameConfig = { enabled: boolean; xp: number; coins: number };
export const GAME_LIMITS = { xpMax: 50, coinsMax: 30 } as const;
export const GAME_DEFAULTS: Record<GameId, GameConfig> = {
  reflejos: { enabled: true, xp: 10, coins: 5 },
  memoria: { enabled: true, xp: 10, coins: 5 },
  trivia: { enabled: true, xp: 15, coins: 8 },
};
export const gameConfigInput = z.object({
  game: z.enum(GAME_IDS),
  enabled: z.boolean(),
  xp: z.number().int().min(0).max(GAME_LIMITS.xpMax),
  coins: z.number().int().min(0).max(GAME_LIMITS.coinsMax),
});

const clampInt = (v: unknown, max: number, fallback: number) => (typeof v === "number" && Number.isInteger(v) ? Math.min(max, Math.max(0, v)) : fallback);
/** Combina lo guardado con los valores por defecto, descartando cualquier valor fuera de rango. */
export function mergeGameConfig(raw: unknown): Record<GameId, GameConfig> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Partial<GameConfig> | undefined>;
  return Object.fromEntries(GAME_IDS.map((id) => {
    const d = GAME_DEFAULTS[id], c = r[id] ?? {};
    return [id, { enabled: c.enabled !== false, xp: clampInt(c.xp, GAME_LIMITS.xpMax, d.xp), coins: clampInt(c.coins, GAME_LIMITS.coinsMax, d.coins) }];
  })) as Record<GameId, GameConfig>;
}
