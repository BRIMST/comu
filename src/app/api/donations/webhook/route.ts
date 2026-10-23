import { NextResponse } from "next/server";
import { services } from "@/lib/server/services";
import { paymentConfigFromEnv, verifyWompiEvent } from "@/lib/server/payments";
import { ApiError } from "@/lib/server/errors";

/**
 * Webhook del proveedor de pagos (Wompi). No usa sesión: se autentica con la firma del evento.
 * 200 = recibido; 401 = firma inválida; 5xx = el proveedor reintentará.
 */
export async function POST(req: Request) {
  const cfg = paymentConfigFromEnv();
  if (cfg.provider !== "wompi" || !cfg.wompi) return NextResponse.json({ error: "Proveedor no configurado." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const verified = verifyWompiEvent(body, req.headers.get("x-event-checksum"), cfg.wompi.eventsSecret);
  if (!verified.valid) return NextResponse.json({ error: "Firma no válida." }, { status: 401 });
  try {
    const r = await services().donations.handleWompiEvent(verified);
    return NextResponse.json({ ok: true, result: r.result });
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return NextResponse.json({ ok: true, ignored: true }); // evento legítimo pero inválido para nosotros: no reintentar
    console.error("webhook_error", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Error temporal." }, { status: 500 });
  }
}
