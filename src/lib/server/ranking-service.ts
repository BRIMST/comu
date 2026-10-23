import { weekKey } from "../domain/progress";
import type { createProgressService } from "./progress-service";
import type { Store } from "./store";

type Progress = ReturnType<typeof createProgressService>;
export const BOARDS = ["weekly", "alltime", "wins", "reaction", "active", "champions"] as const;
export type Board = (typeof BOARDS)[number];
type Row = { id: string; username: string; xp?: number; wins?: number; ms?: number; days?: number; streak?: number };

export function createRankingService({ store, progress, clock = Date.now }: { store: Store; progress: Progress; clock?: () => number }) {
  /** Quita a quienes ocultaron su perfil del ranking público y añade el avatar. */
  async function visible<T extends { id: string }>(rows: T[]) {
    const profiles = await Promise.all(rows.map((r) => store.get<{ showInRanking?: boolean; avatar?: string; username?: string }>(`publicProfiles/${r.id}`)));
    return rows.map((r, i) => ({ row: r, p: profiles[i] })).filter((x) => x.p?.showInRanking !== false).map((x) => ({ ...x.row, avatar: x.p?.avatar ?? "🎮" }));
  }

  /** Congela el podio de cada semana ya terminada (sin borrar nada) y premia al campeón una sola vez. */
  async function ensureChampions() {
    const now = clock();
    const current = weekKey(now);
    const weeks = [...new Set([1, 2, 3, 4].map((k) => weekKey(now - k * 7 * 86_400_000)))].filter((w) => w < current);
    for (const w of weeks) {
      if (await store.get(`weeklyChampions/${w}`)) continue;
      const rows = await visible(await store.list<Row>(`leaderboards/weekly/${w}`, { orderBy: "xp", limitLast: 30 }));
      const top = rows.sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0)).slice(0, 3).filter((r) => (r.xp ?? 0) > 0);
      if (!top.length) continue;
      let created = false;
      await store.transaction(`weeklyChampions/${w}`, (cur) => { if (cur === null) { created = true; return { week: w, createdAt: now, top: top.map((r) => ({ uid: r.id, username: r.username, xp: r.xp ?? 0 })) }; } created = false; return undefined; });
      if (created) await progress.awardWeeklyChampion(top[0]!.id);
    }
  }

  async function ranking(board: Board) {
    const now = clock();
    const take = <T,>(a: T[]) => a.slice(0, 20);
    switch (board) {
      case "weekly": case "alltime": {
        const path = board === "weekly" ? `leaderboards/weekly/${weekKey(now)}` : "leaderboards/alltime";
        const rows = (await visible(await store.list<Row>(path, { orderBy: "xp", limitLast: 100 }))).sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
        return { board, unit: "XP", entries: take(rows).map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, value: r.xp ?? 0 })) };
      }
      case "wins": {
        const rows = (await visible(await store.list<Row>("leaderboards/wins", { orderBy: "wins", limitLast: 100 }))).sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
        return { board, unit: "victorias", entries: take(rows).map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, value: r.wins ?? 0 })) };
      }
      case "reaction": {
        const rows = (await visible(await store.list<Row>("leaderboards/reaction", { orderBy: "ms", limitLast: 100, dir: "asc" }))).sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0));
        return { board, unit: "ms", entries: take(rows).map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, value: r.ms ?? 0 })) };
      }
      case "active": {
        const rows = (await visible(await store.list<Row>("leaderboards/active", { orderBy: "days", limitLast: 100 }))).sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
        return { board, unit: "días activos", entries: take(rows).map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, value: r.days ?? 0, extra: `racha máx. ${r.streak ?? 0}` })) };
      }
      case "champions": {
        await ensureChampions();
        const all = await store.list<{ week: string; top: { username: string; xp: number }[]; createdAt: number }>("weeklyChampions", { orderBy: "createdAt", limitLast: 12 });
        return { board, unit: "XP", weeks: all.sort((a, b) => b.week.localeCompare(a.week)).map((w) => ({ week: w.week, top: w.top })) };
      }
    }
  }
  return { ranking, ensureChampions };
}
