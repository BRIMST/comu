"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { ProfileAvatar } from "@/components/profile-avatar";
import { formatCOP } from "@/lib/domain/donations";

type Home = {
  me: { username: string; displayName: string; avatar: string; frame: string; level: number; xp: number; levelProgress: { current: number; needed: number; percent: number }; balance: number; unread: number; streak: { current: number; activeToday: boolean } } | null;
  features: { games: boolean; challenges: boolean };
  games: { id: string; name: string; icon: string; description: string; difficulty: string; enabled: boolean }[];
  dailyChallenge: { title: string; desc: string; target: number; xp: number; coins: number; progress: number; done: boolean; personal: boolean };
  activity: { username: string; text: string; icon: string; createdAt: number }[];
  weeklyTop: { rank: number; username: string; avatar: string; value: number }[];
  nextEvent: { id: string; title: string; kind: "live" | "evento"; startsAt: number; links: { label: string; url: string }[] } | null;
  openPolls: { id: string; question: string; closesAt: number; myVote: string | null }[];
  goal: { title: string; percent: number; raisedCOP: number; targetCOP: number } | null;
};
const ago = (ms: number) => { const m = Math.max(1, Math.round((Date.now() - ms) / 60000)); return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const when = (ms: number) => new Date(ms).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Comunidad() {
  const [d, setD] = useState<Home | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<Home>("/api/community/home").then(setD).catch((e: Error) => setErr(e.message)); }, []);

  if (err) return <div className="notice" role="alert" style={{ marginTop: 20 }}>No pudimos cargar la comunidad: {err} <button className="button" onClick={() => location.reload()}>Reintentar</button></div>;
  if (!d) return <div aria-busy="true" aria-live="polite"><section className="hero"><span className="eyebrow">✦ TU PUNTO DE ENCUENTRO</span><h1>Cargando el Refugio…</h1><p className="muted">Un momento.</p></section></div>;
  const me = d.me;

  return (
    <>
      <section className="hero">
        <span className="eyebrow">✦ TU PUNTO DE ENCUENTRO</span>
        {me ? <>
          <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
            <ProfileAvatar avatar={me.avatar} frame={me.frame} size={72} />
            <div><h1 style={{ margin: 0 }}>¡Hola, {me.displayName}!</h1><p style={{ margin: "4px 0 0" }}>{me.streak.current > 0 ? `🔥 Llevas ${me.streak.current} ${me.streak.current === 1 ? "día" : "días"} de racha${me.streak.activeToday ? "" : ": juega hoy para mantenerla"}.` : "Juega hoy para empezar tu racha."}</p></div>
          </div>
          <div className="stats">
            <div className="stat"><small>Tu nivel</small><strong>{String(me.level).padStart(2, "0")}</strong><div className="progress" role="progressbar" aria-valuenow={me.levelProgress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de nivel"><span style={{ width: `${me.levelProgress.percent}%` }} /></div></div>
            <div className="stat"><small>Monedas</small><strong>🪙 {me.balance.toLocaleString("es-CO")}</strong><small>Virtuales, sin valor monetario</small></div>
            <div className="stat"><small>Experiencia</small><strong>{me.xp.toLocaleString("es-CO")} XP</strong><small>{me.levelProgress.current}/{me.levelProgress.needed} al siguiente nivel</small></div>
          </div>
          <div className="row" style={{ marginTop: 18, flexWrap: "wrap" }}>
            <Link className="button primary" href={`/perfil/${me.username}`}>Ver mi perfil</Link>
            <Link className="button ghost" href="/notificaciones">Notificaciones{me.unread > 0 ? ` (${me.unread})` : ""}</Link>
          </div>
        </> : <>
          <h1>Un refugio para<br /><span style={{ background: "linear-gradient(90deg,#8ea8ff,#c2a1ff)", WebkitBackgroundClip: "text", color: "transparent" }}>los que juegan en equipo.</span></h1>
          <p>Juega, comparte y crece junto a tu comunidad favorita. Cada logro cuenta, cada persona suma.</p>
          <div className="row" style={{ marginTop: 22, flexWrap: "wrap" }}><Link className="button primary" href="/registro">Crear mi cuenta <span>↗</span></Link><Link className="button ghost" href="/login">Ya tengo cuenta →</Link></div>
        </>}
      </section>

      <div className="grid grid-main" style={{ marginTop: 22, alignItems: "start" }}>
        <section>
          <div className="section-head"><h2>Minijuegos</h2><Link href="/juegos" className="muted" style={{ fontSize: 12 }}>Ver arcade →</Link></div>
          <div className="grid grid-3">{d.games.map((g) => (
            <article className="card" key={g.id} style={{ opacity: g.enabled ? 1 : 0.6 }}>
              <div className="iconbox" aria-hidden>{g.icon}</div><span className="tag">{g.enabled ? g.difficulty.toUpperCase() : "PAUSADO"}</span>
              <h3 style={{ marginTop: 10, fontSize: 17 }}>{g.name}</h3><p style={{ fontSize: 13, minHeight: 40 }}>{g.description}</p>
              {g.enabled ? <Link href="/juegos" className="muted" style={{ fontSize: 13 }}>Jugar <span style={{ color: "#aab7ff" }}>→</span></Link> : <small className="muted">Desactivado temporalmente</small>}
            </article>))}</div>

          <div className="section-head" style={{ marginTop: 24 }}><h2>Reto del día</h2><span className="tag">SE RENUEVA A MEDIANOCHE</span></div>
          <div className="card">
            <div className="between"><strong>🎯 {d.dailyChallenge.title}</strong><span className="tag">{d.dailyChallenge.done ? "¡COMPLETADO!" : `+${d.dailyChallenge.xp} XP · +${d.dailyChallenge.coins} 🪙`}</span></div>
            <p style={{ fontSize: 13 }}>{d.dailyChallenge.desc}</p>
            {d.dailyChallenge.personal ? <><div className="progress" role="progressbar" aria-valuenow={Math.round(d.dailyChallenge.progress / d.dailyChallenge.target * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del reto del día"><span style={{ width: `${Math.round(d.dailyChallenge.progress / d.dailyChallenge.target * 100)}%` }} /></div><small className="muted">{d.dailyChallenge.progress}/{d.dailyChallenge.target}</small></>
              : <small className="muted"><Link href="/login" style={{ textDecoration: "underline" }}>Inicia sesión</Link> para ver tu progreso.</small>}
          </div>

          <div className="section-head" style={{ marginTop: 24 }}><h2>Actividad de la comunidad</h2><Link href="/ranking" className="muted" style={{ fontSize: 12 }}>Ver clasificación →</Link></div>
          {d.activity.length === 0 ? <div className="empty">Todavía no hay actividad. ¡Juega y sé el primero en aparecer aquí!</div> :
            <div className="card"><div className="list">{d.activity.map((a, i) => (
              <div className="listitem" key={i}><div className="avatar" aria-hidden>{a.icon}</div><div className="grow"><strong><Link href={`/perfil/${a.username}`}>@{a.username}</Link> <span className="muted" style={{ fontWeight: 400 }}>{a.text}</span></strong><small>{ago(a.createdAt)}</small></div></div>))}</div></div>}
        </section>

        <aside>
          <div className="card">
            <div className="between"><h2 style={{ fontSize: 18 }}>Ranking semanal</h2><Link href="/ranking" className="muted" style={{ fontSize: 12 }}>Completo →</Link></div>
            {d.weeklyTop.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>La semana acaba de empezar. ¡Sé el primero!</div> :
              <div className="list" style={{ marginTop: 10 }}>{d.weeklyTop.map((e) => (
                <div className="listitem" key={e.username}><span className="ranknum">{String(e.rank).padStart(2, "0")}</span><div className="avatar" aria-hidden>{e.avatar}</div><div className="grow"><strong><Link href={`/perfil/${e.username}`}>@{e.username}</Link></strong></div><span>{e.value} XP</span></div>))}</div>}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="between"><h2 style={{ fontSize: 18 }}>Próximo evento</h2><Link href="/lives" className="muted" style={{ fontSize: 12 }}>Lives →</Link></div>
            {d.nextEvent ? <div style={{ marginTop: 8 }}><span className="tag">{d.nextEvent.kind === "live" ? "🔴 LIVE" : "EVENTO"}</span><h3 style={{ margin: "8px 0 2px" }}>{d.nextEvent.title}</h3><p style={{ fontSize: 13 }}><time dateTime={new Date(d.nextEvent.startsAt).toISOString()}>{when(d.nextEvent.startsAt)}</time></p>
              <div className="row" style={{ flexWrap: "wrap" }}>{d.nextEvent.links.map((l) => <a key={l.url} className="button" href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}</div></div>
              : <div className="empty" style={{ marginTop: 10 }}>No hay eventos programados todavía.</div>}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="between"><h2 style={{ fontSize: 18 }}>Encuestas abiertas</h2><Link href="/lives" className="muted" style={{ fontSize: 12 }}>Votar →</Link></div>
            {d.openPolls.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>No hay encuestas abiertas.</div> :
              <div className="list" style={{ marginTop: 10 }}>{d.openPolls.map((p) => <div className="listitem" key={p.id}><div className="grow"><strong>{p.question}</strong><small>{p.myVote ? "✓ Ya votaste" : `Cierra ${when(p.closesAt)}`}</small></div></div>)}</div>}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 18 }}>Muro de apoyo</h2>
            <p style={{ fontSize: 13 }}>Donar es voluntario y nunca da ventajas en los juegos.</p>
            {d.goal && <><strong style={{ fontSize: 14 }}>{d.goal.title}</strong><div className="progress" role="progressbar" aria-valuenow={d.goal.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${d.goal.title}`}><span style={{ width: `${d.goal.percent}%` }} /></div><small className="muted">{formatCOP(d.goal.raisedCOP)} de {formatCOP(d.goal.targetCOP)}</small></>}
            <div style={{ marginTop: 10 }}><Link className="button" href="/apoyar">Conocer más 💜</Link></div>
          </div>
        </aside>
      </div>
    </>
  );
}
