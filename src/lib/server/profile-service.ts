import { z } from "zod";
import { ACHIEVEMENTS, DEFAULTS, emptyStats, itemById, type Slot, type Stats } from "../domain/progress";
import { levelProgress } from "../domain/progression";
import { ApiError } from "./errors";
import type { createProgressService } from "./progress-service";
import type { Store } from "./store";

type Progress = ReturnType<typeof createProgressService>;
export const DEFAULT_PRIVACY = { showInRanking: true, showActivity: true, showStats: true, showBadges: true };
export type Privacy = typeof DEFAULT_PRIVACY;

export const profileInput = z.object({
  displayName: z.string().trim().min(2).max(40),
  bio: z.string().trim().max(180).default(""),
  avatar: z.string().min(1).max(8),
  showInRanking: z.boolean().default(true),
  showActivity: z.boolean().default(true),
  showStats: z.boolean().default(true),
  showBadges: z.boolean().default(true),
});

type ProfileRec = { uid: string; username: string; displayName?: string; avatar?: string; bio?: string; xp?: number; level?: number; joinedAt?: number; privacy?: Partial<Privacy>; equipped?: Partial<Record<Slot, string>> };

export function createProfileService({ store, progress }: { store: Store; progress: Progress }) {
  function equippedOf(p: ProfileRec) {
    const out = {} as Record<Slot, string>;
    (Object.keys(DEFAULTS) as Slot[]).forEach((slot) => { const id = p.equipped?.[slot]; out[slot] = id && itemById(id)?.slot === slot ? id : DEFAULTS[slot]; });
    return out;
  }

  /** Vista del perfil aplicando la privacidad. El dueño siempre ve todo. */
  async function publicView(username: string, viewerUid: string | null) {
    const rec = await store.get<{ uid: string }>(`usernames/${username.toLowerCase()}`);
    if (!rec) throw new ApiError("Perfil no encontrado.", 404);
    const p = await store.get<ProfileRec>(`profiles/${rec.uid}`);
    if (!p) throw new ApiError("Perfil no encontrado.", 404);
    const isOwner = viewerUid === rec.uid;
    const privacy = { ...DEFAULT_PRIVACY, ...(p.privacy ?? {}) };
    const xp = Number(p.xp ?? 0);
    const [stats, ach, acts] = await Promise.all([
      store.get<Stats>(`playerStats/${rec.uid}`),
      store.get<Record<string, { unlockedAt: number }>>(`userAchievements/${rec.uid}`),
      store.list<{ text: string; icon: string; createdAt: number }>(`activity/${rec.uid}`, { orderBy: "createdAt", limitLast: 10 }),
    ]);
    const s = { ...emptyStats(), ...(stats ?? {}) };
    return {
      username: p.username, displayName: p.displayName || p.username, avatar: p.avatar || "🎮", bio: p.bio ?? "",
      level: levelProgress(xp).level, xp, levelProgress: levelProgress(xp), joinedAt: p.joinedAt ?? null,
      equipped: equippedOf(p), isOwner,
      privacy: isOwner ? privacy : undefined,
      badges: isOwner || privacy.showBadges
        ? [
            ...ACHIEVEMENTS.filter((a) => ach?.[a.id]).map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, desc: a.desc, unlockedAt: ach![a.id]!.unlockedAt })),
            ...(await progress.customBadgesOf(ach ?? {})).map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, desc: b.desc, unlockedAt: b.unlockedAt })),
          ]
        : null,
      stats: isOwner || privacy.showStats ? {
        gamesPlayed: s.gamesPlayed, gamesValid: s.gamesValid, wins: s.challengesWon, losses: s.challengesLost, draws: s.challengesDrawn,
        bestReaction: s.bestReaction ?? null, bestMemoria: s.bestMemoria ?? null, bestTrivia: s.bestTrivia ?? null,
        longestStreak: s.longestStreak, activeDays: s.activeDays,
      } : null,
      activity: isOwner || privacy.showActivity ? acts.sort((a, b) => b.createdAt - a.createdAt).map(({ text, icon, createdAt }) => ({ text, icon, createdAt })) : null,
    };
  }

  async function update(uid: string, input: unknown) {
    const parsed = profileInput.safeParse(input);
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Datos de perfil no válidos.");
    const d = parsed.data;
    const p = await store.get<ProfileRec>(`profiles/${uid}`);
    if (!p) throw new ApiError("Perfil no encontrado.", 404);
    const now = Date.now();
    await store.update({
      [`profiles/${uid}/displayName`]: d.displayName, [`profiles/${uid}/bio`]: d.bio, [`profiles/${uid}/avatar`]: d.avatar,
      [`profiles/${uid}/privacy`]: { showInRanking: d.showInRanking, showActivity: d.showActivity, showStats: d.showStats, showBadges: d.showBadges },
      [`profiles/${uid}/updatedAt`]: now,
      // espejo mínimo usado por búsqueda, retos y rankings (la biografía y datos privados no se copian)
      [`publicProfiles/${uid}/displayName`]: d.displayName, [`publicProfiles/${uid}/avatar`]: d.avatar,
      [`publicProfiles/${uid}/showInRanking`]: d.showInRanking, [`publicProfiles/${uid}/updatedAt`]: now,
      [`publicProfiles/${uid}/bio`]: null,
    });
    const customized = d.bio.length > 0 && d.bio !== "Nuevo miembro del Refugio" || d.avatar !== "🎮" || d.displayName !== p.username;
    if (customized) await progress.recordEvent(uid, { type: "profile_completed", key: "profile" });
  }

  return { publicView, update };
}
