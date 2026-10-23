import { NextResponse } from "next/server";
import { BOARDS, type Board } from "@/lib/server/ranking-service";
import { services } from "@/lib/server/services";
import { fail } from "@/lib/server/http";

export async function GET(req: Request) {
  const board = new URL(req.url).searchParams.get("board") ?? "weekly";
  if (!(BOARDS as readonly string[]).includes(board)) return NextResponse.json({ error: "Clasificación no válida." }, { status: 400 });
  try { return NextResponse.json(await services().ranking.ranking(board as Board), { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } }); } catch (e) { return fail(e); }
}
