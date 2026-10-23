import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/firebase-admin";
import { services } from "@/lib/server/services";

const schema = z.object({
  sessionId: z.string().min(10).max(100),
  answer: z.unknown().optional(),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Inicia sesión para guardar el resultado." },
      { status: 401 }
    );
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Resultado no válido." }, { status: 400 });
  }

  const db = adminDb();
  const ref = db.ref(`gameSessions/${parsed.data.sessionId}`);
  const snap = await ref.get();

  if (!snap.exists()) {
    return NextResponse.json({ error: "La partida no existe." }, { status: 404 });
  }

  const session = snap.val() as {
    uid: string;
    game: string;
    status: string;
    startedAt: number;
    expiresAt: number;
    challenge: { sequence?: string[]; answer?: number; delayMs?: number };
  };

  if (session.uid !== user.uid) {
    return NextResponse.json(
      { error: "Esta partida pertenece a otra cuenta." },
      { status: 403 }
    );
  }

  if (session.status !== "active") {
    return NextResponse.json(
      { error: "Esta partida ya fue procesada." },
      { status: 409 }
    );
  }

  const now = Date.now();
  if (now > session.expiresAt || now - session.startedAt < 500) {
    await ref.update({ status: "rejected", finishedAt: now });
    return NextResponse.json(
      { error: "La partida expiró o terminó demasiado rápido." },
      { status: 400 }
    );
  }

  let valid = false;
  let score = 0;
  let xp = 0;
  let coins = 0;

  if (session.game === "memoria") {
    const answer = z.array(z.string()).safeParse(parsed.data.answer);
    if (answer.success) {
      valid =
        JSON.stringify(answer.data) ===
        JSON.stringify(session.challenge.sequence);
      score = valid ? 100 : 0;
    } else {
      valid = false;
      score = 0;
    }
  } else if (session.game === "trivia") {
    const answer = z
      .number()
      .int()
      .min(0)
      .max(3)
      .safeParse(parsed.data.answer);
    if (answer.success) {
      valid = answer.data === session.challenge.answer;
      score = valid ? 100 : 0;
    } else {
      valid = false;
      score = 0;
    }
  } else if (session.game === "reflejos") {
    const answer = z
      .number()
      .int()
      .min(150)
      .max(5000)
      .safeParse(parsed.data.answer);
    const elapsed = now - session.startedAt;
    if (answer.success) {
      valid =
        elapsed >= (session.challenge.delayMs ?? 1200) &&
        answer.data >= 150 &&
        answer.data <= Math.min(5000, elapsed);
      score = valid ? Math.max(0, Math.round(5000 - answer.data)) : 0;
    } else {
      valid = false;
      score = 0;
    }
  } else {
    return NextResponse.json(
      { error: "Minijuego no reconocido." },
      { status: 400 }
    );
  }

  const claim = await ref.transaction((current) =>
    current && current.uid === user.uid && current.status === "active"
      ? { ...current, status: "completed", finishedAt: now, valid, score }
      : undefined
  );

  if (!claim.committed) {
    return NextResponse.json(
      { error: "El resultado ya fue procesado." },
      { status: 409 }
    );
  }

  // Recompensas, topes diarios, rachas, misiones, insignias y rankings: todo en el servicio de progreso (idempotente por partida).
  try {
    const reactionMs = session.game === "reflejos" && typeof parsed.data.answer === "number" ? parsed.data.answer : undefined;
    const r = await services().progress.recordEvent(user.uid, {
      type: "game", key: parsed.data.sessionId, game: session.game as "memoria" | "trivia" | "reflejos", valid, score, ...(reactionMs !== undefined ? { reactionMs } : {}),
    });
    xp = r.xp; coins = r.coins;
  } catch (e) {
    console.error("progress_error", e instanceof Error ? e.message : "unknown");
  }

  return NextResponse.json({
    ok: true,
    valid,
    score,
    xp,
    coins,
    message: !valid
      ? "Partida registrada. Esta vez no hubo recompensa."
      : xp + coins > 0 ? "¡Resultado validado! Recompensas añadidas." : "¡Resultado validado! Alcanzaste el tope diario de recompensas; vuelve mañana.",
  });
}