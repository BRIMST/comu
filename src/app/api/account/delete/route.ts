import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, SESSION_COOKIE } from "@/lib/server/session";
import { adminAuth } from "@/lib/server/firebase-admin";
import { services } from "@/lib/server/services";
import { assertRecentAuth } from "@/lib/server/account-service";
import { fail, sameOrigin } from "@/lib/server/http";

const schema = z.object({ idToken: z.string().min(20).max(10000), confirm: z.string().min(3).max(20) });

/** Elimina la cuenta. Exige reautenticación reciente (idToken de hace < 5 min) y escribir el nombre de usuario. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  try {
    let decoded;
    try { decoded = await adminAuth().verifyIdToken(p.data.idToken, true); } catch { return NextResponse.json({ error: "Confirma tu contraseña de nuevo para continuar." }, { status: 401 }); }
    assertRecentAuth(decoded, user.uid, Date.now());
    await services().account.deleteAccount(user.uid, p.data.confirm);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  } catch (e) { return fail(e); }
}
