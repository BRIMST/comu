"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

type Mission = { id: string; title: string; desc: string; target: number; xp: number; coins: number; progress: number; done: boolean };
type Data = {
  level: number; xp: number; levelProgress: { level: number; current: number; needed: number; percent: number };
  streak: { current: number; longest: number; activeToday: boolean };
  missions: { daily: Mission[]; weekly: Mission[] };
  achievements: { id: string; name: string; desc: string; emoji: string; xp: number; unlocked: boolean; progress: { value: number; target: number }; unlocksItem: string | null }[];
  caps: { xpUsed: number; xpMax: number; coinsUsed: number; coinsMax: number };
  history: { amount: number; reason: string; createdAt: number }[];
};

function Missions({ title, tag, list }: { title: string; tag: string; list: Mission[] }) {
  return (
    <>
      <div className="section-head"><h2>{title}</h2><span className="tag">{tag}</span></div>
      <div className="list">{list.map((m) => {
        const pct = Math.round((m.progress / m.target) * 100);
        return (
          <div className="listitem" key={m.id} style={{ opacity: m.done ? 0.75 : 1 }}>
            <div className="badge-icon" aria-hidden>{m.done ? "✅" : "🎯"}</div>
            <div className="grow">
              <strong>{m.title}</strong><small>{m.desc}</small>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={m.title}><span style={{ width: `${pct}%` }} /></div>
              <small>{m.progress}/{m.target} · +{m.xp} XP · +{m.coins} 🪙</small>
            </div>
          </div>);
      })}</div>
    </>
  );
}

export default function Progresion() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [authed, setAuthed] = useState(true);
  useEffect(() => { api<Data>("/api/progress").then(setD).catch((e: { status?: number; message: string }) => { if (e.status === 401) setAuthed(false); else setErr(e.message); }); }, []);

  return (
    <>
      <span className="eyebrow">CADA PASO CUENTA</span>
      <h1 className="title">Tu progresión</h1>
      <p className="sub">La experiencia (XP) sube tu nivel; las monedas virtuales son un sistema aparte; las insignias celebran logros. Las recompensas por jugar tienen tope diario.</p>
      {!authed && <div className="notice" style={{ marginTop: 18 }}>Para ver tu progreso debes <a href="/login" style={{ textDecoration: "underline" }}>iniciar sesión</a>.</div>}
      {err && <div className="notice" role="alert" style={{ marginTop: 18 }}>{err}</div>}
      {authed && !d && !err && <p className="muted" style={{ marginTop: 22 }}>Cargando…</p>}

      {d && <div className="grid grid-main" style={{ marginTop: 22 }}>
        <section>
          <div className="card">
            <div className="row"><div className="avatar big" aria-hidden>⚡</div>
              <div><span className="eyebrow">NIVEL {d.level}</span><h2 style={{ fontSize: 27, margin: "5px 0" }}>{d.xp.toLocaleString("es-CO")} XP</h2></div></div>
            <div className="between" style={{ margin: "22px 0 10px", fontSize: 13 }}><span>Hacia el nivel {d.level + 1}</span><strong>{d.levelProgress.current} / {d.levelProgress.needed} XP</strong></div>
            <div className="progress" role="progressbar" aria-valuenow={d.levelProgress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de nivel"><span style={{ width: `${d.levelProgress.percent}%` }} /></div>
            <div className="stats" style={{ marginTop: 20 }}>
              <div className="stat"><small>Racha actual</small><strong>🔥 {d.streak.current} {d.streak.current === 1 ? "día" : "días"}</strong><small>{d.streak.activeToday ? "¡Hoy ya cuenta!" : "Haz algo hoy para mantenerla"}</small></div>
              <div className="stat"><small>Mejor racha</small><strong>{d.streak.longest}</strong><small>Bonos a los 3, 7, 14 y 30 días</small></div>
              <div className="stat"><small>Tope de hoy</small><strong>{d.caps.xpUsed}/{d.caps.xpMax} XP</strong><small>{d.caps.coinsUsed}/{d.caps.coinsMax} 🪙 por partidas</small></div>
            </div>
          </div>
          <Missions title="Misiones diarias" tag="SE RENUEVAN A MEDIANOCHE" list={d.missions.daily} />
          <Missions title="Misiones semanales" tag="SE RENUEVAN EL LUNES" list={d.missions.weekly} />
        </section>

        <aside>
          <div className="card">
            <h2 style={{ fontSize: 18 }}>Insignias</h2>
            <div className="list" style={{ marginTop: 10 }}>{d.achievements.map((a) => (
              <div className="listitem" key={a.id} style={{ opacity: a.unlocked ? 1 : 0.6 }}>
                <div className="badge-icon" aria-hidden>{a.emoji}</div>
                <div className="grow"><strong>{a.name}{a.unlocked && <span className="sr-only"> (desbloqueada)</span>}</strong><small>{a.desc}</small>
                  <small>{a.unlocked ? "✓ Desbloqueada" : `${a.progress.value}/${a.progress.target}`} · +{a.xp} XP{a.unlocksItem ? ` · desbloquea «${a.unlocksItem}»` : ""}</small></div>
              </div>))}</div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 18 }}>Historial de XP</h2>
            {d.history.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>Aún no hay movimientos. ¡Juega tu primera partida!</div> :
              <div className="list" style={{ marginTop: 10 }}>{d.history.map((h, i) => (
                <div className="listitem" key={i}><div className="grow"><strong>+{h.amount} XP</strong><small>{h.reason} · {new Date(h.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</small></div></div>))}</div>}
          </div>
        </aside>
      </div>}
    </>
  );
}
