import { reduceWallet, type WalletNode, type WalletOpResult } from "../domain/wallet-ops";
import type { Store } from "./store";

/**
 * Único punto por el que cambia un saldo. Atómico (transacción sobre wallets/{uid}) e idempotente
 * (`key` se aplica una sola vez). Después registra el movimiento en el libro, también una sola vez.
 */
export async function applyWalletOp(
  store: Store,
  uid: string,
  key: string,
  delta: number,
  type: string,
  description: string,
  meta: Record<string, string | number> = {},
  now: number = Date.now(),
): Promise<WalletOpResult> {
  let result = "insufficient" as WalletOpResult;
  await store.transaction<WalletNode>(`wallets/${uid}`, (cur) => {
    const r = reduceWallet(cur, key, delta, now);
    result = r.result;
    return r.next;
  });
  if (result === "applied" || result === "duplicate") {
    const entry = { amount: delta, type, description, createdAt: now, ...meta };
    // Libro inmutable: solo se crea si no existe.
    await store.transaction(`walletTransactions/${uid}/${key}`, (cur) => (cur === null ? entry : undefined));
  }
  return result;
}
