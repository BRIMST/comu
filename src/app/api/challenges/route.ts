import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

const schema = z.object({
  opponent: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/),
  game: z.string().max(20),
  stake: z.number().int(),
});

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para ver tus retos." }, { status: 401 });
  try { return NextResponse.json({ challenges: await services().challenges.list(user.uid) }); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para retar." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisa el usuario, el juego y la apuesta." }, { status: 400 });
  try {
    const ch = await services().challenges.create(user.uid, parsed.data);
    return NextResponse.json({ ok: true, id: ch.id });
  } catch (e) { return fail(e); }
}
