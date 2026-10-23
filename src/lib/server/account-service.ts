import { weekKey } from "../domain/progress";
import { ApiError } from "./errors";
import type { Challenge } from "../domain/challenges";
import type { AuthAdmin } from "./admin-service";
import type { Store } from "./store";

const ACTIVE = ["funding", "pending", "accepting", "accepted", "settling", "cancelling"];
const GONE = "usuario eliminado";

/** La reautenticación debe ser reciente (5 min) y de la misma cuenta que tiene la sesión. */
export function assertRecentAuth(decoded: { uid: string; auth_time?: number }, sessionUid: string, nowMs: number) {
  if (decoded.uid !== sessionUid) throw new ApiError("La confirmación no corresponde a esta cuenta.", 403);
  if (!decoded.auth_time || nowMs / 1000 - decoded.auth_time > 300) throw new ApiError("Por seguridad, confirma tu contraseña de nuevo para continuar.", 401);
}

export function createAccountService({ store, auth, clock = Date.now }: { store: Store; auth: Pick<AuthAdmin, "deleteUser">; clock?: () => number }) {
  async function activeChallenges(uid: string) {
    const ids = Object.keys((await store.get<Record<string, true>>(`userChallenges/${uid}`)) ?? {});
    const all = await Promise.all(ids.map((id) => store.get<Challenge>(`challenges/${id}`)));
    return all.filter((c): c is Challenge => !!c && ACTIVE.includes(c.status));
  }

  /**
   * Elimina la cuenta y los datos personales. Es idempotente (se puede reintentar si algo falla a medias).
   * Se conservan, sin datos que identifiquen a la persona: retos terminados (con el nombre sustituido), reportes de moderación
   * y registros financieros de donaciones (obligaciones contables).
   */
  async function deleteAccount(uid: string, confirmUsername: string) {
    const profile = await store.get<{ username?: string }>(`profiles/${uid}`);
    const username = profile?.username;
    if (username && confirmUsername.trim().toLowerCase() !== username) throw new ApiError("El nombre de usuario de confirmación no coincide.", 400);
    const active = await activeChallenges(uid);
    if (active.length) throw new ApiError(`Tienes ${active.length} reto(s) en curso. Espera a que terminen o cancélalos antes de eliminar tu cuenta.`, 409);
    const now = clock();

    // 1) seudonimizar lo que debe conservarse
    const chIds = Object.keys((await store.get<Record<string, true>>(`userChallenges/${uid}`)) ?? {});
    for (const id of chIds) {
      const c = await store.get<Challenge>(`challenges/${id}`);
      if (!c) continue;
      const up: Record<string, unknown> = {};
      if (c.challengerUid === uid) up[`challenges/${id}/challengerName`] = GONE;
      if (c.opponentUid === uid) up[`challenges/${id}/opponentName`] = GONE;
      await store.update(up);
    }
    const dIds = Object.keys((await store.get<Record<string, true>>(`userDonations/${uid}`)) ?? {});
    const donationUpdates: Record<string, unknown> = {};
    for (const id of dIds) { donationUpdates[`donations/${id}/uid`] = null; donationUpdates[`donations/${id}/thanks`] = null; donationUpdates[`donationThanks/${id}`] = null; }
    if (Object.keys(donationUpdates).length) await store.update(donationUpdates);

    const feed = await store.list<{ uid: string }>("communityFeed", { orderBy: "createdAt", limitLast: 200 });
    const proposals = await store.list<{ uid: string }>("challengeProposals", { orderBy: "createdAt", limitLast: 100 });
    const reports = await store.list<{ reporterUid: string }>("reports", { orderBy: "createdAt", limitLast: 100 });
    const champs = await store.list<{ top: { uid: string; username: string; xp: number }[] }>("weeklyChampions", { orderBy: "createdAt", limitLast: 60 });
    const scrub: Record<string, unknown> = {};
    for (const f of feed) if (f.uid === uid) scrub[`communityFeed/${f.id}`] = null;
    for (const p of proposals) if (p.uid === uid) scrub[`challengeProposals/${p.id}`] = null;
    for (const r of reports) if (r.reporterUid === uid) scrub[`reports/${r.id}/reporterUid`] = "deleted";
    for (const c of champs) if (c.top?.some((t) => t.uid === uid)) scrub[`weeklyChampions/${c.id}/top`] = c.top.map((t) => (t.uid === uid ? { uid: "deleted", username: GONE, xp: t.xp } : t));
    if (Object.keys(scrub).length) await store.update(scrub);

    // 2) borrar los datos personales
    const remove: Record<string, null> = {};
    const own = ["profiles", "publicProfiles", "wallets", "walletTransactions", "userAchievements", "inventory", "playerStats", "playerEvents", "dailyCaps", "missions", "xpLog", "activity", "notifications", "notificationPrefs", "userChallenges", "rateLimits", "userDonations", "reportDedupe", "users"];
    for (const n of own) remove[`${n}/${uid}`] = null;
    if (username) remove[`usernames/${username}`] = null;
    for (const b of ["alltime", "wins", "reaction", "active"]) remove[`leaderboards/${b}/${uid}`] = null;
    for (let k = 0; k < 12; k++) remove[`leaderboards/weekly/${weekKey(now - k * 7 * 86_400_000)}/${uid}`] = null;
    await store.update({ ...remove, [`deletedAccounts/${uid}`]: { deletedAt: now } } as Record<string, unknown>);

    // 3) cuenta de acceso
    await auth.deleteUser(uid);
  }

  /** Copia de los datos personales (derecho de acceso). */
  async function exportData(uid: string) {
    const [user, profile, wallet, ledger, stats, ach, inv, notes, dons, ch] = await Promise.all([
      store.get<Record<string, unknown>>(`users/${uid}`), store.get(`profiles/${uid}`), store.get(`wallets/${uid}`),
      store.list<Record<string, unknown>>(`walletTransactions/${uid}`, { orderBy: "createdAt", limitLast: 500 }),
      store.get(`playerStats/${uid}`), store.get(`userAchievements/${uid}`), store.get(`inventory/${uid}`),
      store.list<Record<string, unknown>>(`notifications/${uid}`, { orderBy: "createdAt", limitLast: 100 }),
      store.get<Record<string, true>>(`userDonations/${uid}`), store.get<Record<string, true>>(`userChallenges/${uid}`),
    ]);
    const donations = (await Promise.all(Object.keys(dons ?? {}).map((id) => store.get<Record<string, unknown>>(`donations/${id}`)))).filter(Boolean)
      .map((d) => ({ id: d!.id, amountCOP: d!.amountCOP, status: d!.status, createdAt: d!.createdAt, provider: d!.provider }));
    const challenges = (await Promise.all(Object.keys(ch ?? {}).map((id) => store.get<Challenge>(`challenges/${id}`)))).filter(Boolean)
      .map((c) => ({ id: c!.id, game: c!.game, stake: c!.stake, status: c!.status, createdAt: c!.createdAt, result: c!.result ?? null }));
    const { suspension: _s, ...account } = (user ?? {}) as Record<string, unknown>; void _s;
    return { exportedAt: clock(), account, profile, wallet, walletTransactions: ledger, stats, achievements: ach, inventory: inv, notifications: notes, donations, challenges };
  }

  return { deleteAccount, exportData, activeChallenges };
}
