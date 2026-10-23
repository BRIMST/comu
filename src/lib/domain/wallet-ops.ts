export type WalletNode = { balance: number; updatedAt: number; ops?: Record<string, number> };
export type WalletOpResult = "applied" | "duplicate" | "insufficient";

/**
 * Reductor puro usado dentro de una transacción de Firebase.
 * - Idempotente: cada `key` se aplica una sola vez (queda registrada en `ops`).
 * - Nunca permite saldo negativo.
 * `next === undefined` significa "abortar la transacción".
 */
export function reduceWallet(
  w: WalletNode | null,
  key: string,
  delta: number,
  now: number,
): { next: WalletNode | null | undefined; result: WalletOpResult } {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("INVALID_DELTA");
  if (w && w.ops && w.ops[key] !== undefined) return { next: undefined, result: "duplicate" };
  // Con `null` no abortamos: puede ser la caché local de Firebase; devolver `null` fuerza el reintento con el dato real.
  if (w === null && delta < 0) return { next: null, result: "insufficient" };
  const balance = Math.max(0, Number(w?.balance ?? 0));
  if (balance + delta < 0) return { next: undefined, result: "insufficient" };
  return {
    next: { ...(w ?? {}), balance: balance + delta, updatedAt: now, ops: { ...(w?.ops ?? {}), [key]: delta } },
    result: "applied",
  };
}
