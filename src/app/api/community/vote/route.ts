import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

const schema = z.object({ pollId: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/), optionId: z.string().regex(/^o[1-6]$/) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para votar." }, { status: 401 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Voto no válido." }, { status: 400 });
  try {
    const { community, progress } = services();
    await community.vote(user.uid, p.data.pollId, p.data.optionId);
    try { await progress.recordEvent(user.uid, { type: "vote", key: `vote-${p.data.pollId}` }); } catch { /* el progreso no debe bloquear el voto */ }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
