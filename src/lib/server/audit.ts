import type { Store } from "./store";

export type AuditEntry = { id: string; action: string; adminUid: string; createdAt: number } & Record<string, unknown>;
type Row = { action: string; adminUid: string; createdAt: number } & Record<string, unknown>;

/** Registro de auditoría: por administrador (compatibilidad) y en un índice global cronológico. */
export async function writeAudit(store: Store, now: number, adminUid: string, action: string, meta: Record<string, unknown> = {}) {
  const key = `${now}-${store.newKey("auditFeed").slice(-6)}`;
  const entry = JSON.parse(JSON.stringify({ ...meta, action, adminUid, createdAt: now }));
  await store.update({ [`adminAuditLogs/${adminUid}/${key}`]: entry, [`auditFeed/${key}`]: entry });
}

export async function listAudit(store: Store, limit = 60) {
  const rows = await store.list<Row>("auditFeed", { orderBy: "createdAt", limitLast: limit });
  const names = new Map<string, string>();
  for (const uid of new Set(rows.map((r) => r.adminUid))) {
    names.set(uid, (await store.get<{ username?: string }>(`publicProfiles/${uid}`))?.username ?? uid.slice(0, 8));
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ ...r, admin: names.get(r.adminUid) ?? r.adminUid.slice(0, 8) })) as Array<AuditEntry & { admin: string }>;
}
