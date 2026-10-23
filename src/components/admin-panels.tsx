"use client";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/client-api";
import { FEATURES, FEATURE_LABEL, type Feature } from "@/lib/domain/features";
import { GAME_IDS, GAME_LIMITS, type GameConfig, type GameId } from "@/lib/domain/game-config";
import { GAME_INFO } from "@/lib/domain/games";
import { REPORT_LABEL } from "@/lib/domain/admin";
import { formatCOP } from "@/lib/domain/donations";

const post = (body: unknown) => api("/api/admin/manage", "POST", body);
const get = <T,>(qs: string) => api<T>(`/api/admin/manage?${qs}`);
const when = (ms: number) => new Date(ms).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

/** Ejecuta una acción de administración mostrando el resultado. */
function useAction(reload: () => void) {
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(false); const [busy, setBusy] = useState(false);
  const run = async (body: unknown, ok: string, after?: () => void) => {
    setBusy(true); setMsg("");
    try { await post(body); setErr(false); setMsg(ok); after?.(); } catch (e) { setErr(true); setMsg((e as Error).message); } finally { setBusy(false); reload(); }
  };
  const Notice = () => <div aria-live="polite">{msg && <div className="notice" role={err ? "alert" : "status"} style={{ margin: "10px 0" }}>{msg}</div>}</div>;
  return { run, busy, Notice };
}
const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => <div className="field"><label htmlFor={id}>{label}</label>{children}</div>;
const Section = ({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) => <section className="card" style={wide ? { gridColumn: "1 / -1" } : undefined}><h3 style={{ marginTop: 0 }}>{title}</h3>{children}</section>;

// ---------------- Resumen ----------------
type Overview = {
  metrics: { totals: Record<string, number>; days: ({ day: string } & Record<string, number>)[] };
  features: Record<Feature, boolean>; games: Record<GameId, GameConfig>; openReports: number;
};
const METRIC_LABEL: Record<string, string> = {
  registrations: "Registros", active_users: "Usuarios activos", games_played: "Partidas", games_valid: "Partidas válidas", challenges_created: "Retos creados",
  challenges_completed: "Retos terminados", votes: "Votos", purchases: "Compras en colección", reports: "Reportes", donations_confirmed: "Aportes confirmados", donations_amount_cop: "Total aportado (COP)",
};
export function OverviewTab() {
  const [d, setD] = useState<Overview | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const load = useCallback(() => { get<Overview>("section=overview").then(setD).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const { run, busy, Notice } = useAction(load);
  if (!d) return <p className="muted">Cargando métricas…</p>;
  const maxPlayed = Math.max(1, ...d.metrics.days.map((x) => x.games_played ?? 0));
  return (
    <div className="grid grid-3" style={{ alignItems: "start" }}>
      <Section title="Métricas agregadas" wide>
        <p className="muted" style={{ fontSize: 12 }}>Solo contadores: no incluyen datos personales. Reportes abiertos: <strong>{d.openReports}</strong>.</p>
        <div className="grid grid-4" style={{ marginTop: 8 }}>{Object.entries(d.metrics.totals).map(([k, v]) => <div className="stat" key={k}><small>{METRIC_LABEL[k] ?? k}</small><strong>{v.toLocaleString("es-CO")}</strong></div>)}</div>
        <h4 style={{ margin: "16px 0 6px" }}>Partidas por día (últimos 14 días)</h4>
        <div role="img" aria-label="Gráfico de partidas por día" style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
          {d.metrics.days.map((x) => <div key={x.day} title={`${x.day}: ${x.games_played} partidas`} style={{ flex: 1, height: `${Math.max(3, ((x.games_played ?? 0) / maxPlayed) * 100)}%`, background: "linear-gradient(#8ea8ff,#7a5cff)", borderRadius: 4 }} />)}
        </div>
      </Section>

      <Section title="Interruptores de emergencia" wide>
        <p className="muted" style={{ fontSize: 12 }}>Apaga una función si detectas fraude o riesgos de cumplimiento. Se registra el motivo en la auditoría.</p>
        <Notice />
        <div className="list">{FEATURES.map((f) => (
          <form key={f} className="listitem" onSubmit={(e: FormEvent) => { e.preventDefault(); void run({ action: "setFeature", feature: f, enabled: !d.features[f], reason: reasons[f] ?? "" }, `${FEATURE_LABEL[f]}: ${d.features[f] ? "desactivada" : "activada"}.`, () => setReasons((r) => ({ ...r, [f]: "" }))); }}>
            <div className="grow"><strong>{FEATURE_LABEL[f]}</strong><small>{d.features[f] ? "🟢 Activa" : "🔴 Desactivada"}</small></div>
            <input aria-label={`Motivo para ${FEATURE_LABEL[f]}`} placeholder="Motivo (mín. 5 caracteres)" value={reasons[f] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [f]: e.target.value }))} minLength={5} maxLength={200} required style={{ maxWidth: 260 }} />
            <button className="button" disabled={busy}>{d.features[f] ? "Desactivar" : "Activar"}</button>
          </form>))}</div>
      </Section>

      <Section title="Minijuegos y recompensas" wide>
        <p className="muted" style={{ fontSize: 12 }}>Recompensa por partida válida (máx. {GAME_LIMITS.xpMax} XP y {GAME_LIMITS.coinsMax} monedas). El tope diario por jugador se mantiene aparte.</p>
        <div className="list">{GAME_IDS.map((g) => <GameRow key={g} id={g} cfg={d.games[g]} busy={busy} run={run} />)}</div>
      </Section>
    </div>
  );
}
function GameRow({ id, cfg, busy, run }: { id: GameId; cfg: GameConfig; busy: boolean; run: (b: unknown, ok: string) => void }) {
  const [c, setC] = useState(cfg);
  useEffect(() => setC(cfg), [cfg]);
  return (
    <form className="listitem" onSubmit={(e) => { e.preventDefault(); run({ action: "setGame", data: { game: id, ...c } }, `${GAME_INFO[id].name} actualizado.`); }}>
      <div className="grow"><strong>{GAME_INFO[id].icon} {GAME_INFO[id].name}</strong></div>
      <label className="row"><input type="checkbox" checked={c.enabled} onChange={(e) => setC({ ...c, enabled: e.target.checked })} /> Activo</label>
      <label>XP <input type="number" min={0} max={GAME_LIMITS.xpMax} value={c.xp} onChange={(e) => setC({ ...c, xp: Math.floor(Number(e.target.value)) })} style={{ width: 70 }} /></label>
      <label>🪙 <input type="number" min={0} max={GAME_LIMITS.coinsMax} value={c.coins} onChange={(e) => setC({ ...c, coins: Math.floor(Number(e.target.value)) })} style={{ width: 70 }} /></label>
      <button className="button" disabled={busy}>Guardar</button>
    </form>
  );
}

// ---------------- Usuarios ----------------
type UserRow = { username: string; avatar: string; level: number; role: string; suspended: boolean };
type UserDetail = {
  username: string; email: string | null; role: string; createdAt: number | null; suspended: boolean; suspension: { reason: string; at: number } | null;
  profile: { displayName: string; bio: string; avatar: string; xp: number; level: number }; balance: number;
  ledger: { id: string; amount: number; type: string; description: string; createdAt: number }[];
  stats: { gamesPlayed: number; challengesWon: number; challengesLost: number; activeDays: number }; challengesCount: number; reportsAgainst: number;
};
export function UsersTab() {
  const [q, setQ] = useState(""); const [rows, setRows] = useState<UserRow[]>([]); const [sel, setSel] = useState<string | null>(null);
  const search = (e?: FormEvent) => { e?.preventDefault(); get<{ users: UserRow[] }>(`section=users&q=${encodeURIComponent(q)}`).then((d) => setRows(d.users)).catch(() => setRows([])); };
  return (
    <div className="grid grid-main" style={{ alignItems: "start" }}>
      <Section title="Buscar usuarios">
        <form onSubmit={search} className="row"><input aria-label="Nombre de usuario (prefijo)" placeholder="Prefijo del usuario…" value={q} onChange={(e) => setQ(e.target.value.toLowerCase())} minLength={2} required /><button className="button primary">Buscar</button></form>
        <div className="list" style={{ marginTop: 10 }}>{rows.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Escribe al menos 2 letras del nombre.</p>}
          {rows.map((u) => <button key={u.username} className="listitem" onClick={() => setSel(u.username)} style={{ textAlign: "left", background: "transparent", border: 0, color: "inherit", cursor: "pointer", outline: sel === u.username ? "1px solid #718cff" : undefined }}>
            <span className="avatar" aria-hidden>{u.avatar}</span><div className="grow"><strong>@{u.username}</strong><small>Nivel {u.level} · {u.role}{u.suspended ? " · 🚫 suspendida" : ""}</small></div></button>)}</div>
      </Section>
      {sel ? <UserPanel key={sel} username={sel} onChange={search} /> : <Section title="Detalle"><p className="muted" style={{ fontSize: 13 }}>Selecciona un usuario para ver su ficha y gestionarlo.</p></Section>}
    </div>
  );
}
function UserPanel({ username, onChange }: { username: string; onChange: () => void }) {
  const [d, setD] = useState<UserDetail | null>(null); const [err, setErr] = useState("");
  const load = useCallback(() => { get<UserDetail>(`section=user&username=${username}`).then(setD).catch((e: Error) => setErr(e.message)); onChange(); }, [username, onChange]);
  useEffect(() => { get<UserDetail>(`section=user&username=${username}`).then(setD).catch((e: Error) => setErr(e.message)); }, [username]);
  const { run, busy, Notice } = useAction(load);
  const [reason, setReason] = useState(""); const [bonus, setBonus] = useState({ amount: 10, reason: "" }); const [mod, setMod] = useState({ clearBio: false, resetName: false, resetAvatar: false, reason: "" });
  if (err) return <Section title="Detalle"><div className="notice" role="alert">{err}</div></Section>;
  if (!d) return <Section title="Detalle"><p className="muted">Cargando…</p></Section>;
  return (
    <Section title={`@${d.username} ${d.suspended ? "· 🚫 SUSPENDIDA" : ""}`}>
      <Notice />
      <div className="list" style={{ fontSize: 13 }}>
        <div className="between"><span>Correo</span><strong>{d.email ?? "—"}</strong></div>
        <div className="between"><span>Rol</span><strong>{d.role}</strong></div>
        <div className="between"><span>Nivel / XP</span><strong>{d.profile.level} / {d.profile.xp}</strong></div>
        <div className="between"><span>Saldo</span><strong>🪙 {d.balance}</strong></div>
        <div className="between"><span>Partidas · activos</span><strong>{d.stats.gamesPlayed} · {d.stats.activeDays} días</strong></div>
        <div className="between"><span>Retos (G/P) · total</span><strong>{d.stats.challengesWon}/{d.stats.challengesLost} · {d.challengesCount}</strong></div>
        <div className="between"><span>Reportes recibidos</span><strong>{d.reportsAgainst}</strong></div>
        <div><span>Biografía</span><p style={{ margin: "2px 0", whiteSpace: "pre-wrap" }}>{d.profile.bio || "—"}</p></div>
        {d.suspension && <div className="notice">Suspendida: {d.suspension.reason} ({when(d.suspension.at)})</div>}
      </div>

      <h4 style={{ margin: "14px 0 6px" }}>Últimos movimientos</h4>
      <div className="list" style={{ fontSize: 12 }}>{d.ledger.length === 0 ? <span className="muted">Sin movimientos.</span> : d.ledger.map((l) => <div key={l.id} className="between"><span>{l.description} <small className="muted">({l.type})</small></span><strong>{l.amount > 0 ? "+" : ""}{l.amount}</strong></div>)}</div>

      {d.role !== "admin" && <>
        <form onSubmit={(e) => { e.preventDefault(); void run(d.suspended ? { action: "unsuspend", username: d.username } : { action: "suspend", username: d.username, reason }, d.suspended ? "Cuenta reactivada." : "Cuenta suspendida.", () => setReason("")); }} style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px" }}>{d.suspended ? "Reactivar cuenta" : "Suspender cuenta"}</h4>
          {!d.suspended && <Field id="sr" label="Motivo (queda registrado)"><input id="sr" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required /></Field>}
          <button className="button" style={d.suspended ? undefined : { borderColor: "#ff7a7a", color: "#ffb4b4" }} disabled={busy}>{d.suspended ? "Reactivar" : "Suspender"}</button>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); void run({ action: "bonus", username: d.username, data: bonus }, "Bonificación aplicada.", () => setBonus({ amount: 10, reason: "" })); }} style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px" }}>Bonificación por actividad comunitaria</h4>
          <div className="row" style={{ flexWrap: "wrap" }}><input aria-label="Monedas" type="number" min={1} max={200} value={bonus.amount} onChange={(e) => setBonus({ ...bonus, amount: Math.floor(Number(e.target.value)) })} style={{ width: 90 }} /><input aria-label="Motivo de la bonificación" placeholder="Motivo (p. ej. participó en el live)" value={bonus.reason} onChange={(e) => setBonus({ ...bonus, reason: e.target.value })} minLength={5} maxLength={200} required style={{ flex: 1, minWidth: 180 }} /><button className="button" disabled={busy}>Dar monedas</button></div>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); void run({ action: "moderate", username: d.username, data: mod }, "Perfil moderado.", () => setMod({ clearBio: false, resetName: false, resetAvatar: false, reason: "" })); }} style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px" }}>Moderar contenido del perfil</h4>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {([["clearBio", "Borrar biografía"], ["resetName", "Restablecer nombre"], ["resetAvatar", "Restablecer avatar"]] as const).map(([k, l]) => <label key={k} className="row"><input type="checkbox" checked={mod[k]} onChange={(e) => setMod({ ...mod, [k]: e.target.checked })} /> {l}</label>)}
          </div>
          <div className="row" style={{ marginTop: 8 }}><input aria-label="Motivo de la moderación" placeholder="Motivo" value={mod.reason} onChange={(e) => setMod({ ...mod, reason: e.target.value })} minLength={5} maxLength={200} required style={{ flex: 1 }} /><button className="button" disabled={busy || !(mod.clearBio || mod.resetName || mod.resetAvatar)}>Aplicar</button></div>
        </form>
      </>}
    </Section>
  );
}

// ---------------- Reportes ----------------
type Report = { id: string; target: string; reporter: string; reason: keyof typeof REPORT_LABEL; detail: string; status: string; createdAt: number; note: string };
export function ReportsTab() {
  const [all, setAll] = useState(false); const [rows, setRows] = useState<Report[] | null>(null); const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(() => { get<{ reports: Report[] }>(`section=reports&status=${all ? "all" : "open"}`).then((d) => setRows(d.reports)).catch(() => setRows([])); }, [all]);
  useEffect(() => { load(); }, [load]);
  const { run, busy, Notice } = useAction(load);
  return (
    <Section title="Reportes de la comunidad" wide>
      <label className="row"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Incluir resueltos</label>
      <Notice />
      {rows === null ? <p className="muted">Cargando…</p> : rows.length === 0 ? <div className="empty">No hay reportes {all ? "" : "abiertos"}. 🎉</div> :
        <div className="list" style={{ marginTop: 10 }}>{rows.map((r) => (
          <div className="listitem" key={r.id} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="grow"><strong>@{r.target}</strong> <span className="tag">{REPORT_LABEL[r.reason]}</span> {r.status !== "open" && <span className="tag">{r.status === "actioned" ? "ATENDIDO" : "DESCARTADO"}</span>}
              <small>Reportado por @{r.reporter || "—"} · {when(r.createdAt)}</small>{r.detail && <small>“{r.detail}”</small>}{r.note && <small>Nota: {r.note}</small>}</div>
            {r.status === "open" && <form className="row" style={{ flexWrap: "wrap" }} onSubmit={(e) => e.preventDefault()}>
              <input aria-label={`Nota para el reporte sobre ${r.target}`} placeholder="Nota (mín. 5 caracteres)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} minLength={5} style={{ minWidth: 200 }} />
              <button className="button" disabled={busy || (notes[r.id] ?? "").trim().length < 5} onClick={() => run({ action: "resolveReport", id: r.id, resolution: "actioned", note: notes[r.id] ?? "" }, "Reporte atendido.")}>Atendido</button>
              <button className="button" disabled={busy || (notes[r.id] ?? "").trim().length < 5} onClick={() => run({ action: "resolveReport", id: r.id, resolution: "dismissed", note: notes[r.id] ?? "" }, "Reporte descartado.")}>Descartar</button>
            </form>}
          </div>))}</div>}
    </Section>
  );
}

// ---------------- Insignias ----------------
type Badges = { custom: { id: string; name: string; emoji: string; desc: string }[]; builtin: { id: string; name: string; emoji: string; desc: string }[] };
export function BadgesTab() {
  const [d, setD] = useState<Badges | null>(null); const [user, setUser] = useState(""); const [badge, setBadge] = useState("");
  const load = useCallback(() => { get<Badges>("section=badges").then(setD).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const { run, busy, Notice } = useAction(load);
  return (
    <div className="grid grid-3" style={{ alignItems: "start" }}>
      <Section title="Crear insignia del equipo">
        <p className="muted" style={{ fontSize: 12 }}>Para logros que el sistema no puede comprobar solo (p. ej. «estuvo en el live»). Se otorgan a mano.</p>
        <form onSubmit={(e) => { const f = new FormData(e.currentTarget); e.preventDefault(); const form = e.currentTarget; void run({ action: "createBadge", data: { name: f.get("name"), emoji: f.get("emoji"), desc: f.get("desc") } }, "Insignia creada.", () => form.reset()); }}>
          <Field id="b-n" label="Nombre"><input id="b-n" name="name" minLength={3} maxLength={40} required /></Field>
          <Field id="b-e" label="Emoji"><input id="b-e" name="emoji" maxLength={8} required /></Field>
          <Field id="b-d" label="Descripción"><input id="b-d" name="desc" minLength={3} maxLength={120} required /></Field>
          <button className="button primary" disabled={busy}>Crear</button>
        </form>
        <Notice />
      </Section>
      <Section title="Otorgar o retirar">
        <form onSubmit={(e) => e.preventDefault()}>
          <Field id="g-u" label="Usuario"><input id="g-u" value={user} onChange={(e) => setUser(e.target.value.toLowerCase())} placeholder="nombre_de_usuario" /></Field>
          <Field id="g-b" label="Insignia"><select id="g-b" value={badge} onChange={(e) => setBadge(e.target.value)}><option value="">Elige…</option>
            {d?.custom.length ? <optgroup label="Del equipo">{d.custom.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}</optgroup> : null}
            <optgroup label="Del sistema">{d?.builtin.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}</optgroup></select></Field>
          <div className="row"><button className="button primary" disabled={busy || !user || !badge} onClick={() => run({ action: "grantBadge", username: user, badgeId: badge }, "Insignia otorgada.")}>Otorgar</button>
            <button className="button" disabled={busy || !user || !badge} onClick={() => run({ action: "revokeBadge", username: user, badgeId: badge }, "Insignia retirada.")}>Retirar</button></div>
        </form>
      </Section>
      <Section title="Insignias del equipo">
        {!d || d.custom.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>Aún no hay insignias del equipo.</p> :
          <div className="list">{d.custom.map((b) => <div className="listitem" key={b.id}><span className="badge-icon" aria-hidden>{b.emoji}</span><div className="grow"><strong>{b.name}</strong><small>{b.desc}</small></div><button className="button" disabled={busy} onClick={() => { if (confirm(`¿Eliminar «${b.name}»? Dejará de mostrarse a quienes la tengan.`)) void run({ action: "deleteBadge", badgeId: b.id }, "Insignia eliminada."); }}>Eliminar</button></div>)}</div>}
      </Section>
    </div>
  );
}

// ---------------- Donaciones ----------------
type DonAdmin = {
  provider: string; goals: { id: string; title: string; targetCOP: number; raisedCOP: number; status: string; percent: number }[];
  donations: { id: string; user: string; amountCOP: number; status: string; provider: string; reference: string; goal: string | null; createdAt: number; note: string }[];
};
export function DonationsTab() {
  const [d, setD] = useState<DonAdmin | null>(null);
  const load = useCallback(() => { get<DonAdmin>("section=donations").then(setD).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const { run, busy, Notice } = useAction(load);
  const confirmed = d?.donations.filter((x) => x.status === "confirmed").reduce((a, b) => a + b.amountCOP, 0) ?? 0;
  return (
    <div className="grid grid-3" style={{ alignItems: "start" }}>
      <Section title="Estado del proveedor" wide>
        <p>Modo actual: <strong>{d ? { none: "Sin proveedor (pagos desactivados)", manual: "Registro manual", wompi: "Wompi (pagos en línea)" }[d.provider] ?? d.provider : "…"}</strong>. El modo se define con variables de entorno en Vercel (ver docs/DESPLIEGUE.md). Aportes confirmados en esta lista: <strong>{formatCOP(confirmed)}</strong>.</p>
        <Notice />
      </Section>
      <Section title="Nueva meta">
        <form onSubmit={(e) => { const f = new FormData(e.currentTarget); e.preventDefault(); const form = e.currentTarget; void run({ action: "createGoal", data: { title: f.get("title"), description: f.get("description"), targetCOP: Number(f.get("target")) } }, "Meta creada.", () => form.reset()); }}>
          <Field id="m-t" label="Título"><input id="m-t" name="title" minLength={3} maxLength={80} required /></Field>
          <Field id="m-d" label="Descripción"><input id="m-d" name="description" maxLength={300} /></Field>
          <Field id="m-m" label="Meta (COP)"><input id="m-m" name="target" type="number" min={10000} step={1000} required /></Field>
          <button className="button primary" disabled={busy}>Crear meta</button>
        </form>
      </Section>
      <Section title="Destino y cómo apoyar">
        <form onSubmit={(e) => { const f = new FormData(e.currentTarget); e.preventDefault(); void run({ action: "donationInfo", data: { destination: f.get("destination"), manualInstructions: f.get("manual") } }, "Información actualizada."); }}>
          <Field id="i-d" label="¿A dónde va el aporte? (público)"><textarea id="i-d" name="destination" rows={3} maxLength={600} /></Field>
          <Field id="i-m" label="Instrucciones de apoyo manual (solo se muestran en modo manual)"><textarea id="i-m" name="manual" rows={3} maxLength={600} /></Field>
          <button className="button primary" disabled={busy}>Guardar</button>
        </form>
      </Section>
      <Section title="Registrar un aporte recibido">
        <p className="muted" style={{ fontSize: 12 }}>Solo para aportes que verificaste por un canal fiable (p. ej. transferencia). Queda auditado y marcado como «manual».</p>
        <form onSubmit={(e) => { const f = new FormData(e.currentTarget); e.preventDefault(); const form = e.currentTarget; const g = String(f.get("goal") ?? ""), u = String(f.get("user") ?? "").trim(), tn = String(f.get("thanks") ?? "").trim();
          void run({ action: "recordDonation", data: { amountCOP: Number(f.get("amount")), reference: f.get("reference"), note: f.get("note"), ...(g ? { goalId: g } : {}), ...(u ? { username: u } : {}), ...(tn ? { thanksName: tn } : {}) } }, "Aporte registrado.", () => form.reset()); }}>
          <Field id="r-a" label="Monto (COP)"><input id="r-a" name="amount" type="number" min={5000} step={1000} required /></Field>
          <Field id="r-r" label="Referencia del comprobante"><input id="r-r" name="reference" minLength={3} maxLength={60} required /></Field>
          <Field id="r-g" label="Meta"><select id="r-g" name="goal"><option value="">General</option>{d?.goals.filter((g) => g.status !== "closed").map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></Field>
          <Field id="r-u" label="Usuario (opcional, para su historial)"><input id="r-u" name="user" /></Field>
          <Field id="r-t" label="Nombre en el muro de agradecimientos (opcional)"><input id="r-t" name="thanks" maxLength={30} /></Field>
          <Field id="r-n" label="Nota interna"><input id="r-n" name="note" maxLength={200} /></Field>
          <button className="button primary" disabled={busy}>Registrar</button>
        </form>
      </Section>
      <Section title="Metas" wide>
        {!d || d.goals.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>Sin metas.</p> : <div className="list">{d.goals.map((g) => (
          <div className="listitem" key={g.id}><div className="grow"><strong>{g.title}</strong><small>{formatCOP(g.raisedCOP)} / {formatCOP(g.targetCOP)} ({g.percent}%) · {g.status}</small></div>
            <button className="button" disabled={busy} onClick={() => run({ action: "goalStatus", id: g.id, status: g.status === "closed" ? "open" : "closed" }, g.status === "closed" ? "Meta reabierta." : "Meta cerrada.")}>{g.status === "closed" ? "Reabrir" : "Cerrar"}</button></div>))}</div>}
      </Section>
      <Section title="Aportes recientes (privado)" wide>
        {!d || d.donations.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>Sin aportes.</p> : <div className="list">{d.donations.map((x) => (
          <div className="listitem" key={x.id} style={{ flexWrap: "wrap" }}><div className="grow"><strong>{formatCOP(x.amountCOP)}</strong> <span className="tag">{x.status}</span> <span className="tag">{x.provider}</span>
            <small>@{x.user} · {x.goal ?? "General"} · ref {x.reference} · {when(x.createdAt)}</small>{x.note && <small>{x.note}</small>}</div>
            {x.status === "confirmed" && <button className="button" disabled={busy} onClick={() => { const reason = prompt("Motivo del reembolso (mín. 5 caracteres):"); if (reason) void run({ action: "refundDonation", id: x.id, reason }, "Aporte marcado como reembolsado."); }}>Marcar reembolsado</button>}
            <button className="button" disabled={busy} onClick={() => run({ action: "hideThanks", id: x.id }, "Agradecimiento retirado del muro.")}>Ocultar del muro</button></div>))}</div>}
      </Section>
    </div>
  );
}

// ---------------- Auditoría ----------------
type Entry = { id: string; action: string; admin: string; createdAt: number } & Record<string, unknown>;
export function AuditTab() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  useEffect(() => { get<{ entries: Entry[] }>("section=audit").then((d) => setRows(d.entries)).catch(() => setRows([])); }, []);
  return (
    <Section title="Registro de auditoría" wide>
      <p className="muted" style={{ fontSize: 12 }}>Todas las acciones administrativas, de la más reciente a la más antigua. Nadie puede editarlas desde la plataforma.</p>
      {rows === null ? <p className="muted">Cargando…</p> : rows.length === 0 ? <div className="empty">Sin registros todavía.</div> :
        <div className="list">{rows.map((r) => { const { id, action, admin, createdAt, adminUid, ...rest } = r; void id; void adminUid; return (
          <div className="listitem" key={r.id} style={{ flexWrap: "wrap" }}><div className="grow"><strong>{action}</strong><small>@{admin} · {when(createdAt)}</small>
            {Object.keys(rest).length > 0 && <small style={{ wordBreak: "break-word" }}>{Object.entries(rest).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</small>}</div></div>); })}</div>}
    </Section>
  );
}
