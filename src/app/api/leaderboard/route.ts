import { NextResponse } from "next/server";
import { services } from "@/lib/server/services";

/** Compatibilidad: ranking semanal en el formato anterior. Usa /api/ranking para todas las tablas. */
export async function GET() {
  try {
    const r = await services().ranking.ranking("weekly");
    return NextResponse.json({ entries: (r.entries ?? []).map((e) => ({ username: e.username, xp: e.value })) });
  } catch { return NextResponse.json({ entries: [], configured: false }); }
}
