import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { adminStore } from "@/lib/server/store-admin";
import { fail } from "@/lib/server/http";

/** Búsqueda por prefijo de nombre de usuario (solo devuelve nombres públicos). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{2,20}$/.test(q)) return NextResponse.json({ users: [] });
  try {
    const rows = await adminStore().listKeys<{ uid: string; username: string }>("usernames", q, 8);
    return NextResponse.json({ users: rows.filter((r) => r.value.uid !== user.uid).map((r) => r.value.username) });
  } catch (e) { return fail(e); }
}
