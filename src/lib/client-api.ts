export async function api<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((d as { error?: string }).error ?? "No se pudo completar la acción."), { status: r.status });
  return d as T;
}
