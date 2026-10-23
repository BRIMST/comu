"use client";
import { use, useCallback, useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { api } from "@/lib/client-api";
import { ProfileAvatar, themeCss, titleOf } from "@/components/profile-avatar";

type P = {
  username: string; displayName: string; avatar: string; bio: string; level: number; xp: number; levelProgress: { current: number; needed: number; percent: number };
  joinedAt: number | null; equipped: { frame: string; theme: string; title: string }; isOwner: boolean;
  privacy?: { showInRanking: boolean; showActivity: boolean; showStats: boolean; showBadges: boolean };
  badges: { id: string; name: string; emoji: string; desc: string }[] | null;
  stats: { gamesPlayed: number; gamesValid: number; wins: number; losses: number; draws: number; bestReaction: number | null; bestMemoria: number | null; bestTrivia: number | null; longestStreak: number; activeDays: number } | null;
  activity: { text: string; icon: string; createdAt: number }[] | null;
};
const AVATARS = ["🎮", "🦊", "🌙", "🐸", "🐱", "🤖", "🦉", "🐼", "🚀", "🔥", "🍀", "👾"];
const PRIV: [keyof NonNullable<P["privacy"]>, string][] = [["showInRanking", "Aparecer en los rankings públicos"], ["showStats", "Mostrar mis estadísticas"], ["showBadges", "Mostrar mis insignias"], ["showActivity", "Mostrar mi actividad reciente"]];

export default function Perfil({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [p, setP] = useState<P | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ displayName: "", bio: "", avatar: "🎮", showInRanking: true, showActivity: true, showStats: true, showBadges: true });

  const load = useCallback(() => api<{ profile: P }>(`/api/profile/${encodeURIComponent(username)}`).then(({ profile }) => {
    setP(profile);
    if (profile.isOwner) setForm({ displayName: profile.displayName, bio: profile.bio, avatar: profile.avatar, ...profile.privacy! });
  }).catch((e: Error) => setErr(e.message)), [username]);
  useEffect(() => { void load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    try { await api("/api/profile", "PATCH", form); setMsg("Perfil actualizado."); await load(); } catch (er) { setMsg((er as Error).message); }
  }
  const [reporting, setReporting] = useState(false);
  const [rep, setRep] = useState({ reason: "spam", detail: "" });
  async function report(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    try { await api("/api/reports", "POST", { username, ...rep }); setReporting(false); setMsg("Gracias. El equipo revisará tu reporte."); }
    catch (er) { setMsg((er as { status?: number }).status === 401 ? "Inicia sesión para reportar." : (er as Error).message); }
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); if (auth) await signOut(auth); window.location.href = "/comunidad"; }

  if (err) return <div className="card" style={{ maxWidth: 620, margin: "30px auto" }} role="alert"><h1 className="title">Perfil</h1><p>{err}</p></div>;
  if (!p) return <div className="empty">Cargando perfil…</div>;
  const title = titleOf(p.equipped.title);
  const joined = p.joinedAt ? new Date(p.joinedAt).toLocaleDateString("es-CO", { year: "numeric", month: "long" }) : null;

  return (
    <>
      <section className="card" style={{ background: themeCss(p.equipped.theme) }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <ProfileAvatar avatar={p.avatar} frame={p.equipped.frame} size={84} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <span className="eyebrow">{title?.emoji} {title?.name?.toUpperCase()}</span>
            <h1 className="title" style={{ fontSize: 30, margin: "4px 0" }}>{p.displayName}</h1>
            <span className="muted">@{p.username}{joined ? ` · miembro desde ${joined}` : ""}</span>
          </div>
          <div style={{ minWidth: 180 }}>
            <strong>Nivel {p.level}</strong>
            <div className="progress" role="progressbar" aria-valuenow={p.levelProgress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de nivel"><span style={{ width: `${p.levelProgress.percent}%` }} /></div>
            <small className="muted">{p.xp.toLocaleString("es-CO")} XP</small>
          </div>
        </div>
        {p.bio && <p style={{ marginTop: 14 }}>{p.bio}</p>}
      </section>

      <div className="grid grid-3" style={{ marginTop: 18, alignItems: "start" }}>
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Estadísticas</h2>
          {p.stats ? <div className="list" style={{ marginTop: 10, fontSize: 14 }}>
            <div className="between"><span>Partidas jugadas</span><strong>{p.stats.gamesPlayed}</strong></div>
            <div className="between"><span>Partidas válidas</span><strong>{p.stats.gamesValid}</strong></div>
            <div className="between"><span>Retos (V / D / E)</span><strong>{p.stats.wins} / {p.stats.losses} / {p.stats.draws}</strong></div>
            <div className="between"><span>Récord de reflejos</span><strong>{p.stats.bestReaction ? `${p.stats.bestReaction} ms` : "—"}</strong></div>
            <div className="between"><span>Mejor memoria</span><strong>{p.stats.bestMemoria ?? "—"}</strong></div>
            <div className="between"><span>Mejor trivia</span><strong>{p.stats.bestTrivia ?? "—"}</strong></div>
            <div className="between"><span>Mejor racha</span><strong>{p.stats.longestStreak} días</strong></div>
            <div className="between"><span>Días activos</span><strong>{p.stats.activeDays}</strong></div>
          </div> : <div className="empty" style={{ marginTop: 10 }}>Este jugador mantiene sus estadísticas privadas.</div>}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Insignias</h2>
          {p.badges === null ? <div className="empty" style={{ marginTop: 10 }}>Insignias privadas.</div>
            : p.badges.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>Todavía no hay insignias.</div>
            : <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>{p.badges.map((b) => <span key={b.id} className="badge-icon" title={`${b.name}: ${b.desc}`} aria-label={b.name} style={{ fontSize: 26, width: 52, height: 52 }}>{b.emoji}</span>)}</div>}
        </section>
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Actividad reciente</h2>
          {p.activity === null ? <div className="empty" style={{ marginTop: 10 }}>Actividad privada.</div>
            : p.activity.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>Sin actividad todavía.</div>
            : <div className="list" style={{ marginTop: 10 }}>{p.activity.map((a, i) => <div className="listitem" key={i}><span aria-hidden>{a.icon}</span><div className="grow"><strong style={{ fontWeight: 500 }}>{a.text}</strong><small>{new Date(a.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</small></div></div>)}</div>}
        </section>
      </div>

      {!p.isOwner && (
        <div style={{ marginTop: 14 }}>
          {!reporting ? <button className="button" onClick={() => setReporting(true)}>🚩 Reportar a este usuario</button> : (
            <form className="card" onSubmit={report} style={{ maxWidth: 560 }}>
              <h2 style={{ fontSize: 18 }}>Reportar a @{p.username}</h2>
              <div className="field"><label htmlFor="rr">Motivo</label>
                <select id="rr" value={rep.reason} onChange={(e) => setRep({ ...rep, reason: e.target.value })}>
                  <option value="spam">Spam o publicidad</option><option value="abuso">Acoso o abuso</option><option value="trampa">Trampas o manipulación de resultados</option><option value="contenido">Contenido inapropiado</option><option value="otro">Otro motivo</option></select></div>
              <div className="field"><label htmlFor="rd">Detalles (opcional)</label><textarea id="rd" rows={3} maxLength={300} value={rep.detail} onChange={(e) => setRep({ ...rep, detail: e.target.value })} /></div>
              <div className="row"><button className="button primary">Enviar reporte</button><button type="button" className="button" onClick={() => setReporting(false)}>Cancelar</button></div>
            </form>)}
          {msg && <div className="notice" role="status" style={{ marginTop: 12 }}>{msg}</div>}
        </div>
      )}

      {p.isOwner && (
        <form className="card" onSubmit={save} style={{ marginTop: 18, maxWidth: 760 }}>
          <h2>Configuración del perfil</h2>
          <div className="field"><label htmlFor="dn">Nombre visible</label><input id="dn" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} minLength={2} maxLength={40} required /></div>
          <div className="field"><label htmlFor="bio">Biografía</label><textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={180} rows={3} /></div>
          <fieldset style={{ border: 0, padding: 0, margin: "12px 0" }}><legend className="muted" style={{ fontSize: 13 }}>Avatar</legend>
            <div className="row" style={{ flexWrap: "wrap", marginTop: 6 }}>{AVATARS.map((a) => <button type="button" key={a} className={form.avatar === a ? "button primary" : "button"} aria-pressed={form.avatar === a} aria-label={`Avatar ${a}`} onClick={() => setForm({ ...form, avatar: a })}>{a}</button>)}</div></fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: "12px 0" }}><legend className="muted" style={{ fontSize: 13 }}>Privacidad</legend>
            <div className="list" style={{ marginTop: 6 }}>{PRIV.map(([k, label]) => <label key={k} className="row" style={{ cursor: "pointer" }}><input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} /><span>{label}</span></label>)}</div></fieldset>
          <p className="muted" style={{ fontSize: 12 }}>Marco, tema y título se eligen en <a href="/coleccion" style={{ textDecoration: "underline" }}>Colección</a>. Tu saldo de monedas nunca es público. Para descargar tus datos o eliminar tu cuenta ve a <a href="/cuenta" style={{ textDecoration: "underline" }}>Mi cuenta</a>.</p>
          <div className="row" style={{ marginTop: 12 }}><button className="button primary">Guardar cambios</button><button type="button" className="button" onClick={logout}>Cerrar sesión</button></div>
          {msg && <div className="notice" role="status" style={{ marginTop: 12 }}>{msg}</div>}
        </form>
      )}
    </>
  );
}
