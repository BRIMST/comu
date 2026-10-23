import { beforeEach, describe, expect, it } from "vitest";
import { createChallengeService, ChallengeError } from "./challenge-service";
import { createMemoryStore } from "./memory-store";
import { ATTEMPT_LIMIT_MS, PENDING_TTL_MS, PLAY_WINDOW_MS, type Challenge, type ChallengeSecret } from "../domain/challenges";
import { reduceWallet } from "../domain/wallet-ops";

const A = "uidA", B = "uidB", C = "uidC";
let t = 1_000_000;
const clock = () => t;
const advance = (ms: number) => { t += ms; };

function seed(balances: Record<string, number> = { [A]: 100, [B]: 100, [C]: 100 }) {
  const data: Record<string, unknown> = {};
  for (const [uid, name] of [[A, "ana"], [B, "beto"], [C, "carla"]] as const) {
    data[`usernames/${name}`] = { uid, username: name };
    data[`publicProfiles/${uid}`] = { uid, username: name };
    data[`users/${uid}`] = { uid, role: "member" };
    data[`wallets/${uid}`] = { balance: balances[uid] ?? 0, updatedAt: 0 };
  }
  const nested: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) { const [a, b] = k.split("/"); (nested[a!] ??= {} as Record<string, unknown>); (nested[a!] as Record<string, unknown>)[b!] = v; }
  return createMemoryStore(nested);
}
const balance = async (s: ReturnType<typeof seed>, uid: string) => (await s.get<{ balance: number }>(`wallets/${uid}`))!.balance;
async function secretOf(s: ReturnType<typeof seed>, id: string) { return (await s.get<ChallengeSecret>(`challengeSecrets/${id}`))!; }
function correctAnswer(sec: ChallengeSecret) { return sec.game === "memoria" ? sec.sequence : sec.questions.map((q) => q.answer); }

beforeEach(() => { t = 1_000_000; });

describe("reduceWallet", () => {
  it("es idempotente por clave", () => {
    const a = reduceWallet({ balance: 10, updatedAt: 0 }, "k", 5, 1);
    expect(a.result).toBe("applied");
    expect(reduceWallet(a.next!, "k", 5, 2).result).toBe("duplicate");
  });
  it("no permite saldo negativo", () => {
    expect(reduceWallet({ balance: 3, updatedAt: 0 }, "k", -4, 1).result).toBe("insufficient");
    expect(reduceWallet(null, "k", -1, 1).result).toBe("insufficient");
  });
});

describe("retos: creación y reglas", () => {
  it("descuenta la apuesta del retador y deja el reto pendiente", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 30 });
    expect(ch.status).toBe("pending");
    expect(await balance(s, A)).toBe(70);
    expect(await balance(s, B)).toBe(100);
  });
  it("rechaza apostar más de lo disponible y no deja rastro", async () => {
    const s = seed({ [A]: 10, [B]: 100 }); const svc = createChallengeService({ store: s, clock });
    await expect(svc.create(A, { opponent: "beto", game: "trivia", stake: 50 })).rejects.toThrow(ChallengeError);
    expect(await balance(s, A)).toBe(10);
    expect(await svc.list(A)).toHaveLength(0);
  });
  it("valida apuesta, juego y oponente", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    await expect(svc.create(A, { opponent: "beto", game: "memoria", stake: 0 })).rejects.toThrow();
    await expect(svc.create(A, { opponent: "beto", game: "memoria", stake: 1.5 })).rejects.toThrow();
    await expect(svc.create(A, { opponent: "beto", game: "memoria", stake: 501 })).rejects.toThrow();
    await expect(svc.create(A, { opponent: "beto", game: "reflejos", stake: 5 })).rejects.toThrow();
    await expect(svc.create(A, { opponent: "ana", game: "memoria", stake: 5 })).rejects.toThrow("ti mismo");
    await expect(svc.create(A, { opponent: "nadie", game: "memoria", stake: 5 })).rejects.toThrow("No encontramos");
  });
  it("limita los retos enviados pendientes", async () => {
    const s = seed({ [A]: 1000, [B]: 100 }); const svc = createChallengeService({ store: s, clock });
    for (let i = 0; i < 5; i++) await svc.create(A, { opponent: "beto", game: "memoria", stake: 1 });
    await expect(svc.create(A, { opponent: "beto", game: "memoria", stake: 1 })).rejects.toThrow("esperando respuesta");
  });
  it("no filtra respuestas en la vista ni en el inicio de partida", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "trivia", stake: 5 });
    await svc.accept(B, ch.id);
    const p = await svc.start(A, ch.id);
    expect(JSON.stringify(p)).not.toContain("answer");
    expect(JSON.stringify(await svc.list(A))).not.toContain("answer");
  });
});

describe("retos: cancelación, rechazo y caducidad", () => {
  it("cancelar devuelve la apuesta una sola vez", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 40 });
    await Promise.allSettled([svc.cancel(A, ch.id), svc.cancel(A, ch.id), svc.decline(B, ch.id)]);
    expect(await balance(s, A)).toBe(100);
    expect((await svc.detail(A, ch.id)).status).toMatch(/cancelled|declined/);
  });
  it("solo el invitado acepta/rechaza y solo el retador cancela", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 10 });
    await expect(svc.accept(A, ch.id)).rejects.toThrow("invitado");
    await expect(svc.cancel(B, ch.id)).rejects.toThrow("Solo quien envió");
    await expect(svc.accept(C, ch.id)).rejects.toThrow("no encontrado");
  });
  it("caduca y devuelve la apuesta", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 25 });
    advance(PENDING_TTL_MS + 1);
    expect((await svc.detail(A, ch.id)).status).toBe("expired");
    expect(await balance(s, A)).toBe(100);
    await expect(svc.accept(B, ch.id)).rejects.toThrow();
    expect(await balance(s, B)).toBe(100);
  });
  it("no se puede cancelar un reto ya aceptado", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 10 });
    await svc.accept(B, ch.id);
    await expect(svc.cancel(A, ch.id)).rejects.toThrow("pendientes");
  });
});

describe("retos: aceptación", () => {
  it("aceptar dos veces en paralelo cobra al invitado una sola vez", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 30 });
    await Promise.allSettled([svc.accept(B, ch.id), svc.accept(B, ch.id), svc.accept(B, ch.id)]);
    expect(await balance(s, B)).toBe(70);
    expect((await svc.detail(B, ch.id)).status).toBe("accepted");
  });
  it("si el invitado no tiene monedas, el reto sigue pendiente", async () => {
    const s = seed({ [A]: 100, [B]: 5 }); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 30 });
    await expect(svc.accept(B, ch.id)).rejects.toThrow("monedas suficientes");
    expect((await svc.detail(B, ch.id)).status).toBe("pending");
    expect(await balance(s, B)).toBe(5);
  });
  it("aceptar y cancelar a la vez: el dinero siempre cuadra", async () => {
    for (let i = 0; i < 20; i++) {
      const s = seed(); const svc = createChallengeService({ store: s, clock });
      const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 30 });
      await Promise.allSettled([svc.accept(B, ch.id), svc.cancel(A, ch.id)]);
      const st = (await svc.detail(A, ch.id)).status;
      const total = (await balance(s, A)) + (await balance(s, B));
      if (st === "accepted") expect(total).toBe(140); else { expect(st).toBe("cancelled"); expect(total).toBe(200); }
    }
  });
});

async function accepted(stake = 30, game: "memoria" | "trivia" = "memoria") {
  const s = seed(); const svc = createChallengeService({ store: s, clock });
  const ch = await svc.create(A, { opponent: "beto", game, stake });
  await svc.accept(B, ch.id);
  return { s, svc, id: ch.id };
}

describe("retos: juego y resolución", () => {
  it("gana quien tiene mayor puntuación y recibe ambas apuestas (suma cero)", async () => {
    const { s, svc, id } = await accepted(30);
    const sec = await secretOf(s, id);
    await svc.start(A, id); await svc.start(B, id);
    advance(3000);
    await svc.submit(A, id, correctAnswer(sec));
    advance(5000);
    await svc.submit(B, id, correctAnswer(sec));
    const d = await svc.detail(A, id);
    expect(d.status).toBe("completed");
    expect(d.result?.youWon).toBe(true);
    expect(await balance(s, A)).toBe(130);
    expect(await balance(s, B)).toBe(70);
    expect((await balance(s, A)) + (await balance(s, B))).toBe(200);
  });
  it("respuesta incorrecta pierde frente a una correcta", async () => {
    const { s, svc, id } = await accepted(10);
    const sec = await secretOf(s, id);
    await svc.start(A, id); await svc.start(B, id); advance(3000);
    await svc.submit(A, id, ["x", "x", "x", "x", "x"]);
    await svc.submit(B, id, correctAnswer(sec));
    expect((await svc.detail(B, id)).result?.youWon).toBe(true);
    expect(await balance(s, B)).toBe(110);
  });
  it("empate devuelve las monedas", async () => {
    const { s, svc, id } = await accepted(20);
    await svc.start(A, id); await svc.start(B, id); advance(3000);
    await svc.submit(A, id, ["x", "x", "x", "x", "x"]);
    await svc.submit(B, id, ["y", "y", "y", "y", "y"]);
    const d = await svc.detail(A, id);
    expect(d.result?.kind).toBe("draw");
    expect(await balance(s, A)).toBe(100);
    expect(await balance(s, B)).toBe(100);
  });
  it("no se puede enviar dos veces ni sin iniciar; resultados falsos tiempo imposible puntúan 0", async () => {
    const { s, svc, id } = await accepted(10);
    const sec = await secretOf(s, id);
    await expect(svc.submit(A, id, correctAnswer(sec))).rejects.toThrow();
    await svc.start(A, id);
    advance(100); // más rápido que una persona
    const r = await svc.submit(A, id, correctAnswer(sec));
    expect(r.score).toBe(0);
    await expect(svc.submit(A, id, correctAnswer(sec))).rejects.toThrow();
  });
  it("tras pasar el límite de la partida el resultado vale 0", async () => {
    const { s, svc, id } = await accepted(10);
    const sec = await secretOf(s, id);
    await svc.start(A, id); advance(ATTEMPT_LIMIT_MS + 1000);
    const r = await svc.submit(A, id, correctAnswer(sec));
    expect(r.score).toBe(0);
  });
  it("abandono: gana quien jugó cuando vence el plazo", async () => {
    const { s, svc, id } = await accepted(30);
    const sec = await secretOf(s, id);
    await svc.start(A, id); advance(3000);
    await svc.submit(A, id, correctAnswer(sec));
    expect((await svc.detail(A, id)).status).toBe("accepted");
    advance(PLAY_WINDOW_MS + 1);
    const d = await svc.detail(B, id);
    expect(d.status).toBe("completed");
    expect(d.result?.youWon).toBe(false);
    expect(await balance(s, A)).toBe(130);
    expect(await balance(s, B)).toBe(70);
  });
  it("nadie juega: se devuelven las monedas a ambos", async () => {
    const { s, svc, id } = await accepted(30);
    advance(PLAY_WINDOW_MS + 1);
    expect((await svc.detail(A, id)).result?.kind).toBe("draw");
    expect(await balance(s, A)).toBe(100);
    expect(await balance(s, B)).toBe(100);
  });
  it("resolver en paralelo paga una sola vez", async () => {
    const { s, svc, id } = await accepted(30);
    const sec = await secretOf(s, id);
    await svc.start(A, id); await svc.start(B, id); advance(3000);
    await svc.submit(A, id, correctAnswer(sec));
    await Promise.allSettled([svc.submit(B, id, ["x", "x", "x", "x", "x"]), svc.refresh(id), svc.refresh(id), svc.detail(A, id), svc.detail(B, id)]);
    expect(await balance(s, A)).toBe(130);
    expect(await balance(s, B)).toBe(70);
    const ledger = await s.get<Record<string, unknown>>(`walletTransactions/${A}`);
    expect(Object.keys(ledger!).filter((k) => k.includes("payout"))).toHaveLength(1);
  });
  it("trivia funciona de extremo a extremo", async () => {
    const { s, svc, id } = await accepted(15, "trivia");
    const sec = await secretOf(s, id);
    await svc.start(A, id); await svc.start(B, id); advance(4000);
    await svc.submit(B, id, correctAnswer(sec));
    await svc.submit(A, id, [9, 9, 9]);
    expect((await svc.detail(B, id)).result?.youWon).toBe(true);
  });
  it("un tercero no puede ver ni jugar el reto", async () => {
    const { svc, id } = await accepted(10);
    await expect(svc.detail(C, id)).rejects.toThrow("no encontrado");
    await expect(svc.start(C, id)).rejects.toThrow("no encontrado");
  });
  it("reanuda una aceptación interrumpida sin cobrar dos veces", async () => {
    const s = seed(); const svc = createChallengeService({ store: s, clock });
    const ch = await svc.create(A, { opponent: "beto", game: "memoria", stake: 30 });
    // Simula caída tras cobrar al invitado pero antes de marcar "accepted".
    await s.update({ [`challenges/${ch.id}/status`]: "accepting", [`challenges/${ch.id}/lockedAt`]: t });
    await s.transaction("wallets/" + B, (w: { balance: number } | null) => (w === null ? null : { ...w, balance: w.balance - 30, ops: { [`ch:${ch.id}:stake:${B}`]: -30 } }));
    advance(60_000);
    expect((await svc.detail(B, ch.id)).status).toBe("accepted");
    expect(await balance(s, B)).toBe(70);
  });
  it("conserva el total de monedas en todo el sistema", async () => {
    const { s, svc, id } = await accepted(37);
    const sec = await secretOf(s, id);
    await svc.start(A, id); advance(2000); await svc.submit(A, id, correctAnswer(sec));
    advance(PLAY_WINDOW_MS + 1); await svc.refresh(id);
    expect((await balance(s, A)) + (await balance(s, B)) + (await balance(s, C))).toBe(300);
    const chn = await s.get<Challenge>(`challenges/${id}`);
    expect(chn!.status).toBe("completed");
  });
});
