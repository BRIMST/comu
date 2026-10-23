import { ApiError } from "./errors";
import type { Store } from "./store";

/** Contador por ventana fija guardado en la base (funciona entre instancias serverless). */
export async function rateLimit(store: Store, now: number, uid: string, bucket: string, max: number, windowMs: number) {
  let allowed = false;
  await store.transaction<{ start: number; count: number }>(`rateLimits/${uid}/${bucket}`, (cur) => {
    const fresh = !cur || now - cur.start >= windowMs;
    const next = fresh ? { start: now, count: 1 } : { start: cur.start, count: cur.count + 1 };
    allowed = next.count <= max;
    return allowed ? next : undefined;
  });
  if (!allowed) throw new ApiError("Demasiadas solicitudes. Intenta de nuevo en un momento.", 429);
}
