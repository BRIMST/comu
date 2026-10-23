import "server-only";
import { createAccountService } from "./account-service";
import { createAdminService, type AuthAdmin } from "./admin-service";
import { createChallengeService } from "./challenge-service";
import { createCommunityService } from "./community-service";
import { createDonationService } from "./donation-service";
import { createHomeService } from "./home-service";
import { adminAuth } from "./firebase-admin";
import { paymentConfigFromEnv } from "./payments";
import { createProfileService } from "./profile-service";
import { createProgressService } from "./progress-service";
import { createRankingService } from "./ranking-service";
import { createShopService } from "./shop-service";
import { adminStore } from "./store-admin";

const firebaseAuthAdmin: AuthAdmin = {
  setDisabled: async (uid, disabled) => { await adminAuth().updateUser(uid, { disabled }); },
  revokeSessions: async (uid) => { await adminAuth().revokeRefreshTokens(uid); },
  deleteUser: async (uid) => { try { await adminAuth().deleteUser(uid); } catch (e) { if ((e as { code?: string }).code !== "auth/user-not-found") throw e; } },
};

export function services() {
  const store = adminStore();
  const community = createCommunityService({ store });
  const progress = createProgressService({ store, notify: community.notify });
  const ranking = createRankingService({ store, progress });
  const donations = createDonationService({ store, config: paymentConfigFromEnv(), notify: community.notify });
  const shop = createShopService({ store, progress });
  return {
    store, community, progress, ranking, donations, shop,
    home: createHomeService({ store, progress, ranking, community, donations, shop }),
    challenges: createChallengeService({ store, notify: community.notify, onResult: (uid, e) => progress.recordEvent(uid, { type: "challenge", ...e }).then(() => undefined) }),
    profiles: createProfileService({ store, progress }),
    admin: createAdminService({ store, auth: firebaseAuthAdmin, notify: community.notify, addActivity: progress.addActivity }),
    account: createAccountService({ store, auth: firebaseAuthAdmin }),
  };
}

/** URL pública del sitio (SITE_URL si está definida; si no, la del propio request detrás del proxy de Vercel). */
export function siteUrl(req: Request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
