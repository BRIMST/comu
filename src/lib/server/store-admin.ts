import "server-only";
import { adminDb } from "./firebase-admin";
import type { Store } from "./store";

export function adminStore(): Store {
  const db = adminDb();
  return {
    async get(path) { const s = await db.ref(path).get(); return s.exists() ? s.val() : null; },
    async set(path, value) { await db.ref(path).set(value); },
    async update(updates) { await db.ref().update(updates); },
    async transaction(path, fn) {
      const r = await db.ref(path).transaction(fn as (cur: unknown) => unknown);
      return { committed: r.committed, value: r.snapshot.val() };
    },
    async list(path, { orderBy, limitLast, dir }) {
      const q = db.ref(path).orderByChild(orderBy);
      const snap = await (dir === "asc" ? q.limitToFirst(limitLast) : q.limitToLast(limitLast)).get();
      const rows: unknown[] = [];
      snap.forEach((c) => { rows.push({ ...(c.val() as object), id: c.key }); });
      return rows as never;
    },
    async listKeys(path, prefix, limit) {
      const snap = await db.ref(path).orderByKey().startAt(prefix).endAt(`${prefix}\uf8ff`).limitToFirst(limit).get();
      const rows: Array<{ key: string; value: unknown }> = [];
      snap.forEach((c) => { rows.push({ key: c.key as string, value: c.val() }); });
      return rows as never;
    },
    newKey(path) { return db.ref(path).push().key as string; },
  };
}
