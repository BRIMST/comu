import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { store } = services();
  const profile = await store.get<{ username?: string }>(`profiles/${user.uid}`);
  return NextResponse.json({ profile: profile ?? null });
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try { await services().profiles.update(user.uid, await req.json().catch(() => null)); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}
