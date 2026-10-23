import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail } from "@/lib/server/http";
import { idSchema } from "@/lib/domain/donations";

/** Estado de un aporte. Con ?txn= el servidor consulta la transacción directamente al proveedor; el navegador nunca confirma nada. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Aporte no encontrado." }, { status: 404 });
  const txn = new URL(req.url).searchParams.get("txn") ?? new URL(req.url).searchParams.get("id") ?? undefined;
  try { return NextResponse.json(await services().donations.reconcile(user.uid, id.data, txn), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}
