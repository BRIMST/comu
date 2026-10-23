import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import { adminStore } from "@/lib/server/store-admin";
import { assertFeature } from "@/lib/server/settings";
import { rateLimit } from "@/lib/server/rate-limit";
import { bump } from "@/lib/server/metrics";
import { fail, sameOrigin } from "@/lib/server/http";

const schema = z.object({ idToken: z.string().min(20).max(10000), username: z.string().regex(/^[a-z0-9_]{3,20}$/), terms: z.literal(true) });
const RESERVED = new Set(["admin", "administrador", "moderador", "soporte", "refugio", "elrefugio", "system", "sistema", "staff", "null", "undefined", "demo"]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Revisa el nombre de usuario y acepta los términos." }, { status: 400 });
    if (RESERVED.has(parsed.data.username)) return NextResponse.json({ error: "Ese nombre de usuario está reservado." }, { status: 409 });

    const store = adminStore();
    await assertFeature(store, "registrations");
    // Anti creación masiva: máximo 5 registros por hora desde la misma IP (se guarda solo un hash).
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
    await rateLimit(store, Date.now(), `ip${createHash("sha256").update(ip).digest("hex").slice(0, 24)}`, "register", 5, 60 * 60 * 1000);

    const user = await adminAuth().verifyIdToken(parsed.data.idToken, true);
    const db = adminDb();
    const key = parsed.data.username;
    const usernameRef = db.ref(`usernames/${key}`);
    const claim = await usernameRef.transaction((current) => (current === null ? { uid: user.uid, username: key } : undefined));
    if (!claim.committed) return NextResponse.json({ error: "Ese nombre de usuario ya está ocupado" }, { status: 409 });

    const now = Date.now();
    try {
      await db.ref().update({
        [`users/${user.uid}`]: { uid: user.uid, email: user.email ?? null, role: "member", createdAt: now, termsAcceptedAt: now, termsVersion: "2026-10" },
        [`profiles/${user.uid}`]: { uid: user.uid, username: key, displayName: key, avatar: "🎮", bio: "Nuevo miembro del Refugio", level: 1, xp: 0, joinedAt: now, privacy: { showInRanking: true, showActivity: true, showStats: true, showBadges: true } },
        [`publicProfiles/${user.uid}`]: { uid: user.uid, username: key, displayName: key, avatar: "🎮", level: 1, xp: 0, joinedAt: now, showInRanking: true },
        [`wallets/${user.uid}`]: { balance: 0, updatedAt: now },
      });
    } catch (e) { await usernameRef.remove(); throw e; }
    await bump(store, now, "registrations");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
