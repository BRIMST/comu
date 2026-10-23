import { NextResponse } from "next/server";
import { adminStore } from "@/lib/server/store-admin";
import { getFeatures } from "@/lib/server/settings";
import { mergeFeatures } from "@/lib/domain/features";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const store = adminStore();
    const [name, features] = await Promise.all([store.get<string>("siteSettings/siteName"), getFeatures(store)]);
    return NextResponse.json({ siteName: name || "El Refugio", features }, { headers });
  } catch {
    return NextResponse.json({ siteName: "El Refugio", features: mergeFeatures({}) }, { headers });
  }
}
