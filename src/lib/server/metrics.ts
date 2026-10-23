import { dayKey } from "../domain/progress";
import type { Store } from "./store";

export const METRICS = [
  "registrations", "active_users", "games_played", "games_valid", "challenges_created", "challenges_completed",
  "votes", "purchases", "reports", "donations_confirmed", "donations_amount_cop",
] as const;
export type Metric = (typeof METRICS)[number];

/** Contadores agregados (sin datos personales). Nunca deben romper el flujo que los llama. */
export async function bump(store: Store, now: number, name: Metric, n = 1) {
  try {
    const inc = (cur: number | null) => (cur ?? 0) + n;
    await Promise.all([
      store.transaction<number>(`metrics/days/${dayKey(now)}/${name}`, inc),
      store.transaction<number>(`metrics/totals/${name}`, inc),
    ]);
  } catch { /* métricas best-effort */ }
}

export async function metricsSummary(store: Store, now: number, days = 14) {
  const keys = Array.from({ length: days }, (_, i) => dayKey(now - i * 86_400_000));
  const [totals, rows] = await Promise.all([
    store.get<Partial<Record<Metric, number>>>("metrics/totals"),
    Promise.all(keys.map((d) => store.get<Partial<Record<Metric, number>>>(`metrics/days/${d}`))),
  ]);
  return {
    totals: Object.fromEntries(METRICS.map((m) => [m, totals?.[m] ?? 0])) as Record<Metric, number>,
    days: keys.map((day, i) => ({ day, ...Object.fromEntries(METRICS.map((m) => [m, rows[i]?.[m] ?? 0])) })).reverse() as Array<{ day: string } & Record<Metric, number>>,
  };
}
