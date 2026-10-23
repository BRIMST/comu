import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

const user = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{3,40}$/);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setFeature"), feature: z.string().max(30), enabled: z.boolean(), reason: z.string().max(300) }),
  z.object({ action: z.literal("setGame"), data: z.unknown() }),
  z.object({ action: z.literal("suspend"), username: user, reason: z.string().max(300) }),
  z.object({ action: z.literal("unsuspend"), username: user }),
  z.object({ action: z.literal("bonus"), username: user, data: z.unknown() }),
  z.object({ action: z.literal("moderate"), username: user, data: z.unknown() }),
  z.object({ action: z.literal("resolveReport"), id, resolution: z.enum(["dismissed", "actioned"]), note: z.string().max(300) }),
  z.object({ action: z.literal("createBadge"), data: z.unknown() }),
  z.object({ action: z.literal("grantBadge"), username: user, badgeId: id }),
  z.object({ action: z.literal("revokeBadge"), username: user, badgeId: id }),
  z.object({ action: z.literal("deleteBadge"), badgeId: id }),
  z.object({ action: z.literal("createGoal"), data: z.unknown() }),
  z.object({ action: z.literal("goalStatus"), id, status: z.enum(["open", "closed"]) }),
  z.object({ action: z.literal("donationInfo"), data: z.unknown() }),
  z.object({ action: z.literal("recordDonation"), data: z.unknown() }),
  z.object({ action: z.literal("refundDonation"), id, reason: z.string().max(300) }),
  z.object({ action: z.literal("hideThanks"), id }),
]);

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acceso exclusivo para administradores" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const { admin: a, donations } = services();
  try {
    switch (q.get("section")) {
      case "overview": return NextResponse.json(await a.overview());
      case "users": return NextResponse.json({ users: await a.searchUsers(q.get("q") ?? "") });
      case "user": { const u = user.safeParse(q.get("username")); if (!u.success) return NextResponse.json({ error: "Usuario no válido." }, { status: 400 }); return NextResponse.json(await a.userDetail(u.data)); }
      case "reports": return NextResponse.json({ reports: await a.listReports(q.get("status") === "all" ? "all" : "open") });
      case "badges": return NextResponse.json(await a.listBadges());
      case "donations": return NextResponse.json({ ...(await donations.adminList()), provider: (await donations.publicInfo()).mode });
      case "audit": return NextResponse.json({ entries: await a.audit(80) });
      default: return NextResponse.json({ error: "Sección no válida." }, { status: 400 });
    }
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acceso exclusivo para administradores" }, { status: 403 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  const { admin: a, donations: d } = services();
  const x = p.data;
  try {
    switch (x.action) {
      case "setFeature": await a.setFeature(admin.uid, x.feature, x.enabled, x.reason); break;
      case "setGame": await a.setGameConfig(admin.uid, x.data); break;
      case "suspend": await a.suspend(admin.uid, x.username, x.reason); break;
      case "unsuspend": await a.unsuspend(admin.uid, x.username); break;
      case "bonus": await a.grantBonus(admin.uid, x.username, x.data); break;
      case "moderate": await a.moderateProfile(admin.uid, x.username, x.data); break;
      case "resolveReport": await a.resolveReport(admin.uid, x.id, x.resolution, x.note); break;
      case "createBadge": await a.createBadge(admin.uid, x.data); break;
      case "grantBadge": await a.grantBadge(admin.uid, x.username, x.badgeId); break;
      case "revokeBadge": await a.revokeBadge(admin.uid, x.username, x.badgeId); break;
      case "deleteBadge": await a.deleteBadge(admin.uid, x.badgeId); break;
      case "createGoal": await d.createGoal(admin.uid, x.data); break;
      case "goalStatus": await d.setGoalStatus(admin.uid, x.id, x.status); break;
      case "donationInfo": await d.setInfo(admin.uid, x.data); break;
      case "recordDonation": await d.recordManual(admin.uid, x.data); break;
      case "refundDonation": await d.refund(admin.uid, x.id, x.reason); break;
      case "hideThanks": await d.hideThanks(admin.uid, x.id); break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
