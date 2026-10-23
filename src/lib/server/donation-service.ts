import {
  donationInfoInput, donationInput, goalInput, manualDonationInput,
  type Donation, type GoalRecord, type GoalView,
} from "../domain/donations";
import type { Notifier } from "../domain/community";
import { writeAudit } from "./audit";
import { ApiError } from "./errors";
import { bump } from "./metrics";
import { buildWompiCheckoutUrl, fetchWompiTransaction, type PaymentConfig, type WompiTx } from "./payments";
import { rateLimit } from "./rate-limit";
import { assertFeature } from "./settings";
import type { Store } from "./store";

type Deps = { store: Store; config: PaymentConfig; clock?: () => number; notify?: Notifier; fetchImpl?: typeof fetch };
const bad = (e: { error: { issues: { message: string }[] } }) => new ApiError(e.error.issues[0]?.message ?? "Datos no válidos.");
const REF_PREFIX = "RF-";

/**
 * Donaciones voluntarias, completamente separadas del juego: nunca tocan monedas, XP, insignias ni rankings.
 * Una donación solo pasa a «confirmed» con una confirmación verificada del proveedor (o registro manual de un administrador).
 */
export function createDonationService({ store, config, clock = Date.now, notify, fetchImpl }: Deps) {
  const tell: Notifier = async (...a) => { try { await notify?.(...a); } catch { /* noop */ } };
  const audit = (adminUid: string, action: string, meta: Record<string, unknown> = {}) => writeAudit(store, clock(), adminUid, action, meta);
  const modeInfo = () => ({ mode: config.provider });

  // ---------- metas ----------
  async function raisedFor(goalId: string) {
    const rows = (await store.get<Record<string, number>>(`goalDonations/${goalId}`)) ?? {};
    return Object.values(rows).reduce((a, b) => a + (Number(b) || 0), 0);
  }
  async function goalView(g: GoalRecord): Promise<GoalView> {
    const raisedCOP = await raisedFor(g.id);
    const status = g.status === "closed" ? "closed" : raisedCOP >= g.targetCOP ? "reached" : "open";
    const { createdBy: _c, ...rest } = g; void _c;
    return { ...rest, status, raisedCOP, percent: Math.min(100, Math.floor((raisedCOP / g.targetCOP) * 100)) };
  }
  async function listGoals(): Promise<GoalView[]> {
    const goals = await store.list<GoalRecord>("donationGoals", { orderBy: "createdAt", limitLast: 12 });
    return (await Promise.all(goals.map(goalView))).sort((a, b) => b.createdAt - a.createdAt);
  }

  async function publicInfo() {
    const [info, goals, thanks] = await Promise.all([
      store.get<{ destination?: string; manualInstructions?: string }>("siteSettings/donationInfo"),
      listGoals(),
      store.list<{ name: string; message?: string; goalId?: string | null; createdAt: number }>("donationThanks", { orderBy: "createdAt", limitLast: 30 }),
    ]);
    return {
      ...modeInfo(),
      destination: info?.destination ?? "",
      manualInstructions: config.provider === "manual" ? info?.manualInstructions ?? "" : "",
      goals,
      // Muro de agradecimientos: por fecha, SIN montos (no se clasifica a nadie por dinero donado).
      thanks: thanks.sort((a, b) => b.createdAt - a.createdAt).map((t) => ({ id: t.id, name: t.name, message: t.message ?? "", goalId: t.goalId ?? null, createdAt: t.createdAt })),
    };
  }

  // ---------- iniciar una donación (solo con proveedor de pago verificado) ----------
  async function start(uid: string, input: unknown, siteUrl: string) {
    await assertFeature(store, "donations");
    if (config.provider !== "wompi" || !config.wompi) throw new ApiError("Los pagos en línea todavía no están habilitados.", 503);
    const p = donationInput.safeParse(input); if (!p.success) throw bad(p);
    await rateLimit(store, clock(), uid, "donation_start", 8, 60 * 60 * 1000);
    if (p.data.goalId) {
      const g = await store.get<GoalRecord>(`donationGoals/${p.data.goalId}`);
      if (!g || g.status === "closed") throw new ApiError("Esa meta no está disponible.", 400);
    }
    const profile = await store.get<{ username?: string }>(`publicProfiles/${uid}`);
    const thanks = p.data.thanks.show ? { show: true, name: p.data.thanks.name ?? profile?.username ?? "Anónimo", message: p.data.thanks.message ?? "" } : { show: false };
    const id = store.newKey("donations");
    const d: Donation = { id, uid, amountCOP: p.data.amountCOP, status: "pending", provider: "wompi", reference: `${REF_PREFIX}${id}`, goalId: p.data.goalId ?? null, thanks, createdAt: clock() };
    await store.update({ [`donations/${id}`]: JSON.parse(JSON.stringify(d)), [`userDonations/${uid}/${id}`]: true });
    return { id, checkoutUrl: buildWompiCheckoutUrl(config.wompi, d, `${siteUrl}/apoyar/gracias/${id}`) };
  }

  // ---------- confirmación ----------
  /** Efectos de una donación confirmada. Idempotente: todo son escrituras con valores fijos. */
  async function applyConfirmed(d: Donation) {
    const updates: Record<string, unknown> = { [`donations/${d.id}/applied`]: true };
    if (d.goalId) updates[`goalDonations/${d.goalId}/${d.id}`] = d.amountCOP;
    if (d.thanks?.show && d.thanks.name) updates[`donationThanks/${d.id}`] = { name: d.thanks.name, message: d.thanks.message ?? "", goalId: d.goalId ?? null, createdAt: d.confirmedAt ?? clock() };
    await store.update(updates);
  }

  /** Procesa el estado final de una transacción (ya autenticada y/o consultada al proveedor). */
  async function settle(tx: WompiTx): Promise<{ result: "confirmed" | "failed" | "ignored" | "duplicate" | "mismatch" | "unknown"; donationId?: string }> {
    if (!tx.reference.startsWith(REF_PREFIX)) return { result: "unknown" };
    const id = tx.reference.slice(REF_PREFIX.length);
    const d = await store.get<Donation>(`donations/${id}`);
    if (!d || d.provider !== "wompi" || d.reference !== tx.reference) return { result: "unknown" };
    if (tx.currency !== "COP" || tx.amountInCents !== d.amountCOP * 100) {
      await store.set(`donationEvents/wompi-${tx.id}-${tx.status}`, { at: clock(), result: "mismatch", donationId: id });
      return { result: "mismatch", donationId: id };
    }
    // idempotencia del evento (el proveedor reintenta)
    let first = false;
    await store.transaction(`donationEvents/wompi-${tx.id}-${tx.status}`, (cur) => { first = cur === null; return first ? { at: clock(), donationId: id } : undefined; });
    if (tx.status === "APPROVED") {
      let moved = false;
      const r = await store.transaction<Donation>(`donations/${id}`, (cur) => {
        if (cur === null) return null;
        if (cur.status !== "pending") { moved = false; return undefined; }
        moved = true;
        return { ...cur, status: "confirmed", confirmedAt: clock(), providerRef: tx.id };
      });
      const current = (r.value ?? d) as Donation;
      if (current.status === "confirmed" && !current.applied) await applyConfirmed(current); // también reanuda una confirmación interrumpida
      if (moved) {
        await bump(store, clock(), "donations_confirmed"); await bump(store, clock(), "donations_amount_cop", d.amountCOP);
        if (d.uid) await tell(d.uid, `don:${id}`, "admin", "¡Gracias por tu apoyo!", "Tu aporte fue confirmado. Gracias por ayudar a crecer al Refugio 💜", "/apoyar");
        return { result: "confirmed", donationId: id };
      }
      return { result: first ? "ignored" : "duplicate", donationId: id };
    }
    if (["DECLINED", "VOIDED", "ERROR"].includes(tx.status)) {
      await store.transaction<Donation>(`donations/${id}`, (cur) => (cur && cur.status === "pending" ? { ...cur, status: "failed", failReason: tx.status } : undefined));
      return { result: "failed", donationId: id };
    }
    return { result: "ignored", donationId: id }; // PENDING u otros estados no finales
  }

  /** Webhook del proveedor. `tx` viene de un evento con firma válida; se contrasta con la API de Wompi. */
  async function handleWompiEvent(ev: { tx: WompiTx; signedProps: string[] }) {
    if (config.provider !== "wompi" || !config.wompi) throw new ApiError("Proveedor no configurado.", 503);
    let tx = ev.tx;
    if (config.wompi.verifyWithApi) {
      const remote = await fetchWompiTransaction(config.wompi, ev.tx.id, fetchImpl);
      if (!remote) throw new ApiError("No se pudo verificar la transacción con el proveedor.", 502); // 5xx → el proveedor reintenta
      tx = remote;
    } else if (!ev.signedProps.includes("transaction.reference")) {
      throw new ApiError("La referencia no está firmada por el proveedor.", 400);
    }
    return settle(tx);
  }

  /** El donante vuelve del pago: consultamos la transacción al proveedor (nunca confiamos en el navegador). */
  async function reconcile(uid: string, donationId: string, txId?: string) {
    const d = await store.get<Donation>(`donations/${donationId}`);
    if (!d || d.uid !== uid) throw new ApiError("Aporte no encontrado.", 404);
    if (d.status === "pending" && txId && config.provider === "wompi" && config.wompi) {
      await rateLimit(store, clock(), uid, "donation_reconcile", 20, 60 * 60 * 1000);
      const remote = await fetchWompiTransaction(config.wompi, txId, fetchImpl);
      if (remote && remote.reference === d.reference) await settle(remote);
    }
    const fresh = (await store.get<Donation>(`donations/${donationId}`))!;
    return { id: fresh.id, status: fresh.status, amountCOP: fresh.amountCOP };
  }

  async function myDonations(uid: string) {
    const ids = Object.keys((await store.get<Record<string, true>>(`userDonations/${uid}`)) ?? {}).sort().slice(-50);
    const rows = (await Promise.all(ids.map((id) => store.get<Donation>(`donations/${id}`)))).filter((d): d is Donation => !!d);
    const goals = new Map((await listGoals()).map((g) => [g.id, g.title]));
    return rows.sort((a, b) => b.createdAt - a.createdAt).map((d) => ({
      id: d.id, amountCOP: d.amountCOP, status: d.status, createdAt: d.createdAt, confirmedAt: d.confirmedAt ?? null,
      goal: d.goalId ? goals.get(d.goalId) ?? null : null, publicThanks: d.thanks?.show === true,
    }));
  }

  // ---------- administración ----------
  async function createGoal(adminUid: string, input: unknown) {
    const p = goalInput.safeParse(input); if (!p.success) throw bad(p);
    const id = store.newKey("donationGoals");
    const g: GoalRecord = { id, ...p.data, status: "open", createdAt: clock(), createdBy: adminUid };
    await store.set(`donationGoals/${id}`, g);
    await audit(adminUid, "goal_created", { id, title: g.title, targetCOP: g.targetCOP });
  }
  async function setGoalStatus(adminUid: string, id: string, status: "open" | "closed") {
    const r = await store.transaction<GoalRecord>(`donationGoals/${id}`, (cur) => (cur === null ? null : { ...cur, status }));
    if (!r.value) throw new ApiError("Meta no encontrada.", 404);
    await audit(adminUid, status === "closed" ? "goal_closed" : "goal_reopened", { id });
  }
  async function setInfo(adminUid: string, input: unknown) {
    const p = donationInfoInput.safeParse(input); if (!p.success) throw bad(p);
    await store.set("siteSettings/donationInfo", p.data);
    await audit(adminUid, "donation_info_updated");
  }
  /** Aporte recibido por un canal verificado por el equipo (p. ej. transferencia). Queda marcado como registro manual. */
  async function recordManual(adminUid: string, input: unknown) {
    const p = manualDonationInput.safeParse(input); if (!p.success) throw bad(p);
    if (p.data.goalId) {
      const g = await store.get<GoalRecord>(`donationGoals/${p.data.goalId}`);
      if (!g || g.status === "closed") throw new ApiError("Esa meta no está disponible.", 400);
    }
    let uid: string | null = null;
    if (p.data.username) {
      const u = await store.get<{ uid: string }>(`usernames/${p.data.username}`);
      if (!u) throw new ApiError("No encontramos a ese usuario.", 404);
      uid = u.uid;
    }
    // la referencia externa evita registrar dos veces el mismo comprobante
    const refKey = p.data.reference.replace(/[.#$/[\]]/g, "_");
    let fresh = false;
    await store.transaction(`manualReferences/${refKey}`, (cur) => { fresh = cur === null; return fresh ? { at: clock() } : undefined; });
    if (!fresh) throw new ApiError("Ya registraste un aporte con esa referencia.", 409);
    const id = store.newKey("donations");
    const now = clock();
    const d: Donation = {
      id, uid, amountCOP: p.data.amountCOP, status: "confirmed", provider: "manual", reference: p.data.reference, goalId: p.data.goalId ?? null,
      thanks: p.data.thanksName ? { show: true, name: p.data.thanksName, message: "" } : { show: false },
      createdAt: now, confirmedAt: now, note: p.data.note, recordedBy: adminUid,
    };
    await store.update({ [`donations/${id}`]: JSON.parse(JSON.stringify(d)), ...(uid ? { [`userDonations/${uid}/${id}`]: true } : {}) });
    await applyConfirmed(d);
    await bump(store, now, "donations_confirmed"); await bump(store, now, "donations_amount_cop", d.amountCOP);
    if (uid) await tell(uid, `don:${id}`, "admin", "¡Gracias por tu apoyo!", "Registramos tu aporte. Gracias por ayudar a crecer al Refugio 💜", "/apoyar");
    await audit(adminUid, "donation_recorded_manually", { id, amountCOP: d.amountCOP, reference: d.reference });
  }
  async function refund(adminUid: string, id: string, reason: string) {
    if (reason.trim().length < 5) throw new ApiError("Indica el motivo (mínimo 5 caracteres).");
    let ok = false;
    const r = await store.transaction<Donation>(`donations/${id}`, (cur) => { if (cur === null) return null; ok = cur.status === "confirmed"; return ok ? { ...cur, status: "refunded", note: `${cur.note ?? ""} [reembolso: ${reason.trim().slice(0, 100)}]`.trim() } : undefined; });
    if (!r.value) throw new ApiError("Aporte no encontrado.", 404);
    if (!ok) throw new ApiError("Solo se pueden marcar como reembolsados los aportes confirmados.", 409);
    const d = r.value;
    await store.update({ ...(d.goalId ? { [`goalDonations/${d.goalId}/${id}`]: null } : {}), [`donationThanks/${id}`]: null });
    await audit(adminUid, "donation_refunded", { id, amountCOP: d.amountCOP, reason: reason.trim().slice(0, 100) });
  }
  async function hideThanks(adminUid: string, id: string) {
    await store.set(`donationThanks/${id}`, null);
    await audit(adminUid, "thanks_hidden", { id });
  }
  async function adminList() {
    const rows = await store.list<Donation>("donations", { orderBy: "createdAt", limitLast: 60 });
    const names = new Map<string, string>();
    for (const uid of new Set(rows.map((r) => r.uid).filter((u): u is string => !!u))) names.set(uid, (await store.get<{ username?: string }>(`publicProfiles/${uid}`))?.username ?? uid.slice(0, 8));
    const goals = await listGoals();
    return {
      goals,
      donations: rows.sort((a, b) => b.createdAt - a.createdAt).map((d) => ({
        id: d.id, user: d.uid ? names.get(d.uid) ?? "—" : "—", amountCOP: d.amountCOP, status: d.status, provider: d.provider, reference: d.reference,
        goal: d.goalId ? goals.find((g) => g.id === d.goalId)?.title ?? null : null, createdAt: d.createdAt, note: d.note ?? "",
      })),
    };
  }

  return { publicInfo, listGoals, start, handleWompiEvent, reconcile, myDonations, createGoal, setGoalStatus, setInfo, recordManual, refund, hideThanks, adminList, settle };
}
