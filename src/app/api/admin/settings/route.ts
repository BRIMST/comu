import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/firebase-admin";

const schema = z.object({ siteName: z.string().trim().min(2, "Usa al menos 2 caracteres").max(40, "Máximo 40 caracteres") });

async function isAdmin(uid: string, claims: Record<string, unknown>) {
  if (claims.admin === true || claims.role === "admin") return true;
  const snap = await adminDb().ref(`users/${uid}/role`).get();
  return snap.val() === "admin";
}

export async function GET() {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.uid, user as unknown as Record<string, unknown>))) {
    return NextResponse.json({ error: "Acceso exclusivo para administradores" }, { status: 403 });
  }
  const snap = await adminDb().ref("siteSettings/siteName").get();
  return NextResponse.json({ siteName: snap.val() || "El Refugio" });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user || !(await isAdmin(user.uid, user as unknown as Record<string, unknown>))) {
    return NextResponse.json({ error: "Acceso exclusivo para administradores" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Nombre no válido" }, { status: 400 });
  const db = adminDb();
  const now = Date.now();
  await db.ref().update({
    "siteSettings/siteName": parsed.data.siteName,
    "siteSettings/updatedAt": now,
    [`adminAuditLogs/${user.uid}/${now}`]: { action: "site_name_updated", value: parsed.data.siteName, createdAt: now }
  });
  return NextResponse.json({ ok: true, siteName: parsed.data.siteName });
}
