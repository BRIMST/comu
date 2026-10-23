import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para proponer." }, { status: 401 });
  const p = z.object({ text: z.string().max(400) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Propuesta no válida." }, { status: 400 });
  try {
    const { store, community } = services();
    const profile = await store.get<{ username?: string }>(`publicProfiles/${user.uid}`);
    await community.submitProposal(user.uid, profile?.username ?? user.uid.slice(0, 8), p.data.text);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
