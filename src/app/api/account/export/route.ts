import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { services } from "@/lib/server/services";
import { fail } from "@/lib/server/http";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  try {
    const data = await services().account.exportData(user.uid);
    return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="mis-datos-el-refugio.json"', "Cache-Control": "no-store" } });
  } catch (e) { return fail(e); }
}
