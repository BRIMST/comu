"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";

type Ev = { id: string; title: string; description: string; kind: "live" | "evento"; startsAt: number; endsAt?: number; links: { label: string; url: string }[]; status: string };
type Poll = { id: string; question: string; kind: string; closesAt: number; open: boolean; myVote: string | null; totalVotes: number | null; options: { id: string; text: string; votes: number | null }[] };
type Mission = { id: string; title: string; description: string; target: number; progress: number; unit: string; status: string };
type Data = { upcoming: Ev[]; history: Ev[]; polls: Poll[]; missions: Mission[]; channels: { label: string; url: string }[] };

const fmt = (ms: number) => new Date(ms).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const KIND = { general: "VOTACIÓN", playlist: "PLAYLIST", juego: "PRÓXIMO JUEGO" } as Record<string, string>;

export default function Lives() {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState("");

  const load = useCallback(() => api<Data>("/api/community/lives").then(setData).catch((e: Error) => setMessage(e.message)), []);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000); return () => clearInterval(t); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMessage("");
    try { await fn(); setMessage(ok); } catch (e) { setMessage((e as { status?: number }).status === 401 ? "Inicia sesión para participar." : (e as Error).message); }
    finally { setBusy(false); void load(); }
  }

  return (
    <>
      <span className="eyebrow">PARTICIPA EN LOS LIVES</span>
      <h1 className="title">Centro de lives</h1>
      <p className="sub">Próximas transmisiones, votaciones de la comunidad y misiones compartidas. La participación en directos externos no se verifica automáticamente: lo registra el equipo.</p>
      <div aria-live="polite">{message && <div className="notice" role="status" style={{ marginTop: 18 }}>{message}</div>}</div>
      {data === null && !message && <p className="muted" style={{ marginTop: 22 }}>Cargando…</p>}

      {data && data.channels.length > 0 && (
        <div className="row" style={{ marginTop: 18, flexWrap: "wrap" }}>
          {data.channels.map((c) => <a key={c.url} className="button" href={c.url} target="_blank" rel="noopener noreferrer">{c.label} ↗</a>)}
        </div>
      )}

      {data && <>
        <div className="section-head" style={{ marginTop: 30 }}><h2>Calendario</h2><span className="tag">PRÓXIMOS</span></div>
        {data.upcoming.length === 0 ? <div className="empty">Todavía no hay eventos programados. ¡Vuelve pronto!</div> :
          <div className="grid grid-3">{data.upcoming.map((e) => (
            <article className="card" key={e.id}>
              <span className="tag">{e.kind === "live" ? "🔴 LIVE" : "EVENTO"}</span>
              <h3 style={{ marginTop: 10 }}>{e.title}</h3>
              <p style={{ fontSize: 13 }}><time dateTime={new Date(e.startsAt).toISOString()}>{fmt(e.startsAt)}</time></p>
              {e.description && <p style={{ fontSize: 13 }}>{e.description}</p>}
              <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>{e.links.map((l) => <a key={l.url} className="button" href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}</div>
            </article>))}</div>}

        <div className="section-head" style={{ marginTop: 30 }}><h2>Votaciones</h2><span className="tag">TU VOZ CUENTA</span></div>
        {data.polls.length === 0 ? <div className="empty">No hay votaciones abiertas por ahora.</div> :
          <div className="grid grid-3">{data.polls.map((p) => (
            <article className="card" key={p.id}>
              <div className="between"><span className="tag">{KIND[p.kind] ?? "VOTACIÓN"}</span><span className="muted" style={{ fontSize: 11 }}>{p.open ? `Cierra ${fmt(p.closesAt)}` : "Cerrada"}</span></div>
              <h3 style={{ margin: "10px 0" }}>{p.question}</h3>
              <div className="list">{p.options.map((o) => {
                const pct = p.totalVotes ? Math.round(((o.votes ?? 0) / p.totalVotes) * 100) : 0;
                const canVote = p.open && p.myVote === null;
                return canVote ? (
                  <button key={o.id} className="button" disabled={busy} style={{ justifyContent: "flex-start", textAlign: "left" }} onClick={() => run(() => api("/api/community/vote", "POST", { pollId: p.id, optionId: o.id }), "¡Voto registrado!")}>{o.text}</button>
                ) : (
                  <div key={o.id} style={{ fontSize: 13 }}>
                    <div className="between"><span>{o.text}{p.myVote === o.id ? " ✓" : ""}</span><span className="muted">{o.votes ?? 0} · {pct}%</span></div>
                    <div className="progress" aria-hidden><span style={{ width: `${pct}%` }} /></div>
                  </div>);
              })}</div>
              {p.totalVotes !== null && <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>{p.totalVotes} votos</p>}
            </article>))}</div>}

        <div className="section-head" style={{ marginTop: 30 }}><h2>Misiones comunitarias</h2><span className="tag">EN EQUIPO</span></div>
        {data.missions.length === 0 ? <div className="empty">No hay misiones activas.</div> :
          <div className="grid grid-3">{data.missions.map((m) => {
            const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
            return (
              <article className="card" key={m.id}>
                <div className="between"><h3>{m.title}</h3><span className="tag">{m.status === "completed" ? "¡COMPLETADA!" : m.status === "closed" ? "CERRADA" : "ACTIVA"}</span></div>
                {m.description && <p style={{ fontSize: 13 }}>{m.description}</p>}
                <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{m.progress.toLocaleString("es-CO")} / {m.target.toLocaleString("es-CO")} {m.unit}</p>
              </article>);
          })}</div>}

        <form className="card" style={{ marginTop: 30, maxWidth: 760 }} onSubmit={(e) => { e.preventDefault(); void run(async () => { await api("/api/community/proposals", "POST", { text: proposal }); setProposal(""); }, "¡Gracias! Tu propuesta llegó al equipo."); }}>
          <h2>Propón un reto para el creador</h2>
          <div className="field"><label htmlFor="prop">Tu idea (10–200 caracteres)</label>
            <textarea id="prop" value={proposal} onChange={(e) => setProposal(e.target.value)} maxLength={200} minLength={10} rows={3} required /></div>
          <p className="muted" style={{ fontSize: 12 }}>Máximo 3 propuestas al día. No garantiza que se realice.</p>
          <button className="button primary" style={{ marginTop: 10 }} disabled={busy || proposal.trim().length < 10}>Enviar propuesta</button>
        </form>

        <div className="section-head" style={{ marginTop: 30 }}><h2>Historial de eventos</h2></div>
        {data.history.length === 0 ? <div className="empty">Aún no hay eventos pasados.</div> :
          <div className="card"><div className="list">{data.history.map((e) => (
            <div className="listitem" key={e.id}><div className="grow"><strong>{e.title}</strong><small>{fmt(e.startsAt)}{e.status === "cancelled" ? " · Cancelado" : ""}</small></div><span className="tag">{e.kind === "live" ? "LIVE" : "EVENTO"}</span></div>))}</div></div>}
      </>}
    </>
  );
}
