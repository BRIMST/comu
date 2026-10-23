import { createHash, timingSafeEqual } from "node:crypto";

export type ProviderId = "none" | "manual" | "wompi";
export type WompiConfig = { publicKey: string; integritySecret: string; eventsSecret: string; checkoutUrl: string; apiUrl: string; verifyWithApi: boolean };
export type PaymentConfig = { provider: ProviderId; wompi?: WompiConfig; siteUrl?: string };
export type WompiTx = { id: string; status: string; amountInCents: number; reference: string; currency: string };

/**
 * Lee la configuración de pagos del entorno. Si faltan credenciales, el proveedor queda en "none":
 * nunca se simula un pago.
 */
export function paymentConfigFromEnv(env: Record<string, string | undefined> = process.env): PaymentConfig {
  const wanted = (env.DONATIONS_PROVIDER ?? "none").toLowerCase();
  const siteUrl = env.SITE_URL?.replace(/\/$/, "");
  if (wanted === "manual") return { provider: "manual", siteUrl };
  if (wanted === "wompi") {
    const { WOMPI_PUBLIC_KEY: publicKey, WOMPI_INTEGRITY_SECRET: integritySecret, WOMPI_EVENTS_SECRET: eventsSecret } = env;
    if (!publicKey || !integritySecret || !eventsSecret) return { provider: "none", siteUrl };
    const sandbox = publicKey.startsWith("pub_test_");
    return {
      provider: "wompi", siteUrl,
      wompi: {
        publicKey, integritySecret, eventsSecret,
        checkoutUrl: env.WOMPI_CHECKOUT_URL ?? "https://checkout.wompi.co/p/",
        apiUrl: (env.WOMPI_API_URL ?? (sandbox ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1")).replace(/\/$/, ""),
        verifyWithApi: env.WOMPI_VERIFY_WITH_API !== "false",
      },
    };
  }
  return { provider: "none", siteUrl };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a.toLowerCase()), y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Firma de integridad del Web Checkout: SHA256(referencia + monto en centavos + moneda + secreto de integridad). */
export const wompiIntegrity = (reference: string, amountInCents: number, currency: string, secret: string) => sha256(`${reference}${amountInCents}${currency}${secret}`);

export function buildWompiCheckoutUrl(cfg: WompiConfig, d: { reference: string; amountCOP: number }, redirectUrl: string) {
  const cents = d.amountCOP * 100;
  const q = new URLSearchParams({
    "public-key": cfg.publicKey, currency: "COP", "amount-in-cents": String(cents), reference: d.reference,
    "signature:integrity": wompiIntegrity(d.reference, cents, "COP", cfg.integritySecret), "redirect-url": redirectUrl,
  });
  return `${cfg.checkoutUrl}?${q.toString()}`;
}

const resolvePath = (obj: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

/**
 * Valida la autenticidad de un evento de Wompi: SHA256(valores de signature.properties + timestamp + secreto de eventos)
 * debe coincidir con el checksum (cabecera X-Event-Checksum o signature.checksum).
 */
export function verifyWompiEvent(body: unknown, headerChecksum: string | null, eventsSecret: string):
  { valid: false } | { valid: true; signedProps: string[]; tx: WompiTx } {
  if (!body || typeof body !== "object") return { valid: false };
  const b = body as { event?: unknown; data?: unknown; timestamp?: unknown; signature?: { properties?: unknown; checksum?: unknown } };
  if (b.event !== "transaction.updated") return { valid: false };
  const props = b.signature?.properties;
  const checksum = headerChecksum || (typeof b.signature?.checksum === "string" ? b.signature.checksum : "");
  if (!Array.isArray(props) || props.some((p) => typeof p !== "string") || !checksum || (typeof b.timestamp !== "number" && typeof b.timestamp !== "string")) return { valid: false };
  const values = (props as string[]).map((p) => resolvePath(b.data, p));
  if (values.some((v) => v === undefined || v === null)) return { valid: false };
  const expected = sha256(`${values.join("")}${b.timestamp}${eventsSecret}`);
  if (!safeEqualHex(expected, checksum)) return { valid: false };
  const t = (resolvePath(b.data, "transaction") ?? {}) as Record<string, unknown>;
  return {
    valid: true, signedProps: props as string[],
    tx: { id: String(t.id ?? ""), status: String(t.status ?? ""), amountInCents: Number(t.amount_in_cents), reference: String(t.reference ?? ""), currency: String(t.currency ?? "") },
  };
}

/** Consulta autoritativa de una transacción directamente a Wompi (servidor a servidor). */
export async function fetchWompiTransaction(cfg: WompiConfig, id: string, fetchImpl: typeof fetch = fetch): Promise<WompiTx | null> {
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(id)) return null;
  const res = await fetchImpl(`${cfg.apiUrl}/transactions/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  const d = json?.data;
  if (!d || typeof d !== "object") return null;
  return { id: String(d.id ?? ""), status: String(d.status ?? ""), amountInCents: Number(d.amount_in_cents), reference: String(d.reference ?? ""), currency: String(d.currency ?? "") };
}
