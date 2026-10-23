import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail } from "@/lib/server/http";

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const username = (await params).username.toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return NextResponse.json({ error: "Perfil no encontrado." }, { status: 404 });
  const user = await currentUser();
  try { return NextResponse.json({ profile: await services().profiles.publicView(username, user?.uid ?? null) }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}
