import { NextResponse } from "next/server";
import { services } from "@/lib/server/services";
import { fail } from "@/lib/server/http";

export async function GET() {
  try { return NextResponse.json(await services().donations.publicInfo(), { headers: { "Cache-Control": "s-maxage=20, stale-while-revalidate=60" } }); } catch (e) { return fail(e); }
}
