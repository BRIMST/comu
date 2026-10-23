import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { services } from "@/lib/server/services";
import { fail, sameOrigin } from "@/lib/server/http";

const id = z.string().regex(/^[A-Za-z0-9_-]{10,40}$/);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createEvent"), data: z.unknown() }),
  z.object({ action: z.literal("cancelEvent"), id }),
  z.object({ action: z.literal("createPoll"), data: z.unknown() }),
  z.object({ action: z.literal("closePoll"), id }),
  z.object({ action: z.literal("createMission"), data: z.unknown() }),
  z.object({ action: z.literal("missionProgress"), id, progress: z.number().int() }),
  z.object({ action: z.literal("closeMission"), id }),
  z.object({ action: z.literal("announce"), data: z.unknown() }),
  z.object({ action: z.literal("setChannels"), data: z.unknown() }),
  z.object({ action: z.literal("reviewProposal"), id, status: z.enum(["reviewed", "dismissed"]) }),
]);

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acceso exclusivo para administradores" }, { status: 403 });
  try {
    const { community } = services();
    const [proposals, channels, events, polls, missions] = await Promise.all([community.listProposals(), community.getChannels(), community.listEvents(), community.listPolls(admin.uid), community.listMissions()]);
    return NextResponse.json({ proposals, channels, events, polls, missions });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acceso exclusivo para administradores" }, { status: 403 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
  const { community } = services();
  const a = p.data;
  try {
    switch (a.action) {
      case "createEvent": await community.createEvent(admin.uid, a.data); break;
      case "cancelEvent": await community.cancelEvent(admin.uid, a.id); break;
      case "createPoll": await community.createPoll(admin.uid, a.data); break;
      case "closePoll": await community.closePoll(admin.uid, a.id); break;
      case "createMission": await community.createMission(admin.uid, a.data); break;
      case "missionProgress": await community.setMissionProgress(admin.uid, a.id, a.progress); break;
      case "closeMission": await community.closeMission(admin.uid, a.id); break;
      case "announce": await community.publishAnnouncement(admin.uid, a.data); break;
      case "setChannels": await community.setChannels(admin.uid, a.data); break;
      case "reviewProposal": await community.reviewProposal(admin.uid, a.id, a.status); break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
