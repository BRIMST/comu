import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createCommunityService } from "./community-service";
import { createDonationService } from "./donation-service";
import { createMemoryStore } from "./memory-store";
import { buildWompiCheckoutUrl, paymentConfigFromEnv, verifyWompiEvent, wompiIntegrity, type PaymentConfig } from "./payments";
import { createProgressService } from "./progress-service";

let t = 1_760_000_000_000;
const clock = () => t;
beforeEach(() => { t = 1_760_000_000_000; });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const EVENTS = "test_events_secret", INTEGRITY = "test_integrity_secret";
const wompiCfg: PaymentConfig = { provider: "wompi", wompi: { publicKey: "pub_test_abc", integritySecret: INTEGRITY, eventsSecret: EVENTS, checkoutUrl: "https://checkout.wompi.co/p/", apiUrl: "https://sandbox.wompi.co/v1", verifyWithApi: true } };

function setup(config: PaymentConfig = wompiCfg, remote: Record<string, { status: string; amount_in_cents: number; reference: string; currency?: string }> = {}) {
  const store = createMemoryStore({
    usernames: { ana: { uid: "A", username: "ana" } }, publicProfiles: { A: { username: "ana" } }, profiles: { A: { username: "ana", xp: 0, level: 1 } },
    users: { A: { role: "member" } }, wallets: { A: { balance: 50, updatedAt: 0 } },
  });
  const community = createCommunityService({ store, clock });
  const fetchImpl = (async (url: string) => {
    const id = decodeURIComponent(String(url).split("/transactions/")[1] ?? "");
    const r = remote[id];
    return r ? new Response(JSON.stringify({ data: { id, currency: "COP", ...r } }), { status: 200 }) : new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  const svc = createDonationService({ store, config, clock, notify: community.notify, fetchImpl });
  return { store, svc, community };
}
/** Evento firmado como lo describe la documentación de Wompi. */
function signedEvent(tx: { id: string; status: string; amount_in_cents: number; reference: string; currency?: string }, secret = EVENTS, timestamp = 1_760_000_000, extraProps: string[] = []) {
  const props = ["transaction.id", "transaction.status", "transaction.amount_in_cents", ...extraProps];
  const data = { transaction: { currency: "COP", ...tx } };
  const get = (p: string) => (data.transaction as Record<string, unknown>)[p.split(".")[1]!];
  const checksum = sha(`${props.map(get).join("")}${timestamp}${secret}`);
  return { event: "transaction.updated", data, sent_at: "2026-10-20T00:00:00Z", timestamp, signature: { properties: props, checksum }, environment: "test" };
}
async function pendingDonation(s: ReturnType<typeof setup>, amount = 20_000, goalId?: string) {
  const r = await s.svc.start("A", { amountCOP: amount, goalId, thanks: { show: true, name: "Ana", message: "¡Vamos!" } }, "https://refugio.test");
  return { ...r, reference: `RF-${r.id}` };
}

describe("firmas de Wompi", () => {
  it("la firma de integridad coincide con el ejemplo oficial de la documentación", () => {
    expect(wompiIntegrity("sk8-438k4-xmxm392-sn2m2", 490000, "COP", "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6"))
      .toBe("37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5");
  });
  it("la URL de checkout incluye monto en centavos, firma y redirección", () => {
    const url = new URL(buildWompiCheckoutUrl(wompiCfg.wompi!, { reference: "RF-x", amountCOP: 20_000 }, "https://refugio.test/apoyar/gracias/x"));
    expect(url.searchParams.get("amount-in-cents")).toBe("2000000");
    expect(url.searchParams.get("currency")).toBe("COP");
    expect(url.searchParams.get("signature:integrity")).toBe(wompiIntegrity("RF-x", 2000000, "COP", INTEGRITY));
    expect(url.searchParams.get("public-key")).toBe("pub_test_abc");
  });
  it("acepta un evento bien firmado y rechaza uno alterado o con otro secreto", () => {
    const ev = signedEvent({ id: "t1", status: "APPROVED", amount_in_cents: 2000000, reference: "RF-x" });
    expect(verifyWompiEvent(ev, null, EVENTS).valid).toBe(true);
    expect(verifyWompiEvent(ev, sha("otra cosa"), EVENTS).valid).toBe(false);
    expect(verifyWompiEvent(signedEvent({ id: "t1", status: "APPROVED", amount_in_cents: 2000000, reference: "RF-x" }, "secreto_falso"), null, EVENTS).valid).toBe(false);
    const tampered = JSON.parse(JSON.stringify(ev)); tampered.data.transaction.status = "APPROVED"; tampered.data.transaction.amount_in_cents = 1;
    expect(verifyWompiEvent(tampered, null, EVENTS).valid).toBe(false);
    expect(verifyWompiEvent({ ...ev, timestamp: ev.timestamp + 1 }, null, EVENTS).valid).toBe(false);
    expect(verifyWompiEvent({ ...ev, event: "otro.evento" }, null, EVENTS).valid).toBe(false);
    expect(verifyWompiEvent(null, null, EVENTS).valid).toBe(false);
  });
  it("sin credenciales completas el proveedor queda desactivado (no se simulan pagos)", () => {
    expect(paymentConfigFromEnv({ DONATIONS_PROVIDER: "wompi", WOMPI_PUBLIC_KEY: "pub_test_x" }).provider).toBe("none");
    expect(paymentConfigFromEnv({}).provider).toBe("none");
    expect(paymentConfigFromEnv({ DONATIONS_PROVIDER: "manual" }).provider).toBe("manual");
    const ok = paymentConfigFromEnv({ DONATIONS_PROVIDER: "wompi", WOMPI_PUBLIC_KEY: "pub_test_x", WOMPI_INTEGRITY_SECRET: "a", WOMPI_EVENTS_SECRET: "b" });
    expect(ok.provider).toBe("wompi"); expect(ok.wompi!.apiUrl).toContain("sandbox");
  });
});

describe("iniciar una donación", () => {
  it("sin proveedor verificado no se puede donar en línea", async () => {
    const s = setup({ provider: "none" });
    await expect(s.svc.start("A", { amountCOP: 20_000 }, "https://x")).rejects.toThrow("todavía no están habilitados");
    const m = setup({ provider: "manual" });
    await expect(m.svc.start("A", { amountCOP: 20_000 }, "https://x")).rejects.toThrow("todavía no están habilitados");
  });
  it("valida monto, meta y límites; la donación nace pendiente (nunca confirmada)", async () => {
    const s = setup();
    await expect(s.svc.start("A", { amountCOP: 100 }, "https://x")).rejects.toThrow("mínimo");
    await expect(s.svc.start("A", { amountCOP: 99_999_999 }, "https://x")).rejects.toThrow("máximo");
    await expect(s.svc.start("A", { amountCOP: 10_000.5 }, "https://x")).rejects.toThrow();
    await expect(s.svc.start("A", { amountCOP: 10_000, goalId: "metaInexistente1" }, "https://x")).rejects.toThrow("meta");
    const d = await pendingDonation(s);
    expect((await s.svc.myDonations("A"))[0]!.status).toBe("pending");
    expect(d.checkoutUrl).toContain("checkout.wompi.co");
  });
  it("limita las donaciones iniciadas por hora", async () => {
    const s = setup();
    for (let i = 0; i < 8; i++) await s.svc.start("A", { amountCOP: 10_000 }, "https://x");
    await expect(s.svc.start("A", { amountCOP: 10_000 }, "https://x")).rejects.toThrow("Demasiadas");
  });
  it("el interruptor de donaciones la bloquea", async () => {
    const s = setup();
    await s.store.set("siteSettings/features/donations", false);
    await expect(s.svc.start("A", { amountCOP: 10_000 }, "https://x")).rejects.toThrow("desactivada");
  });
});

describe("confirmación segura", () => {
  it("un evento aprobado y verificado confirma, suma a la meta y publica el agradecimiento una sola vez", async () => {
    const remote: Record<string, { status: string; amount_in_cents: number; reference: string }> = {};
    const s = setup(wompiCfg, remote);
    await s.svc.createGoal("admin1", { title: "Micrófono nuevo", description: "Mejor audio", targetCOP: 100_000 });
    const goal = (await s.svc.listGoals())[0]!;
    const d = await pendingDonation(s, 40_000, goal.id);
    remote["tx1"] = { status: "APPROVED", amount_in_cents: 4_000_000, reference: d.reference };
    const ev = signedEvent({ id: "tx1", status: "APPROVED", amount_in_cents: 4_000_000, reference: d.reference });
    const v = verifyWompiEvent(ev, null, EVENTS); if (!v.valid) throw new Error("firma");
    const results = await Promise.all([s.svc.handleWompiEvent(v), s.svc.handleWompiEvent(v), s.svc.handleWompiEvent(v)]);
    expect(results.filter((r) => r.result === "confirmed")).toHaveLength(1);
    expect((await s.svc.listGoals())[0]!.raisedCOP).toBe(40_000);
    expect((await s.svc.publicInfo()).thanks.map((x) => x.name)).toEqual(["Ana"]);
    expect((await s.svc.myDonations("A"))[0]!.status).toBe("confirmed");
    expect((await s.community.listNotifications("A")).notifications.filter((n) => n.title === "¡Gracias por tu apoyo!")).toHaveLength(1);
    await s.svc.handleWompiEvent(v); // reintento tardío
    expect((await s.svc.listGoals())[0]!.raisedCOP).toBe(40_000);
  });
  it("no confirma si Wompi dice otra cosa (evento firmado pero con referencia o estado distintos)", async () => {
    const remote: Record<string, { status: string; amount_in_cents: number; reference: string }> = {};
    const s = setup(wompiCfg, remote);
    const d1 = await pendingDonation(s, 20_000), d2 = await pendingDonation(s, 20_000);
    // el atacante reutiliza un evento legítimo cambiando la referencia: la API dice que esa transacción es de d1
    remote["txReal"] = { status: "APPROVED", amount_in_cents: 2_000_000, reference: d1.reference };
    const ev = signedEvent({ id: "txReal", status: "APPROVED", amount_in_cents: 2_000_000, reference: d2.reference });
    const v = verifyWompiEvent(ev, null, EVENTS); if (!v.valid) throw new Error("firma");
    const r = await s.svc.handleWompiEvent(v);
    expect(r.donationId).toBe(d1.id);
    const list = await s.svc.myDonations("A");
    expect(list.find((x) => x.id === d2.id)!.status).toBe("pending");
    // la transacción no existe en Wompi → error reintentable, nada cambia
    const ev2 = signedEvent({ id: "txFalsa", status: "APPROVED", amount_in_cents: 2_000_000, reference: d2.reference });
    const v2 = verifyWompiEvent(ev2, null, EVENTS); if (!v2.valid) throw new Error("firma");
    await expect(s.svc.handleWompiEvent(v2)).rejects.toThrow("verificar");
    expect((await s.svc.myDonations("A")).find((x) => x.id === d2.id)!.status).toBe("pending");
  });
  it("monto o moneda distintos no confirman", async () => {
    const remote: Record<string, { status: string; amount_in_cents: number; reference: string }> = {};
    const s = setup(wompiCfg, remote);
    const d = await pendingDonation(s, 20_000);
    remote["txLow"] = { status: "APPROVED", amount_in_cents: 100_000, reference: d.reference };
    const ev = signedEvent({ id: "txLow", status: "APPROVED", amount_in_cents: 100_000, reference: d.reference });
    const v = verifyWompiEvent(ev, null, EVENTS); if (!v.valid) throw new Error("firma");
    expect((await s.svc.handleWompiEvent(v)).result).toBe("mismatch");
    expect((await s.svc.myDonations("A"))[0]!.status).toBe("pending");
  });
  it("un pago rechazado queda como fallido y no suma", async () => {
    const remote: Record<string, { status: string; amount_in_cents: number; reference: string }> = {};
    const s = setup(wompiCfg, remote);
    await s.svc.createGoal("admin1", { title: "Meta", targetCOP: 50_000 });
    const g = (await s.svc.listGoals())[0]!;
    const d = await pendingDonation(s, 20_000, g.id);
    remote["txNo"] = { status: "DECLINED", amount_in_cents: 2_000_000, reference: d.reference };
    const v = verifyWompiEvent(signedEvent({ id: "txNo", status: "DECLINED", amount_in_cents: 2_000_000, reference: d.reference }), null, EVENTS); if (!v.valid) throw new Error("firma");
    await s.svc.handleWompiEvent(v);
    expect((await s.svc.myDonations("A"))[0]!.status).toBe("failed");
    expect((await s.svc.listGoals())[0]!.raisedCOP).toBe(0);
    expect((await s.svc.publicInfo()).thanks).toHaveLength(0);
  });
  it("sin verificación por API exige que la referencia esté firmada", async () => {
    const cfg: PaymentConfig = { ...wompiCfg, wompi: { ...wompiCfg.wompi!, verifyWithApi: false } };
    const s = setup(cfg);
    const d = await pendingDonation(s, 20_000);
    const unsigned = verifyWompiEvent(signedEvent({ id: "t9", status: "APPROVED", amount_in_cents: 2_000_000, reference: d.reference }), null, EVENTS); if (!unsigned.valid) throw new Error("firma");
    await expect(s.svc.handleWompiEvent(unsigned)).rejects.toThrow("no está firmada");
    const get = (p: string) => ({ "transaction.reference": d.reference } as Record<string, string>)[p];
    void get;
    const withRef = signedEvent({ id: "t9", status: "APPROVED", amount_in_cents: 2_000_000, reference: d.reference }, EVENTS, 1_760_000_000, ["transaction.reference"]);
    const v = verifyWompiEvent(withRef, null, EVENTS); if (!v.valid) throw new Error("firma");
    expect((await s.svc.handleWompiEvent(v)).result).toBe("confirmed");
  });
  it("al volver del pago, solo el dueño puede consultar y la confirmación viene de Wompi, no del navegador", async () => {
    const remote: Record<string, { status: string; amount_in_cents: number; reference: string }> = {};
    const s = setup(wompiCfg, remote);
    const d = await pendingDonation(s, 20_000);
    expect((await s.svc.reconcile("A", d.id, "txNada")).status).toBe("pending"); // el navegador dice que pagó, Wompi no
    await expect(s.svc.reconcile("B", d.id)).rejects.toThrow("no encontrado");
    remote["txOk"] = { status: "APPROVED", amount_in_cents: 2_000_000, reference: d.reference };
    expect((await s.svc.reconcile("A", d.id, "txOk")).status).toBe("confirmed");
    remote["txOtra"] = { status: "APPROVED", amount_in_cents: 2_000_000, reference: "RF-otra" };
    const d2 = await pendingDonation(s, 20_000);
    expect((await s.svc.reconcile("A", d2.id, "txOtra")).status).toBe("pending"); // la transacción pertenece a otra referencia
  });
});

describe("las donaciones están separadas del juego", () => {
  it("confirmar una donación no cambia monedas, XP, insignias ni rankings", async () => {
    const remote: Record<string, { status: string; amount_in_cents: number; reference: string }> = {};
    const s = setup(wompiCfg, remote);
    const progress = createProgressService({ store: s.store, clock });
    const before = JSON.stringify([await s.store.get("wallets/A"), await s.store.get("profiles/A"), await s.store.get("userAchievements/A"), await s.store.get("leaderboards")]);
    const d = await pendingDonation(s, 1_000_000);
    remote["big"] = { status: "APPROVED", amount_in_cents: 100_000_000, reference: d.reference };
    expect((await s.svc.reconcile("A", d.id, "big")).status).toBe("confirmed");
    const after = JSON.stringify([await s.store.get("wallets/A"), await s.store.get("profiles/A"), await s.store.get("userAchievements/A"), await s.store.get("leaderboards")]);
    expect(after).toBe(before);
    expect((await progress.view("A")).xp).toBe(0);
    expect(await s.store.get("walletTransactions/A")).toBeNull();
  });
  it("el muro de agradecimientos no muestra montos ni ordena por dinero", async () => {
    const s = setup();
    await s.svc.recordManual("admin1", { amountCOP: 5_000, reference: "NEQUI-1", thanksName: "Pequeño" });
    t += 1000;
    await s.svc.recordManual("admin1", { amountCOP: 900_000, reference: "NEQUI-2", thanksName: "Grande" });
    const wall = (await s.svc.publicInfo()).thanks;
    expect(wall.map((x) => x.name)).toEqual(["Grande", "Pequeño"]); // por fecha, no por monto
    expect(JSON.stringify(wall)).not.toMatch(/5000|900000|amount/i);
  });
});

describe("administración de donaciones", () => {
  it("registro manual: audita, evita referencias repetidas y suma a la meta", async () => {
    const s = setup({ provider: "manual" });
    await s.svc.createGoal("admin1", { title: "Evento comunitario", targetCOP: 50_000 });
    const g = (await s.svc.listGoals())[0]!;
    await s.svc.recordManual("admin1", { username: "ana", amountCOP: 30_000, goalId: g.id, reference: "TRANSF-77", note: "Transferencia" });
    await expect(s.svc.recordManual("admin1", { amountCOP: 30_000, goalId: g.id, reference: "TRANSF-77" })).rejects.toThrow("misma referencia".replace("misma ", "esa "));
    expect((await s.svc.listGoals())[0]!.raisedCOP).toBe(30_000);
    expect((await s.svc.myDonations("A"))[0]!.status).toBe("confirmed");
    const logs = await s.store.get<Record<string, { action: string }>>("adminAuditLogs/admin1");
    expect(Object.values(logs!).map((l) => l.action)).toContain("donation_recorded_manually");
    await s.svc.recordManual("admin1", { amountCOP: 25_000, goalId: g.id, reference: "TRANSF-78" });
    expect((await s.svc.listGoals())[0]!.status).toBe("reached");
  });
  it("un reembolso resta de la meta y retira el agradecimiento, una sola vez", async () => {
    const s = setup({ provider: "manual" });
    await s.svc.createGoal("admin1", { title: "Meta", targetCOP: 50_000 });
    const g = (await s.svc.listGoals())[0]!;
    await s.svc.recordManual("admin1", { amountCOP: 20_000, goalId: g.id, reference: "R-1", thanksName: "Luz" });
    const id = (await s.svc.adminList()).donations[0]!.id;
    await expect(s.svc.refund("admin1", id, "x")).rejects.toThrow("motivo");
    await s.svc.refund("admin1", id, "Pago duplicado");
    await expect(s.svc.refund("admin1", id, "Pago duplicado")).rejects.toThrow("confirmados");
    expect((await s.svc.listGoals())[0]!.raisedCOP).toBe(0);
    expect((await s.svc.publicInfo()).thanks).toHaveLength(0);
  });
  it("metas cerradas no reciben aportes y la información pública respeta el modo", async () => {
    const s = setup({ provider: "manual" });
    await s.svc.createGoal("admin1", { title: "Meta", targetCOP: 50_000 });
    const g = (await s.svc.listGoals())[0]!;
    await s.svc.setGoalStatus("admin1", g.id, "closed");
    await expect(s.svc.recordManual("admin1", { amountCOP: 10_000, goalId: g.id, reference: "C-1" })).rejects.toThrow("meta");
    await s.svc.setInfo("admin1", { destination: "Equipo y micrófono", manualInstructions: "Nequi 300 000 0000" });
    const info = await s.svc.publicInfo();
    expect(info.mode).toBe("manual"); expect(info.manualInstructions).toContain("Nequi");
    const off = setup({ provider: "none" }); await off.svc.setInfo("a", { destination: "x", manualInstructions: "secreto" });
    expect((await off.svc.publicInfo()).manualInstructions).toBe("");
  });
});
