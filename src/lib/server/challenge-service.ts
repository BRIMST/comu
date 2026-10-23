import {
  ATTEMPT_LIMIT_MS, CHALLENGE_GAMES, LOCK_MS, MAX_OPEN_OUTGOING, MEMORY_LENGTH, MEMORY_SYMBOLS,
  PENDING_TTL_MS, PLAY_WINDOW_MS, TRIVIA_COUNT, decideOutcome, scoreAttempt, validateStake,
  type Attempt, type Challenge, type ChallengeGame, type ChallengeSecret, type ChallengeStatus, type CloseAs,
} from "../domain/challenges";
import { pickQuestions } from "../domain/trivia";
import type { Notifier } from "../domain/community";
import { ApiError } from "./errors";
import { bump } from "./metrics";
import { rateLimit } from "./rate-limit";
import { assertFeature } from "./settings";
import type { Store } from "./store";
import { applyWalletOp } from "./wallet";

export class ChallengeError extends ApiError {}

type Deps = { store: Store; clock?: () => number; random?: () => number; notify?: Notifier; onResult?: (uid: string, e: { key: string; game: string; result: "win" | "loss" | "draw" }) => Promise<void> };
const GAME_LABEL = { memoria: "Memoria visual", trivia: "Trivia comunitaria" } as const;

export function createChallengeService(deps: Deps) {
  const { store } = deps;
  const clock = deps.clock ?? Date.now;
  const random = deps.random ?? Math.random;
  const path = (id: string) => `challenges/${id}`;
  /** Las notificaciones nunca deben romper ni retrasar un reto: se ignoran los errores. */
  const tell: Notifier = async (...args) => { try { await deps.notify?.(...args); } catch { /* noop */ } };

  // ---------- utilidades ----------
  async function username(uid: string): Promise<string> {
    const p = await store.get<{ username?: string }>(`publicProfiles/${uid}`);
    return p?.username ?? uid.slice(0, 8);
  }
  async function assertActive(uid: string) {
    const u = await store.get<{ suspended?: boolean }>(`users/${uid}`);
    if (u?.suspended) throw new ChallengeError("Tu cuenta está suspendida.", 403);
  }
  const limit = (uid: string, bucket: string, max: number, windowMs: number) => rateLimit(store, clock(), uid, bucket, max, windowMs);

  /** Cambia el estado solo si el reto sigue en `from` (compare-and-set). Devuelve el reto resultante o null. */
  async function transition(id: string, from: ChallengeStatus[], to: ChallengeStatus, patch: Partial<Challenge> = {}): Promise<Challenge | null> {
    let won = false;
    const r = await store.transaction<Challenge>(path(id), (cur) => {
      if (cur === null) return null;
      if (!from.includes(cur.status)) { won = false; return undefined; }
      won = true;
      return { ...cur, ...patch, status: to };
    });
    return won && r.committed ? r.value : null;
  }

  // ---------- pasos reanudables (todos idempotentes) ----------
  async function runFund(ch: Challenge): Promise<"ok" | "insufficient"> {
    const res = await applyWalletOp(store, ch.challengerUid, `ch:${ch.id}:stake:${ch.challengerUid}`, -ch.stake, "challenge_stake", `Reto contra @${ch.opponentName}: monedas en juego`, { challengeId: ch.id });
    if (res === "insufficient") return "insufficient";
    await transition(ch.id, ["funding"], "pending", { lockedAt: null });
    return "ok";
  }
  async function runAccept(ch: Challenge): Promise<"ok" | "insufficient"> {
    const res = await applyWalletOp(store, ch.opponentUid, `ch:${ch.id}:stake:${ch.opponentUid}`, -ch.stake, "challenge_stake", `Reto contra @${ch.challengerName}: monedas en juego`, { challengeId: ch.id });
    if (res === "insufficient") { await transition(ch.id, ["accepting"], "pending", { lockedAt: null }); return "insufficient"; }
    const now = clock();
    await transition(ch.id, ["accepting"], "accepted", { acceptedAt: now, deadline: now + PLAY_WINDOW_MS, lockedAt: null });
    await tell(ch.challengerUid, `ch:${ch.id}:accepted`, "challenges", "Reto aceptado", `@${ch.opponentName} aceptó tu reto de ${GAME_LABEL[ch.game]}. ¡Ya pueden jugar!`, "/retos");
    return "ok";
  }
  async function runClose(ch: Challenge) {
    const closeAs = ch.closeAs ?? "cancelled";
    await applyWalletOp(store, ch.challengerUid, `ch:${ch.id}:refund:${ch.challengerUid}`, ch.stake, "challenge_refund", "Reto sin jugar: monedas devueltas", { challengeId: ch.id });
    await transition(ch.id, ["cancelling"], closeAs, { closedAt: clock(), lockedAt: null });
    if (closeAs === "declined") await tell(ch.challengerUid, `ch:${ch.id}:declined`, "challenges", "Reto rechazado", `@${ch.opponentName} rechazó tu reto. Tus monedas fueron devueltas.`, "/retos");
    if (closeAs === "expired") await tell(ch.challengerUid, `ch:${ch.id}:expired`, "challenges", "Reto caducado", `@${ch.opponentName} no respondió a tiempo. Tus monedas fueron devueltas.`, "/retos");
    if (closeAs === "cancelled") await tell(ch.opponentUid, `ch:${ch.id}:cancelled`, "challenges", "Reto cancelado", `@${ch.challengerName} canceló el reto.`, "/retos");
  }
  async function runSettle(ch: Challenge) {
    const out = ch.result;
    if (!out) return;
    if (out.kind === "win") {
      await applyWalletOp(store, out.winnerUid, `ch:${ch.id}:payout:${out.winnerUid}`, ch.stake * 2, "challenge_win", "Reto ganado", { challengeId: ch.id });
    } else {
      for (const uid of [ch.challengerUid, ch.opponentUid]) {
        await applyWalletOp(store, uid, `ch:${ch.id}:refund:${uid}`, ch.stake, "challenge_refund", "Reto empatado: monedas devueltas", { challengeId: ch.id });
      }
    }
    const done = await transition(ch.id, ["settling"], "completed", { settledAt: clock(), lockedAt: null });
    if (done) await bump(store, clock(), "challenges_completed");
    for (const [uid, other] of [[ch.challengerUid, ch.opponentName], [ch.opponentUid, ch.challengerName]] as const) {
      const body = out.kind === "draw" ? `Empate contra @${other}: tus monedas fueron devueltas.`
        : out.winnerUid === uid ? `¡Ganaste contra @${other}! +${ch.stake} 🪙` : `Perdiste contra @${other}. −${ch.stake} 🪙`;
      await tell(uid, `ch:${ch.id}:result:${uid}`, "results", "Resultado del reto", body, "/retos");
      const result = out.kind === "draw" ? "draw" : out.winnerUid === uid ? "win" : "loss";
      try { await deps.onResult?.(uid, { key: `ch-${ch.id}`, game: ch.game, result }); } catch { /* el progreso nunca bloquea la resolución de un reto */ }
    }
  }

  async function closePending(ch: Challenge, closeAs: CloseAs): Promise<boolean> {
    const claimed = await transition(ch.id, ["pending"], "cancelling", { closeAs, lockedAt: clock() });
    if (!claimed) return false;
    await runClose(claimed);
    return true;
  }
  async function trySettle(ch: Challenge): Promise<boolean> {
    const now = clock();
    const outcome = decideOutcome(ch, now);
    if (!outcome) return false;
    const claimed = await transition(ch.id, ["accepted"], "settling", { result: outcome, lockedAt: now });
    if (claimed) await runSettle(claimed);
    return true; // alguien (nosotros u otro) avanzó el estado: volver a leer
  }

  /** Lleva el reto al estado correcto: caduca, reanuda pasos interrumpidos y resuelve si ya se puede. */
  async function refresh(id: string): Promise<Challenge | null> {
    for (let i = 0; i < 6; i++) {
      const ch = await store.get<Challenge>(path(id));
      if (!ch) return null;
      const now = clock();
      const stale = ch.lockedAt != null && now - ch.lockedAt > LOCK_MS;
      switch (ch.status) {
        case "funding":
          if (!stale) return ch;
          if ((await runFund(ch)) === "insufficient") await transition(ch.id, ["funding"], "cancelled", { closeAs: "cancelled", closedAt: now, lockedAt: null });
          continue;
        case "pending":
          if (now > ch.expiresAt) { await closePending(ch, "expired"); continue; }
          return ch;
        case "accepting": if (!stale) return ch; await runAccept(ch); continue;
        case "cancelling": if (!stale) return ch; await runClose(ch); continue;
        case "settling": if (!stale) return ch; await runSettle(ch); continue;
        case "accepted": if (await trySettle(ch)) continue; return ch;
        default: return ch;
      }
    }
    return store.get<Challenge>(path(id));
  }

  function mustBeParticipant(ch: Challenge | null, uid: string): Challenge {
    if (!ch || (ch.challengerUid !== uid && ch.opponentUid !== uid)) throw new ChallengeError("Reto no encontrado.", 404);
    return ch;
  }

  // ---------- acciones públicas ----------
  async function create(uid: string, input: { opponent: string; game: string; stake: unknown }): Promise<Challenge> {
    await assertFeature(store, "challenges");
    await assertActive(uid);
    const stake = validateStake(input.stake);
    if (stake === null) throw new ChallengeError("La apuesta debe ser un número entero entre 1 y 500 monedas.");
    if (!(CHALLENGE_GAMES as readonly string[]).includes(input.game)) throw new ChallengeError("Ese minijuego no está disponible para retos.");
    const game = input.game as ChallengeGame;
    await limit(uid, "challenge_create", 10, 60 * 60 * 1000);

    const target = await store.get<{ uid: string }>(`usernames/${input.opponent.toLowerCase()}`);
    if (!target) throw new ChallengeError("No encontramos a ese usuario.", 404);
    if (target.uid === uid) throw new ChallengeError("No puedes retarte a ti mismo.");
    const targetUser = await store.get<{ suspended?: boolean }>(`users/${target.uid}`);
    if (!targetUser || targetUser.suspended) throw new ChallengeError("Ese usuario no puede recibir retos ahora.", 400);

    const mine = (await store.get<Record<string, true>>(`userChallenges/${uid}`)) ?? {};
    const recent = await Promise.all(Object.keys(mine).sort().slice(-40).map((id) => store.get<Challenge>(path(id))));
    const open = recent.filter((c) => c && c.challengerUid === uid && ["funding", "pending", "accepting"].includes(c.status)).length;
    if (open >= MAX_OPEN_OUTGOING) throw new ChallengeError(`Ya tienes ${MAX_OPEN_OUTGOING} retos enviados esperando respuesta.`, 429);

    const now = clock();
    const id = store.newKey("challenges");
    const secret: ChallengeSecret = game === "memoria"
      ? { game, sequence: Array.from({ length: MEMORY_LENGTH }, () => MEMORY_SYMBOLS[Math.floor(random() * MEMORY_SYMBOLS.length)]!) }
      : { game, questions: pickQuestions(TRIVIA_COUNT, random) };
    const ch: Challenge = {
      id, game, stake, challengerUid: uid, challengerName: await username(uid), opponentUid: target.uid,
      opponentName: input.opponent.toLowerCase(), status: "funding", createdAt: now, expiresAt: now + PENDING_TTL_MS, lockedAt: now,
    };
    await store.update({
      [`challengeSecrets/${id}`]: secret,
      [path(id)]: ch,
      [`userChallenges/${uid}/${id}`]: true,
      [`userChallenges/${target.uid}/${id}`]: true,
    });
    if ((await runFund(ch)) === "insufficient") {
      await store.update({ [`challengeSecrets/${id}`]: null, [path(id)]: null, [`userChallenges/${uid}/${id}`]: null, [`userChallenges/${target.uid}/${id}`]: null });
      throw new ChallengeError("No tienes monedas suficientes para esa apuesta.");
    }
    await bump(store, clock(), "challenges_created");
    await tell(target.uid, `ch:${id}:invite`, "challenges", "Te retaron", `@${ch.challengerName} te retó a ${GAME_LABEL[game]} por ${stake} 🪙`, "/retos");
    return (await store.get<Challenge>(path(id)))!;
  }

  async function accept(uid: string, id: string) {
    await assertFeature(store, "challenges");
    await assertActive(uid);
    await limit(uid, "challenge_action", 60, 60_000);
    const ch = mustBeParticipant(await refresh(id), uid);
    if (ch.opponentUid !== uid) throw new ChallengeError("Solo el invitado puede aceptar.", 403);
    if (ch.status !== "pending") throw new ChallengeError("Este reto ya no está disponible.", 409);
    const claimed = await transition(id, ["pending"], "accepting", { lockedAt: clock() });
    if (!claimed) throw new ChallengeError("El reto cambió de estado. Actualiza la lista.", 409);
    if ((await runAccept(claimed)) === "insufficient") throw new ChallengeError("No tienes monedas suficientes para aceptar este reto.");
  }

  async function decline(uid: string, id: string) {
    await limit(uid, "challenge_action", 60, 60_000);
    const ch = mustBeParticipant(await refresh(id), uid);
    if (ch.opponentUid !== uid) throw new ChallengeError("Solo el invitado puede rechazar.", 403);
    if (!(await closePending(ch, "declined"))) throw new ChallengeError("Este reto ya no está pendiente.", 409);
  }

  /** Cancelar solo es posible mientras está pendiente. Una vez aceptado, las monedas quedan en juego: abandonar = perder. */
  async function cancel(uid: string, id: string) {
    await limit(uid, "challenge_action", 60, 60_000);
    const ch = mustBeParticipant(await refresh(id), uid);
    if (ch.challengerUid !== uid) throw new ChallengeError("Solo quien envió el reto puede cancelarlo.", 403);
    if (!(await closePending(ch, "cancelled"))) throw new ChallengeError("Solo se pueden cancelar retos pendientes. Si ya fue aceptado, las monedas quedan en juego.", 409);
  }

  async function start(uid: string, id: string) {
    await assertFeature(store, "challenges");
    await assertActive(uid);
    await limit(uid, "challenge_action", 60, 60_000);
    const ch = mustBeParticipant(await refresh(id), uid);
    if (ch.status !== "accepted") throw new ChallengeError("Este reto no está listo para jugarse.", 409);
    const now = clock();
    if (ch.deadline !== undefined && now >= ch.deadline) throw new ChallengeError("El plazo para jugar terminó.", 409);

    await store.transaction<Attempt>(`${path(id)}/attempts/${uid}`, (cur) => (cur === null ? { startedAt: now } : undefined));
    const attempt = (await store.get<Attempt>(`${path(id)}/attempts/${uid}`))!;
    if (attempt.submittedAt !== undefined) throw new ChallengeError("Ya jugaste este reto.", 409);
    if (now > attempt.startedAt + ATTEMPT_LIMIT_MS) throw new ChallengeError("Tu tiempo de partida terminó.", 409);

    const secret = (await store.get<ChallengeSecret>(`challengeSecrets/${id}`))!;
    const payload = secret.game === "memoria"
      ? { game: "memoria" as const, sequence: secret.sequence }
      : { game: "trivia" as const, questions: secret.questions.map((q) => ({ prompt: q.prompt, options: q.options })) };
    return { startedAt: attempt.startedAt, limitMs: ATTEMPT_LIMIT_MS, challenge: payload };
  }

  async function submit(uid: string, id: string, answer: unknown) {
    await limit(uid, "challenge_action", 60, 60_000);
    const ch = mustBeParticipant(await refresh(id), uid);
    if (ch.status !== "accepted") throw new ChallengeError("Este reto ya no admite resultados.", 409);
    const secret = (await store.get<ChallengeSecret>(`challengeSecrets/${id}`))!;
    const now = clock();
    let outcome = null as { correct: boolean; score: number } | null;
    await store.transaction<Attempt>(`${path(id)}/attempts/${uid}`, (cur) => {
      if (cur === null) return null;
      if (cur.submittedAt !== undefined) { outcome = null; return undefined; }
      outcome = scoreAttempt(secret, answer, now - cur.startedAt);
      return { ...cur, submittedAt: now, ...outcome };
    });
    if (!outcome) throw new ChallengeError("No hay una partida iniciada o ya enviaste tu resultado.", 409);
    await refresh(id);
    return outcome;
  }

  // ---------- lectura ----------
  function view(ch: Challenge, uid: string) {
    const mine = ch.challengerUid === uid ? "challenger" : "opponent";
    const attempt = ch.attempts?.[uid];
    const done = ch.status === "completed";
    const theirUid = mine === "challenger" ? ch.opponentUid : ch.challengerUid;
    return {
      id: ch.id, game: ch.game, stake: ch.stake, status: ch.status, role: mine,
      otherName: mine === "challenger" ? ch.opponentName : ch.challengerName,
      createdAt: ch.createdAt, expiresAt: ch.expiresAt, deadline: ch.deadline ?? null,
      myAttempt: attempt ? { started: true, submitted: attempt.submittedAt !== undefined } : { started: false, submitted: false },
      result: done && ch.result ? {
        kind: ch.result.kind, reason: ch.result.reason,
        youWon: ch.result.kind === "win" ? ch.result.winnerUid === uid : null,
        yourScore: ch.result.scores[uid] ?? 0, theirScore: ch.result.scores[theirUid] ?? 0,
      } : null,
    };
  }

  async function list(uid: string) {
    const ids = Object.keys((await store.get<Record<string, true>>(`userChallenges/${uid}`)) ?? {}).sort().slice(-30);
    const all = await Promise.all(ids.map((id) => refresh(id)));
    return all.filter((c): c is Challenge => !!c).sort((a, b) => b.createdAt - a.createdAt).map((c) => view(c, uid));
  }
  async function detail(uid: string, id: string) {
    return view(mustBeParticipant(await refresh(id), uid), uid);
  }

  return { create, accept, decline, cancel, start, submit, list, detail, refresh };
}
