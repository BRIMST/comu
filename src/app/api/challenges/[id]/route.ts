import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{10,40}$/);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("submit"), answer: z.array(z.union([z.string().max(8), z.number().int().min(0).max(3)])).max(10) }),
]);

export async function GET(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Reto no encontrado." }, { status: 404 });
  try { return NextResponse.json({ challenge: await services().challenges.detail(user.uid, id.data) }); } catch (e) { return fail(e); }
}

export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const id = idSchema.safeParse((await params).id);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  const svc = services().challenges;
  try {
    switch (parsed.data.action) {
      case "accept": await svc.accept(user.uid, id.data); return NextResponse.json({ ok: true });
      case "decline": await svc.decline(user.uid, id.data); return NextResponse.json({ ok: true });
      case "cancel": await svc.cancel(user.uid, id.data); return NextResponse.json({ ok: true });
      case "start": return NextResponse.json({ ok: true, ...(await svc.start(user.uid, id.data)) });
      case "submit": return NextResponse.json({ ok: true, ...(await svc.submit(user.uid, id.data, parsed.data.answer)) });
    }
  } catch (e) { return fail(e); }
}
