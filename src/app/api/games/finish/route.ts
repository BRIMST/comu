import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/firebase-admin";
import { levelForXp } from "@/lib/domain/progression";
const schema = z.object({ sessionId: z.string().min(10).max(100), answer: z.unknown().optional() });
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para guardar el resultado." }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Resultado no válido." }, { status: 400 });
  const db = adminDb(); const ref = db.ref(`gameSessions/${parsed.data.sessionId}`); const snap = await ref.get();
  if (!snap.exists()) return NextResponse.json({ error: "La partida no existe." }, { status: 404 });
  const session = snap.val() as { uid: string; game: string; status: string; startedAt: number; expiresAt: number; challenge: { sequence?: string[]; answer?: number; delayMs?: number } };
  if (session.uid !== user.uid) return NextResponse.json({ error: "Esta partida pertenece a otra cuenta." }, { status: 403 });
  if (session.status !== "active") return NextResponse.json({ error: "Esta partida ya fue procesada." }, { status: 409 });
  const now = Date.now(); if (now > session.expiresAt || now - session.startedAt < 500) { await ref.update({ status: "rejected", finishedAt: now }); return NextResponse.json({ error: "La partida expiró o terminó demasiado rápido." }, { status: 400 }); }
  let valid = false; let score = 0; let xp = 0; let coins = 0;
  if (session.game === "memoria") { const answer = z.array(z.string()).safeParse(parsed.data.answer); valid = answer.success && JSON.stringify(answer.data) === JSON.stringify(session.challenge.sequence); score = valid ? 100 : 0; }
  else if (session.game === "trivia") { const answer = z.number().int().min(0).max(3).safeParse(parsed.data.answer); valid = answer.success && answer.data === session.challenge.answer; score = valid ? 100 : 0; }
  else if (session.game === "reflejos") { const answer = z.number().int().min(150).max(5000).safeParse(parsed.data.answer); const elapsed = now - session.startedAt; valid = answer.success && elapsed >= (session.challenge.delayMs ?? 1200) && answer.data >= 150 && answer.data <= Math.min(5000, elapsed); score = valid ? Math.max(0, Math.round(5000 - answer.data)) : 0; }
  else return NextResponse.json({ error: "Minijuego no reconocido." }, { status: 400 });
  const claim = await ref.transaction(current => current && current.uid === user.uid && current.status === "active" ? { ...current, status: "completed", finishedAt: now, valid, score } : undefined);
  if (!claim.committed) return NextResponse.json({ error: "El resultado ya fue procesado." }, { status: 409 });
  if (valid) { xp = session.game === "trivia" ? 15 : 10; coins = session.game === "trivia" ? 8 : 5; const walletRef = db.ref(`wallets/${user.uid}`); await walletRef.transaction(w => ({ balance: Math.max(0, Number(w?.balance ?? 0)) + coins, updatedAt: now })); const profileRef = db.ref(`profiles/${user.uid}`); let updatedXp = 0; await profileRef.transaction(p => { if (!p) return p; updatedXp = Number(p.xp ?? 0) + xp; return { ...p, xp: updatedXp, level: levelForXp(updatedXp), updatedAt: now }; }); await db.ref(`walletTransactions/${user.uid}/${parsed.data.sessionId}`).set({ amount: coins, type: "game_reward", description: `Recompensa: ${session.game}`, createdAt: now, sessionId: parsed.data.sessionId }); await db.ref(`leaderboards/weekly/${user.uid}`).transaction(row => ({ username: String(row?.username ?? user.uid.slice(0, 8)), xp: Number(row?.xp ?? 0) + xp, updatedAt: now })); }
  return NextResponse.json({ ok: true, valid, score, xp, coins, message: valid ? "¡Resultado validado! Recompensas añadidas." : "Partida registrada. Esta vez no hubo recompensa." });
}
