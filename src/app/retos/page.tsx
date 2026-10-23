"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_STAKE, MEMORY_LENGTH, MEMORY_SYMBOLS } from "@/lib/domain/challenges";

type View = {
  id: string; game: "memoria" | "trivia"; stake: number; status: string; role: "challenger" | "opponent"; otherName: string;
  createdAt: number; expiresAt: number; deadline: number | null;
  myAttempt: { started: boolean; submitted: boolean };
  result: { kind: "win" | "draw"; reason: string; youWon: boolean | null; yourScore: number; theirScore: number } | null;
};
type Play =
  | { id: string; game: "memoria"; startedAt: number; sequence: string[] }
  | { id: string; game: "trivia"; startedAt: number; questions: { prompt: string; options: string[] }[] };

const GAME_NAME = { memoria: "Memoria visual", trivia: "Trivia comunitaria" } as const;
const STATUS_LABEL: Record<string, string> = {
  funding: "Preparando", pending: "Pendiente", accepting: "Aceptando", accepted: "En juego", settling: "Resolviendo", cancelling: "Cancelando",
  completed: "Finalizado", cancelled: "Cancelado", declined: "Rechazado", expired: "Caducado",
};
const REASON: Record<string, string> = { score: "por puntuación", forfeit: "porque el rival no jugó a tiempo", tie: "empate: se devolvieron las monedas", nobody_played: "nadie jugó: se devolvieron las monedas" };

async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error ?? "No se pudo completar la acción."), { status: r.status });
  return d;
}

export default function Retos() {
  const [items, setItems] = useState<View[] | null>(null);
  const [authed, setAuthed] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [opponent, setOpponent] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [game, setGame] = useState<"memoria" | "trivia">("memoria");
  const [stake, setStake] = useState(10);
  const [play, setPlay] = useState<Play | null>(null);
  const [hidden, setHidden] = useState(false);
  const [memAnswer, setMemAnswer] = useState<string[]>([]);
  const [triAnswer, setTriAnswer] = useState<number[]>([]);
  const playRef = useRef<Play | null>(null);
  playRef.current = play;

  const load = useCallback(async () => {
    try { setItems((await api("/api/challenges")).challenges); setAuthed(true); }
    catch (e) { if ((e as { status?: number }).status === 401) setAuthed(false); else setMessage((e as Error).message); setItems((x) => x ?? []); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible" && !playRef.current) void load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (opponent.length < 2) { setSuggest([]); return; }
    const t = setTimeout(() => { api(`/api/users/search?q=${encodeURIComponent(opponent.toLowerCase())}`).then((d) => setSuggest(d.users)).catch(() => setSuggest([])); }, 250);
    return () => clearTimeout(t);
  }, [opponent]);

  useEffect(() => {
    if (play?.game !== "memoria") return;
    setHidden(false);
    const t = setTimeout(() => setHidden(true), 4000);
    return () => clearTimeout(t);
  }, [play]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setMessage("");
    try { await fn(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(null); void load(); }
  }

  const create = (e: React.FormEvent) => { e.preventDefault(); void run("create", async () => {
    await api("/api/challenges", "POST", { opponent: opponent.trim().toLowerCase(), game, stake });
    setOpponent(""); setSuggest([]); setMessage("Reto enviado. Tus monedas quedan en juego hasta que se resuelva.");
  }); };
  const act = (id: string, action: "accept" | "decline" | "cancel") => run(id + action, async () => { await api(`/api/challenges/${id}`, "POST", { action }); });
  const startPlay = (c: View) => run(c.id + "start", async () => {
    const d = await api(`/api/challenges/${c.id}`, "POST", { action: "start" });
    setMemAnswer([]); setTriAnswer([]);
    setPlay(d.challenge.game === "memoria"
      ? { id: c.id, game: "memoria", startedAt: d.startedAt, sequence: d.challenge.sequence }
      : { id: c.id, game: "trivia", startedAt: d.startedAt, questions: d.challenge.questions });
  });
  const submit = () => { if (!play) return; void run(play.id + "submit", async () => {
    const answer = play.game === "memoria" ? memAnswer : triAnswer;
    const d = await api(`/api/challenges/${play.id}`, "POST", { action: "submit", answer });
    setPlay(null);
    setMessage(d.correct ? `¡Respuesta enviada! Puntuación: ${d.score}. Esperamos al rival si aún no juega.` : "Respuesta enviada. Esta vez no sumó puntos.");
  }); };

  const incoming = items?.filter((c) => c.status === "pending" && c.role === "opponent") ?? [];
  const outgoing = items?.filter((c) => ["pending", "funding", "accepting"].includes(c.status) && c.role === "challenger") ?? [];
  const active = items?.filter((c) => ["accepted", "settling"].includes(c.status)) ?? [];
  const history = items?.filter((c) => ["completed", "cancelled", "declined", "expired"].includes(c.status)) ?? [];
  const deadline = (c: View) => c.deadline ? new Date(c.deadline).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "";

  if (play) return (
    <>
      <span className="eyebrow">RETO EN CURSO</span>
      <h1 className="title">{GAME_NAME[play.game]}</h1>
      <section className="card" style={{ maxWidth: 760, marginTop: 22 }} aria-live="polite">
        {play.game === "memoria" ? (
          <>
            <p className="muted">Memoriza los {MEMORY_LENGTH} símbolos: se ocultarán en unos segundos. Tu tiempo ya está corriendo.</p>
            <div className="row" style={{ justifyContent: "center", flexWrap: "wrap", margin: "22px 0" }}>
              {hidden ? <span className="muted">Ahora repite la secuencia en orden.</span> : play.sequence.map((s, i) => <span key={i} className="badge-icon" style={{ fontSize: 30, width: 62, height: 62 }}>{s}</span>)}
            </div>
            {hidden && <>
              <div className="row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
                {memAnswer.map((s, i) => <button key={i} className="button" onClick={() => setMemAnswer((a) => a.filter((_, j) => j !== i))} aria-label={`Quitar ${s}`}>{s} ×</button>)}
                <span className="muted">{memAnswer.length}/{MEMORY_LENGTH}</span>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {MEMORY_SYMBOLS.map((s) => <button key={s} className="button" disabled={memAnswer.length >= MEMORY_LENGTH} onClick={() => setMemAnswer((a) => [...a, s])}>{s}</button>)}
              </div>
              <button className="button primary" style={{ marginTop: 18 }} disabled={memAnswer.length !== MEMORY_LENGTH || busy !== null} onClick={submit}>Enviar respuesta</button>
            </>}
          </>
        ) : (
          <>
            {play.questions.map((q, qi) => (
              <fieldset key={qi} style={{ border: 0, padding: 0, margin: "0 0 20px" }}>
                <legend><strong>{qi + 1}. {q.prompt}</strong></legend>
                <div className="list" style={{ marginTop: 10 }}>
                  {q.options.map((o, oi) => (
                    <button key={oi} className={triAnswer[qi] === oi ? "button primary" : "button"} aria-pressed={triAnswer[qi] === oi} style={{ justifyContent: "flex-start", textAlign: "left" }}
                      onClick={() => setTriAnswer((a) => { const n = [...a]; n[qi] = oi; return n; })}>{String.fromCharCode(65 + oi)}. {o}</button>
                  ))}
                </div>
              </fieldset>
            ))}
            <button className="button primary" disabled={play.questions.some((_, i) => triAnswer[i] === undefined) || busy !== null} onClick={submit}>Enviar respuestas</button>
          </>
        )}
        {message && <div className="notice" role="status" style={{ marginTop: 16 }}>{message}</div>}
      </section>
    </>
  );

  const Card = ({ c, children }: { c: View; children?: React.ReactNode }) => (
    <article className="card" key={c.id}>
      <div className="between"><strong>{GAME_NAME[c.game]}</strong><span className="tag">{STATUS_LABEL[c.status] ?? c.status}</span></div>
      <p style={{ fontSize: 13, margin: "8px 0" }}>{c.role === "challenger" ? "Retaste a" : "Te retó"} <strong>@{c.otherName}</strong> · {c.stake} 🪙 cada uno</p>
      {c.status === "accepted" && <p className="muted" style={{ fontSize: 12 }}>Plazo para jugar: {deadline(c)}</p>}
      {c.status === "completed" && c.result && (
        <p style={{ fontSize: 13 }}>{c.result.kind === "draw" ? "🤝 Empate" : c.result.youWon ? "🏆 Ganaste" : "😕 Perdiste"} ({c.result.yourScore} vs {c.result.theirScore}) — {REASON[c.result.reason]}</p>
      )}
      {children}
    </article>
  );

  return (
    <>
      <span className="eyebrow">JUEGA EN BUENA LID</span>
      <h1 className="title">Retos amistosos</h1>
      <p className="sub">Reta a otro miembro a un minijuego. Ambos ponen las mismas monedas virtuales; el resultado lo valida el servidor. Las monedas no tienen valor económico.</p>
      {!authed && <div className="notice" style={{ marginTop: 18 }}>Para retar y responder retos debes <a href="/login" style={{ textDecoration: "underline" }}>iniciar sesión</a>.</div>}
      {message && <div className="notice" role="status" style={{ marginTop: 18 }}>{message}</div>}

      <form className="card" style={{ marginTop: 22, maxWidth: 760 }} onSubmit={create}>
        <h2>Nuevo reto</h2>
        <div className="field"><label htmlFor="opp">Usuario a retar</label>
          <input id="opp" value={opponent} onChange={(e) => setOpponent(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="nombre_de_usuario" autoComplete="off" maxLength={20} required />
          {suggest.length > 0 && <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>{suggest.map((u) => <button type="button" key={u} className="button" onClick={() => { setOpponent(u); setSuggest([]); }}>@{u}</button>)}</div>}
        </div>
        <div className="field"><label htmlFor="game">Minijuego</label>
          <select id="game" value={game} onChange={(e) => setGame(e.target.value as "memoria" | "trivia")} style={{ width: "100%", padding: 12, borderRadius: 12 }}>
            <option value="memoria">Memoria visual</option><option value="trivia">Trivia comunitaria</option>
          </select>
        </div>
        <div className="field"><label htmlFor="stake">Monedas que arriesga cada uno (1–{MAX_STAKE})</label>
          <input id="stake" type="number" min={1} max={MAX_STAKE} step={1} value={stake} onChange={(e) => setStake(Math.floor(Number(e.target.value)))} required />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Si el rival no responde en 24 h o rechaza, recuperas tus monedas. Si ya aceptó, las monedas quedan en juego; abandonar cuenta como derrota. Empate = se devuelven.</p>
        <button className="button primary" style={{ marginTop: 12 }} disabled={!authed || busy !== null}>{busy === "create" ? "Enviando…" : "Enviar reto"}</button>
      </form>

      {items === null && <p className="muted" style={{ marginTop: 22 }}>Cargando retos…</p>}

      {incoming.length > 0 && <><h2 style={{ marginTop: 30 }}>Te retaron</h2><div className="grid grid-3" style={{ marginTop: 12 }}>{incoming.map((c) => <Card key={c.id} c={c}>
        <div className="row"><button className="button primary" disabled={busy !== null} onClick={() => act(c.id, "accept")}>Aceptar</button><button className="button" disabled={busy !== null} onClick={() => act(c.id, "decline")}>Rechazar</button></div></Card>)}</div></>}

      {active.length > 0 && <><h2 style={{ marginTop: 30 }}>En juego</h2><div className="grid grid-3" style={{ marginTop: 12 }}>{active.map((c) => <Card key={c.id} c={c}>
        {c.myAttempt.submitted ? <p className="muted" style={{ fontSize: 13 }}>Ya jugaste. Esperando al rival.</p>
          : <button className="button primary" disabled={busy !== null} onClick={() => startPlay(c)}>{c.myAttempt.started ? "Continuar" : "Jugar ahora →"}</button>}</Card>)}</div></>}

      {outgoing.length > 0 && <><h2 style={{ marginTop: 30 }}>Enviados</h2><div className="grid grid-3" style={{ marginTop: 12 }}>{outgoing.map((c) => <Card key={c.id} c={c}>
        {c.status === "pending" && <button className="button" disabled={busy !== null} onClick={() => act(c.id, "cancel")}>Cancelar y recuperar monedas</button>}</Card>)}</div></>}

      <h2 style={{ marginTop: 30 }}>Historial</h2>
      {items !== null && history.length === 0 && <div className="empty" style={{ marginTop: 12 }}>Todavía no hay retos finalizados. ¡Envía el primero!</div>}
      <div className="grid grid-3" style={{ marginTop: 12 }}>{history.map((c) => <Card key={c.id} c={c} />)}</div>
    </>
  );
}
