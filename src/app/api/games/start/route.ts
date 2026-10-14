import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/firebase-admin";
const schema = z.object({ game: z.enum(["reflejos", "memoria", "trivia"]) });
const symbols = ["🌙", "⭐", "🍀", "🔥", "💎", "🎮", "🪐", "🦊"];
const questions = [
  { prompt: "¿Qué significa XP en un sistema de progresión?", options: ["Experiencia", "Monedas", "Donación", "Contraseña"], answer: 0 },
  { prompt: "¿Cuál es la práctica más segura para validar recompensas?", options: ["Confiar en el navegador", "Validar en servidor", "Aceptar cualquier cifra", "Desactivar sesiones"], answer: 1 },
  { prompt: "¿Las donaciones deben dar ventajas competitivas?", options: ["Sí, siempre", "Solo en el ranking", "No", "Solo si son grandes"], answer: 2 },
];
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para jugar." }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Minijuego no válido." }, { status: 400 });
  const game = parsed.data.game;
  const db = adminDb();
  const ref = db.ref("gameSessions").push();
  const startedAt = Date.now();
  let challenge: Record<string, unknown> = {};
  if (game === "reflejos") challenge = { delayMs: 1200 + Math.floor(Math.random() * 1800) };
  if (game === "memoria") challenge = { sequence: Array.from({ length: 4 }, () => symbols[Math.floor(Math.random() * symbols.length)]) };
  if (game === "trivia") { const q = questions[Math.floor(Math.random() * questions.length)]!; challenge = { prompt: q.prompt, options: q.options, answer: q.answer }; }
  await ref.set({ uid: user.uid, game, status: "active", startedAt, challenge, expiresAt: startedAt + 120_000 });
  const publicChallenge = game === "memoria" ? { sequence: challenge.sequence } : game === "trivia" ? { prompt: challenge.prompt, options: challenge.options } : { delayMs: challenge.delayMs };
  return NextResponse.json({ sessionId: ref.key, game, challenge: publicChallenge, startedAt });
}
