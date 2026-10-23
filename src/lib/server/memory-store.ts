import type { Store } from "./store";

/** Almacén en memoria para pruebas. Cada operación es atómica (JS es monohilo), igual que una transacción serializada. */
export function createMemoryStore(initial: Record<string, unknown> = {}): Store & { dump(): Record<string, unknown> } {
  let root: Record<string, unknown> = JSON.parse(JSON.stringify(initial));
  let counter = 0;
  const parts = (p: string) => p.split("/").filter(Boolean);
  const read = (p: string): unknown => {
    let cur: unknown = root;
    for (const k of parts(p)) { if (cur && typeof cur === "object" && k in (cur as object)) cur = (cur as Record<string, unknown>)[k]; else return null; }
    return cur === undefined ? null : cur;
  };
  const write = (p: string, v: unknown) => {
    const ks = parts(p);
    if (!ks.length) { root = (v ?? {}) as Record<string, unknown>; return; }
    const chain: Array<[Record<string, unknown>, string]> = [];
    let cur = root;
    for (const k of ks.slice(0, -1)) {
      if (!cur[k] || typeof cur[k] !== "object") { if (v === null || v === undefined) return; cur[k] = {}; }
      chain.push([cur, k]);
      cur = cur[k] as Record<string, unknown>;
    }
    const last = ks[ks.length - 1]!;
    if (v === null || v === undefined) {
      delete cur[last];
      // Como Firebase: los nodos que quedan vacíos desaparecen.
      for (let i = chain.length - 1; i >= 0; i--) { const [parent, key] = chain[i]!; if (Object.keys(parent[key] as object).length === 0) delete parent[key]; else break; }
    } else cur[last] = JSON.parse(JSON.stringify(v));
  };
  const clone = <T>(v: T): T => (v === null ? v : JSON.parse(JSON.stringify(v)));
  return {
    async get<T>(p: string) { await Promise.resolve(); return clone(read(p)) as T | null; },
    async set(p, v) { await Promise.resolve(); write(p, v); },
    async update(u) { await Promise.resolve(); for (const [p, v] of Object.entries(u)) write(p, v); },
    async transaction<T>(p: string, fn: (cur: T | null) => T | null | undefined) {
      await Promise.resolve();
      // Como el SDK real: primero con una caché local vacía (null); si el dato real difiere, se reintenta con él.
      const real = clone(read(p)) as T | null;
      if (real !== null) fn(null);
      const next = fn(clone(real));
      if (next === undefined) return { committed: false, value: real };
      write(p, next);
      return { committed: true, value: clone(next) };
    },
    async list<T>(p: string, { orderBy, limitLast, dir }: { orderBy: string; limitLast: number; dir?: "asc" | "desc" }) {
      await Promise.resolve();
      const node = (read(p) ?? {}) as Record<string, Record<string, number>>;
      const rows = Object.entries(node).map(([id, v]) => ({ ...clone(v), id })) as Array<T & { id: string }>;
      rows.sort((a, b) => Number((a as Record<string, unknown>)[orderBy] ?? 0) - Number((b as Record<string, unknown>)[orderBy] ?? 0));
      return dir === "asc" ? rows.slice(0, limitLast) : rows.slice(-limitLast);
    },
    async listKeys<T>(p: string, prefix: string, limit: number) {
      await Promise.resolve();
      const node = (read(p) ?? {}) as Record<string, unknown>;
      return Object.keys(node).filter((k) => k.startsWith(prefix)).sort().slice(0, limit).map((key) => ({ key, value: clone(node[key]) as T }));
    },
    newKey() { counter++; return `k${String(counter).padStart(19, "0")}`; }, // 20 caracteres, como las claves push de Firebase
    dump: () => clone(root),
  };
}
