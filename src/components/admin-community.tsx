"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";

type Admin = {
  proposals: { id: string; username: string; text: string; status: string }[];
  channels: { label: string; url: string }[];
  events: { upcoming: { id: string; title: string; startsAt: number }[] };
  polls: { id: string; question: string; open: boolean; totalVotes: number | null }[];
  missions: { id: string; title: string; progress: number; target: number; status: string }[];
};
const ms = (v: string) => (v ? new Date(v).getTime() : undefined);
const parseLinks = (txt: string) => txt.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [label, ...rest] = l.split("|"); return { label: (label ?? "").trim(), url: rest.join("|").trim() }; });

const F = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => <div className="field"><label htmlFor={id}>{label}</label>{children}</div>;

export function AdminCommunity() {
  const [d, setD] = useState<Admin | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Admin>("/api/admin/community").then(setD).catch((e: Error) => setMsg(e.message)), []);
  useEffect(() => { void load(); }, [load]);

  async function send(e: FormEvent<HTMLFormElement> | null, body: unknown, ok: string) {
    e?.preventDefault(); const form = e?.currentTarget; setBusy(true); setMsg("");
    try { await api("/api/admin/community", "POST", body); setMsg(ok); form?.reset(); } catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); void load(); }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <span className="eyebrow">PARTICIPACIÓN Y LIVES</span>
      <h2 style={{ fontSize: 26, margin: "8px 0 4px" }}>Gestión de comunidad</h2>
      <p className="muted" style={{ fontSize: 13 }}>Cada acción queda registrada en el registro de auditoría. No se integra TikTok ni YouTube: los enlaces y el progreso se registran a mano.</p>
      <div aria-live="polite">{msg && <div className="notice" role="status" style={{ marginTop: 12 }}>{msg}</div>}</div>

      <div className="grid grid-3" style={{ marginTop: 16, alignItems: "start" }}>
        <form className="card" onSubmit={(e) => { const f = new FormData(e.currentTarget); void send(e, { action: "createEvent", data: { title: f.get("title"), description: f.get("description"), kind: f.get("kind"), startsAt: ms(String(f.get("start"))), endsAt: ms(String(f.get("end"))), links: parseLinks(String(f.get("links"))) } }, "Evento publicado."); }}>
          <h3>Nuevo evento / live</h3>
          <F id="e-t" label="Título"><input id="e-t" name="title" required minLength={3} maxLength={80} /></F>
          <F id="e-d" label="Descripción"><textarea id="e-d" name="description" maxLength={400} rows={2} /></F>
          <F id="e-k" label="Tipo"><select id="e-k" name="kind"><option value="live">Live</option><option value="evento">Evento</option></select></F>
          <F id="e-s" label="Inicio"><input id="e-s" name="start" type="datetime-local" required /></F>
          <F id="e-f" label="Fin (opcional)"><input id="e-f" name="end" type="datetime-local" /></F>
          <F id="e-l" label="Enlaces (uno por línea: Nombre | https://…)"><textarea id="e-l" name="links" rows={2} /></F>
          <button className="button primary" disabled={busy}>Publicar</button>
        </form>

        <form className="card" onSubmit={(e) => { const f = new FormData(e.currentTarget); void send(e, { action: "createPoll", data: { question: f.get("question"), kind: f.get("kind"), options: String(f.get("options")).split("\n").map((o) => o.trim()).filter(Boolean), closesAt: ms(String(f.get("closes"))) } }, "Votación creada."); }}>
          <h3>Nueva votación</h3>
          <F id="p-q" label="Pregunta"><input id="p-q" name="question" required minLength={5} maxLength={140} /></F>
          <F id="p-k" label="Tipo"><select id="p-k" name="kind"><option value="playlist">Playlist</option><option value="juego">Próximo juego</option><option value="general">General</option></select></F>
          <F id="p-o" label="Opciones (2 a 6, una por línea)"><textarea id="p-o" name="options" rows={4} required /></F>
          <F id="p-c" label="Cierra"><input id="p-c" name="closes" type="datetime-local" required /></F>
          <button className="button primary" disabled={busy}>Crear votación</button>
        </form>

        <form className="card" onSubmit={(e) => { const f = new FormData(e.currentTarget); void send(e, { action: "createMission", data: { title: f.get("title"), description: f.get("description"), target: Number(f.get("target")), unit: f.get("unit") || "pasos" } }, "Misión creada."); }}>
          <h3>Nueva misión comunitaria</h3>
          <F id="m-t" label="Título"><input id="m-t" name="title" required minLength={3} maxLength={80} /></F>
          <F id="m-d" label="Descripción"><textarea id="m-d" name="description" maxLength={300} rows={2} /></F>
          <F id="m-g" label="Meta"><input id="m-g" name="target" type="number" min={1} step={1} required /></F>
          <F id="m-u" label="Unidad"><input id="m-u" name="unit" maxLength={20} placeholder="votos, mensajes…" /></F>
          <button className="button primary" disabled={busy}>Crear misión</button>
        </form>

        <form className="card" onSubmit={(e) => { const f = new FormData(e.currentTarget); void send(e, { action: "announce", data: { title: f.get("title"), body: f.get("body") } }, "Aviso publicado para toda la comunidad."); }}>
          <h3>Aviso para todos</h3>
          <F id="a-t" label="Título"><input id="a-t" name="title" required minLength={3} maxLength={80} /></F>
          <F id="a-b" label="Mensaje"><textarea id="a-b" name="body" required minLength={3} maxLength={400} rows={3} /></F>
          <button className="button primary" disabled={busy}>Publicar aviso</button>
        </form>

        <form className="card" onSubmit={(e) => { const f = new FormData(e.currentTarget); void send(e, { action: "setChannels", data: { links: parseLinks(String(f.get("links"))) } }, "Canales oficiales actualizados."); }}>
          <h3>Canales oficiales</h3>
          <F id="c-l" label="Uno por línea: Nombre | https://…"><textarea key={JSON.stringify(d?.channels)} id="c-l" name="links" rows={4} defaultValue={(d?.channels ?? []).map((c) => `${c.label} | ${c.url}`).join("\n")} /></F>
          <button className="button primary" disabled={busy}>Guardar canales</button>
        </form>
      </div>

      {d && <div className="grid grid-3" style={{ marginTop: 16, alignItems: "start" }}>
        <section className="card"><h3>Eventos próximos</h3><div className="list">{d.events.upcoming.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Ninguno.</p>}
          {d.events.upcoming.map((e) => <div className="listitem" key={e.id}><div className="grow"><strong>{e.title}</strong><small>{new Date(e.startsAt).toLocaleString("es-CO")}</small></div><button className="button" disabled={busy} onClick={() => send(null, { action: "cancelEvent", id: e.id }, "Evento cancelado.")}>Cancelar</button></div>)}</div></section>
        <section className="card"><h3>Votaciones</h3><div className="list">{d.polls.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Ninguna.</p>}
          {d.polls.map((p) => <div className="listitem" key={p.id}><div className="grow"><strong>{p.question}</strong><small>{p.open ? "Abierta" : "Cerrada"}</small></div>{p.open && <button className="button" disabled={busy} onClick={() => send(null, { action: "closePoll", id: p.id }, "Votación cerrada.")}>Cerrar</button>}</div>)}</div></section>
        <section className="card"><h3>Misiones</h3><div className="list">{d.missions.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Ninguna.</p>}
          {d.missions.map((m) => <form className="listitem" key={m.id + m.progress} onSubmit={(e) => { const v = Number(new FormData(e.currentTarget).get("p")); void send(e, { action: "missionProgress", id: m.id, progress: v }, "Progreso actualizado."); }}>
            <div className="grow"><strong>{m.title}</strong><small>{m.status} · meta {m.target}</small></div>
            <input name="p" type="number" min={0} max={m.target} defaultValue={m.progress} aria-label={`Progreso de ${m.title}`} style={{ width: 80 }} />
            <button className="button" disabled={busy || m.status === "closed"}>Guardar</button></form>)}</div></section>
        <section className="card" style={{ gridColumn: "1 / -1" }}><h3>Propuestas de la comunidad</h3><div className="list">{d.proposals.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sin propuestas.</p>}
          {d.proposals.map((p) => <div className="listitem" key={p.id}><div className="grow"><strong>@{p.username}</strong><small>{p.text}</small><small>{p.status === "new" ? "Nueva" : p.status === "reviewed" ? "Revisada" : "Descartada"}</small></div>
            {p.status === "new" && <><button className="button" disabled={busy} onClick={() => send(null, { action: "reviewProposal", id: p.id, status: "reviewed" }, "Marcada como revisada.")}>Revisada</button><button className="button" disabled={busy} onClick={() => send(null, { action: "reviewProposal", id: p.id, status: "dismissed" }, "Descartada.")}>Descartar</button></>}</div>)}</div></section>
      </div>}
    </div>
  );
}
