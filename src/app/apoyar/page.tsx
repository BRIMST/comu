"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { MAX_DONATION_COP, MIN_DONATION_COP, formatCOP, type GoalView } from "@/lib/domain/donations";

type Info = {
  mode: "none" | "manual" | "wompi"; destination: string; manualInstructions: string; goals: GoalView[];
  thanks: { id: string; name: string; message: string; createdAt: number }[];
};
type Mine = { id: string; amountCOP: number; status: string; createdAt: number; goal: string | null; publicThanks: boolean }[];
const PRESETS = [10_000, 20_000, 50_000, 100_000];
const STATUS: Record<string, string> = { pending: "Pendiente de confirmación", confirmed: "Confirmado", failed: "No completado", refunded: "Reembolsado" };

export default function Apoyar() {
  const [info, setInfo] = useState<Info | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [authed, setAuthed] = useState(true);
  const [amount, setAmount] = useState(20_000);
  const [goalId, setGoalId] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    api<Info>("/api/donations/public").then(setInfo).catch((e: Error) => setError(e.message));
    api<{ donations: Mine }>("/api/donations").then((d) => { setMine(d.donations); setAuthed(true); }).catch((e: { status?: number }) => { if (e.status === 401) setAuthed(false); });
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function pay(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const d = await api<{ checkoutUrl: string }>("/api/donations", "POST", { amountCOP: amount, ...(goalId ? { goalId } : {}), thanks: show ? { show: true, ...(name.trim() ? { name: name.trim() } : {}), message: message.trim() } : { show: false } });
      window.location.href = d.checkoutUrl;
    } catch (er) { setError((er as Error).message); setBusy(false); }
  }

  const open = info?.goals.filter((g) => g.status !== "closed") ?? [];
  return (
    <>
      <span className="eyebrow">APOYO VOLUNTARIO</span>
      <h1 className="title">Ayuda a crecer al Refugio</h1>
      <p className="sub">Tu aporte apoya la creación de contenido y las actividades de la comunidad. Donar es voluntario y <strong>no da monedas, XP, insignias ni ventajas</strong> en los juegos, los retos o el ranking.</p>
      {error && <div className="notice" role="alert" style={{ marginTop: 16 }}>{error}</div>}
      {!info && !error && <p className="muted" style={{ marginTop: 20 }}>Cargando…</p>}

      {info && <div className="grid grid-main" style={{ marginTop: 22, alignItems: "start" }}>
        <section>
          <div className="card">
            <div className="iconbox" aria-hidden>💜</div>
            <h2>¿A dónde va tu aporte?</h2>
            <p>{info.destination || "El equipo publicará aquí el destino de las aportaciones: equipo, contenido y actividades comunitarias."}</p>

            {info.mode === "none" && <div className="notice" style={{ marginTop: 14 }}>Los aportes en línea todavía no están habilitados: aún no hay un proveedor de pagos verificado. No se simula ninguna transacción.</div>}
            {info.mode === "manual" && <div className="notice" style={{ marginTop: 14 }}><strong>Cómo apoyar</strong><p style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{info.manualInstructions || "El equipo publicará las instrucciones pronto."}</p><small className="muted">Tu aporte aparece aquí solo cuando el equipo lo confirma.</small></div>}

            {info.mode === "wompi" && (!authed
              ? <div className="notice" style={{ marginTop: 14 }}>Para apoyar con un pago en línea debes <a href="/login?next=/apoyar" style={{ textDecoration: "underline" }}>iniciar sesión</a>.</div>
              : <form onSubmit={pay} style={{ marginTop: 14 }}>
                <fieldset style={{ border: 0, padding: 0 }}><legend className="muted" style={{ fontSize: 13 }}>Monto (COP)</legend>
                  <div className="row" style={{ flexWrap: "wrap", marginTop: 6 }}>{PRESETS.map((p) => <button type="button" key={p} aria-pressed={amount === p} className={amount === p ? "button primary" : "button"} onClick={() => setAmount(p)}>{formatCOP(p)}</button>)}</div>
                </fieldset>
                <div className="field"><label htmlFor="amt">Otro monto ({formatCOP(MIN_DONATION_COP)} a {formatCOP(MAX_DONATION_COP)})</label>
                  <input id="amt" type="number" inputMode="numeric" min={MIN_DONATION_COP} max={MAX_DONATION_COP} step={1000} value={amount} onChange={(e) => setAmount(Math.floor(Number(e.target.value)))} required /></div>
                {open.length > 0 && <div className="field"><label htmlFor="goal">Destinar a una meta (opcional)</label>
                  <select id="goal" value={goalId} onChange={(e) => setGoalId(e.target.value)}><option value="">Apoyo general</option>{open.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></div>}
                <label className="row" style={{ cursor: "pointer", margin: "12px 0" }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /><span>Quiero aparecer en el muro de agradecimientos (sin mostrar el monto)</span></label>
                {show && <>
                  <div className="field"><label htmlFor="tn">Nombre a mostrar</label><input id="tn" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Tu nombre de usuario o un apodo" /></div>
                  <div className="field"><label htmlFor="tm">Mensaje (opcional)</label><input id="tm" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={140} /></div></>}
                <p className="muted" style={{ fontSize: 12 }}>El pago se procesa en la página segura del proveedor (Wompi). Esta web nunca ve los datos de tu tarjeta o cuenta. Verás el aporte como «confirmado» solo cuando el proveedor lo confirme al servidor.</p>
                <button className="button primary" style={{ marginTop: 10 }} disabled={busy || amount < MIN_DONATION_COP || amount > MAX_DONATION_COP}>{busy ? "Redirigiendo…" : `Apoyar con ${formatCOP(amount || 0)} →`}</button>
              </form>)}
          </div>

          <div className="section-head" style={{ marginTop: 26 }}><h2>Muro de agradecimientos</h2><span className="tag">GRACIAS 💜</span></div>
          {info.thanks.length === 0 ? <div className="empty">Aquí aparecerán quienes decidan que se les agradezca públicamente.</div>
            : <div className="card"><div className="list">{info.thanks.map((t) => <div className="listitem" key={t.id}><div className="avatar" aria-hidden>💜</div><div className="grow"><strong>{t.name}</strong>{t.message && <small>{t.message}</small>}<small>{new Date(t.createdAt).toLocaleDateString("es-CO", { dateStyle: "medium" })}</small></div></div>)}</div></div>}
        </section>

        <aside>
          <div className="card">
            <h2>Metas de la comunidad</h2>
            {info.goals.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>Aún no hay metas publicadas.</div> :
              <div className="list" style={{ marginTop: 10 }}>{info.goals.map((g) => (
                <div key={g.id} style={{ opacity: g.status === "closed" ? 0.6 : 1 }}>
                  <div className="between"><strong>{g.title}</strong><span className="tag">{g.status === "reached" ? "¡LOGRADA!" : g.status === "closed" ? "CERRADA" : "ABIERTA"}</span></div>
                  {g.description && <p style={{ fontSize: 13 }}>{g.description}</p>}
                  <div className="progress" role="progressbar" aria-valuenow={g.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${g.title}`}><span style={{ width: `${g.percent}%` }} /></div>
                  <small className="muted">{formatCOP(g.raisedCOP)} de {formatCOP(g.targetCOP)} · {g.percent}%</small>
                </div>))}</div>}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 18 }}>Mis aportes</h2>
            <p className="muted" style={{ fontSize: 12 }}>Este historial es privado: solo lo ves tú.</p>
            {!authed ? <div className="empty" style={{ marginTop: 10 }}>Inicia sesión para ver tu historial.</div>
              : mine === null ? <p className="muted">Cargando…</p>
              : mine.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>Todavía no tienes aportes.</div>
              : <div className="list" style={{ marginTop: 10 }}>{mine.map((d) => <div className="listitem" key={d.id}><div className="grow"><strong>{formatCOP(d.amountCOP)}</strong><small>{STATUS[d.status] ?? d.status}{d.goal ? ` · ${d.goal}` : ""}</small><small>{new Date(d.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</small></div></div>)}</div>}
          </div>
        </aside>
      </div>}
    </>
  );
}
