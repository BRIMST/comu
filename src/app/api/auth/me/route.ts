import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/session";
import { requireAdmin } from "@/lib/server/admin";
import { adminStore } from "@/lib/server/store-admin";

/** Estado mínimo de la sesión para la barra de navegación. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const user = await currentUser();
  if (!user) return NextResponse.json({ loggedIn: false }, { headers });
  const [profile, admin] = await Promise.all([adminStore().get<{ username?: string; avatar?: string }>(`profiles/${user.uid}`), requireAdmin()]);
  return NextResponse.json({ loggedIn: true, username: profile?.username ?? null, avatar: profile?.avatar ?? "🎮", isAdmin: !!admin }, { headers });
}
