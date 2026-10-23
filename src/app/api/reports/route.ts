import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para reportar." }, { status: 401 });
  try { await services().admin.createReport(user.uid, await req.json().catch(() => null)); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}
