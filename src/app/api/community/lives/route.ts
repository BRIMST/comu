import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail } from "@/lib/server/http";

export async function GET() {
  const user = await currentUser();
  try { return NextResponse.json(await services().community.lives(user?.uid ?? "_anon"), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}
