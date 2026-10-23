import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), itemId: z.string().regex(/^[a-z_]{3,30}$/) }),
  z.object({ action: z.literal("equip"), slot: z.enum(["frame", "theme", "title"]), itemId: z.string().regex(/^[a-z_]{3,30}$/).nullable() }),
]);

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para ver tu colección." }, { status: 401 });
  try { return NextResponse.json(await services().shop.catalog(user.uid), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  try {
    const { shop } = services();
    if (p.data.action === "buy") await shop.buy(user.uid, p.data.itemId); else await shop.equip(user.uid, p.data.slot, p.data.itemId);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
