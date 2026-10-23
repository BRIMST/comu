import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail } from "@/lib/server/http";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para ver tu progreso." }, { status: 401 });
  try { return NextResponse.json(await services().progress.view(user.uid), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}
