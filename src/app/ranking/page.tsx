"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

const TABS = [["weekly", "Semana", "Mejores jugadores de la semana (se reinicia cada lunes)"], ["alltime", "Experiencia", "Mayor experiencia acumulada"], ["reaction", "Reflejos", "Mejores tiempos de reacción"],
  ["wins", "Victorias", "Más retos ganados"], ["active", "Activos", "Seguidores más activos"], ["champions", "Campeones", "Campeones históricos por semana"]] as const;
type Entry = { rank: number; username: string; avatar: string; value: number; extra?: string };
type Resp = { board: string; unit: string; entries?: Entry[]; weeks?: { week: string; top: { username: string; xp: number }[] }[] };

export default function Ranking() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("weekly");
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setData(null); setErr(""); api<Resp>(`/api/ranking?board=${tab}`).then(setData).catch((e: Error) => setErr(e.message)); }, [tab]);
  const desc = TABS.find((t) => t[0] === tab)![2];

  return (
    <>
      <span className="eyebrow">COMPITE CONTIGO, CELEBRA EN EQUIPO</span>
      <h1 className="title">Ranking de la comunidad</h1>
      <p className="sub">La clasificación celebra la participación y la habilidad, nunca las donaciones. Puedes ocultar tu perfil desde la configuración de privacidad.</p>
      <div className="row" role="tablist" aria-label="Clasificaciones" style={{ flexWrap: "wrap", marginTop: 20 }}>
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "button primary" : "button"} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>{desc}</p>
      {err && <div className="notice" role="alert" style={{ marginTop: 14 }}>{err}</div>}
      {!data && !err && <p className="muted" style={{ marginTop: 18 }}>Cargando…</p>}

      {data?.entries && (data.entries.length === 0
        ? <div className="empty" style={{ marginTop: 14 }}>Todavía no hay nadie en esta tabla. ¡Sé el primero!</div>
        : <div className="card" style={{ marginTop: 14 }}><div className="list">{data.entries.map((e) => (
          <div className="listitem" key={e.username}>
            <span className="ranknum" style={{ fontSize: 17 }}>{String(e.rank).padStart(2, "0")}</span>
            <div className="avatar" aria-hidden>{e.avatar}</div>
            <div className="grow"><strong><a href={`/perfil/${e.username}`}>@{e.username}</a></strong><small>{e.rank === 1 ? "En cabeza" : e.extra ?? `Puesto #${e.rank}`}</small></div>
            <div style={{ textAlign: "right" }}><strong>{e.value.toLocaleString("es-CO")} {data.unit}</strong></div>
          </div>))}</div></div>)}

      {data?.weeks && (data.weeks.length === 0
        ? <div className="empty" style={{ marginTop: 14 }}>Los campeones aparecen al terminar cada semana.</div>
        : <div className="grid grid-3" style={{ marginTop: 14 }}>{data.weeks.map((w) => (
          <article className="card" key={w.week}><span className="tag">{w.week}</span>
            <div className="list" style={{ marginTop: 10 }}>{w.top.map((t, i) => (
              <div className="listitem" key={t.username}><span className="ranknum">{["🥇", "🥈", "🥉"][i]}</span><div className="grow"><strong><a href={`/perfil/${t.username}`}>@{t.username}</a></strong></div><span>{t.xp} XP</span></div>))}</div>
          </article>))}</div>)}
    </>
  );
}
