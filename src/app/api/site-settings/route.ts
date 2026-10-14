import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";

export async function GET() {
  try {
    const snap = await adminDb().ref("siteSettings/siteName").get();
    return NextResponse.json({ siteName: snap.val() || "El Refugio" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ siteName: "El Refugio" }, { headers: { "Cache-Control": "no-store" } });
  }
}
