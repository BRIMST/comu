import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services, siteUrl } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para ver tus aportes." }, { status: 401 });
  try { return NextResponse.json({ donations: await services().donations.myDonations(user.uid) }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para apoyar." }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await services().donations.start(user.uid, await req.json().catch(() => null), siteUrl(req))) }); } catch (e) { return fail(e); }
}
