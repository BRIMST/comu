import type { TriviaQuestion } from "./trivia";

export const CHALLENGE_GAMES = ["memoria", "trivia"] as const; // "reflejos" queda fuera: el tiempo lo mide el navegador y es manipulable.
export type ChallengeGame = (typeof CHALLENGE_GAMES)[number];

export const MIN_STAKE = 1;
export const MAX_STAKE = 500;
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000; // el invitado tiene 24 h para aceptar
export const PLAY_WINDOW_MS = 24 * 60 * 60 * 1000; // tras aceptar, ambos tienen 24 h para jugar
export const ATTEMPT_LIMIT_MS = 120_000; // duración máxima de una partida
export const LOCK_MS = 30_000; // un estado transitorio más viejo que esto se considera interrumpido y se reanuda
export const MAX_OPEN_OUTGOING = 5;
export const MEMORY_LENGTH = 5;
export const TRIVIA_COUNT = 3;
export const MEMORY_SYMBOLS = ["🌙", "⭐", "🍀", "🔥", "💎", "🎮", "🪐", "🦊"] as const;

export type ChallengeStatus =
  | "funding" | "pending" | "accepting" | "accepted" | "settling" | "cancelling"
  | "completed" | "cancelled" | "declined" | "expired";
export type CloseAs = "cancelled" | "declined" | "expired";

export type Attempt = { startedAt: number; submittedAt?: number; score?: number; correct?: boolean };
export type Outcome =
  | { kind: "win"; winnerUid: string; reason: "score" | "forfeit"; scores: Record<string, number> }
  | { kind: "draw"; reason: "tie" | "nobody_played"; scores: Record<string, number> };

export type Challenge = {
  id: string;
  game: ChallengeGame;
  stake: number;
  challengerUid: string;
  challengerName: string;
  opponentUid: string;
  opponentName: string;
  status: ChallengeStatus;
  closeAs?: CloseAs;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  deadline?: number;
  lockedAt?: number | null;
  closedAt?: number;
  settledAt?: number;
  attempts?: Record<string, Attempt>;
  result?: Outcome;
};

export type ChallengeSecret =
  | { game: "memoria"; sequence: string[] }
  | { game: "trivia"; questions: TriviaQuestion[] };

export function validateStake(stake: unknown): number | null {
  return typeof stake === "number" && Number.isInteger(stake) && stake >= MIN_STAKE && stake <= MAX_STAKE ? stake : null;
}

/** Puntúa un intento con el reloj del servidor. */
export function scoreAttempt(secret: ChallengeSecret, answer: unknown, elapsedMs: number): { correct: boolean; score: number } {
  const fail = { correct: false, score: 0 };
  if (!Number.isFinite(elapsedMs) || elapsedMs > ATTEMPT_LIMIT_MS) return fail;
  if (secret.game === "memoria") {
    if (elapsedMs < 800) return fail; // más rápido que una persona
    if (!Array.isArray(answer) || answer.length !== secret.sequence.length) return fail;
    const ok = answer.every((s, i) => s === secret.sequence[i]);
    return ok ? { correct: true, score: Math.max(100, 1000 - Math.floor(elapsedMs / 20)) } : fail;
  }
  if (elapsedMs < 1000) return fail;
  if (!Array.isArray(answer) || answer.length !== secret.questions.length) return fail;
  let right = 0;
  answer.forEach((a, i) => { if (Number.isInteger(a) && a === secret.questions[i]!.answer) right++; });
  const bonus = right > 0 ? Math.max(0, 100 - Math.floor(elapsedMs / 1000)) : 0;
  return { correct: right === secret.questions.length, score: right * 300 + bonus };
}

type EffectiveAttempt = { done: boolean; score: number };

function effective(a: Attempt | undefined, now: number): EffectiveAttempt {
  if (!a) return { done: false, score: 0 };
  if (a.submittedAt !== undefined) return { done: true, score: a.score ?? 0 };
  // Empezó pero nunca envió y se acabó su tiempo: cuenta como intento fallido (0 puntos).
  if (now > a.startedAt + ATTEMPT_LIMIT_MS + 5_000) return { done: true, score: 0 };
  return { done: false, score: 0 };
}

/**
 * Decide el resultado de un reto aceptado, o `null` si todavía no se puede decidir.
 * Reglas:
 *  - Ambos terminaron: gana la mayor puntuación; igualdad = empate (se devuelven las monedas).
 *  - Venció el plazo y solo uno terminó: gana quien jugó (el otro abandonó).
 *  - Venció el plazo y nadie terminó: empate (se devuelven las monedas).
 */
export function decideOutcome(c: Pick<Challenge, "challengerUid" | "opponentUid" | "attempts" | "deadline">, now: number): Outcome | null {
  const a = effective(c.attempts?.[c.challengerUid], now);
  const b = effective(c.attempts?.[c.opponentUid], now);
  const scores = { [c.challengerUid]: a.score, [c.opponentUid]: b.score };
  if (a.done && b.done) {
    if (a.score === b.score) return { kind: "draw", reason: "tie", scores };
    return { kind: "win", winnerUid: a.score > b.score ? c.challengerUid : c.opponentUid, reason: "score", scores };
  }
  if (c.deadline !== undefined && now >= c.deadline) {
    if (a.done) return { kind: "win", winnerUid: c.challengerUid, reason: "forfeit", scores };
    if (b.done) return { kind: "win", winnerUid: c.opponentUid, reason: "forfeit", scores };
    return { kind: "draw", reason: "nobody_played", scores };
  }
  return null;
}
