import { GAME_IDS } from "../domain/game-config";
import { GAME_INFO } from "../domain/games";
import { dayKey, missionsFor } from "../domain/progress";
import type { createCommunityService } from "./community-service";
import type { createDonationService } from "./donation-service";
import type { createProgressService } from "./progress-service";
import type { createRankingService } from "./ranking-service";
import { getFeatures, getGameConfig } from "./settings";
import type { createShopService } from "./shop-service";
import type { Store } from "./store";

type Deps = {
  store: Store; clock?: () => number;
  progress: ReturnType<typeof createProgressService>; ranking: ReturnType<typeof createRankingService>;
  community: ReturnType<typeof createCommunityService>; donations: ReturnType<typeof createDonationService>; shop: ReturnType<typeof createShopService>;
};

/** Datos de la portada: todo sale de la base de datos, nada es de muestra. Sin sesión, solo se muestra lo público. */
export function createHomeService({ store, clock = Date.now, progress, ranking, community, donations }: Deps) {
  async function me(uid: string) {
    const [profile, view, wallet, notes] = await Promise.all([
      store.get<{ username?: string; displayName?: string; avatar?: string; equipped?: Record<string, string> }>(`profiles/${uid}`),
      progress.view(uid), store.get<{ balance?: number }>(`wallets/${uid}`), community.listNotifications(uid),
    ]);
    if (!profile) return null;
    return {
      username: profile.username ?? "", displayName: profile.displayName ?? profile.username ?? "", avatar: profile.avatar ?? "🎮",
      frame: profile.equipped?.frame ?? "frame_none", level: view.level, xp: view.xp, levelProgress: view.levelProgress,
      balance: Number(wallet?.balance ?? 0), unread: notes.unread, streak: view.streak,
      daily: view.missions.daily,
    };
  }

  async function home(uid: string | null) {
    const now = clock();
    const [features, gameCfg, feed, weekly, events, polls, goals, mine] = await Promise.all([
      getFeatures(store), getGameConfig(store),
      store.list<{ username: string; text: string; icon: string; createdAt: number }>("communityFeed", { orderBy: "createdAt", limitLast: 8 }),
      ranking.ranking("weekly"), community.listEvents(), community.listPolls(uid ?? "_anon"), donations.listGoals(),
      uid ? me(uid) : Promise.resolve(null),
    ]);
    const def = missionsFor("daily", dayKey(now))[0]!;
    const mine1 = mine?.daily.find((m) => m.id === def.id);
    return {
      me: mine ? { ...mine, daily: undefined } : null,
      features,
      games: GAME_IDS.map((id) => ({ id, ...GAME_INFO[id], enabled: features.games && gameCfg[id].enabled })),
      dailyChallenge: { id: def.id, title: def.title, desc: def.desc, target: def.target, xp: def.xp, coins: def.coins, progress: mine1?.progress ?? 0, done: mine1?.done ?? false, personal: !!mine },
      activity: feed.sort((a, b) => b.createdAt - a.createdAt).map(({ username, text, icon, createdAt }) => ({ username, text, icon, createdAt })),
      weeklyTop: (weekly.entries ?? []).slice(0, 5),
      nextEvent: events.upcoming[0] ? (({ createdBy: _c, ...e }) => (void _c, e))(events.upcoming[0] as typeof events.upcoming[0] & { createdBy?: string }) : null,
      openPolls: polls.filter((p) => p.open).slice(0, 2),
      goal: goals.find((g) => g.status !== "closed") ?? null,
    };
  }
  return { home };
}
