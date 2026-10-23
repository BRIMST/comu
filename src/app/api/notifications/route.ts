import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  try { return NextResponse.json(await services().community.listNotifications(user.uid), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), keys: z.union([z.literal("all"), z.array(z.string().max(80)).max(100)]) }),
  z.object({ action: z.literal("prefs"), muted: z.record(z.string(), z.boolean()) }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  try {
    const { community } = services();
    if (p.data.action === "read") await community.markRead(user.uid, p.data.keys);
    else await community.setPrefs(user.uid, p.data.muted);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
