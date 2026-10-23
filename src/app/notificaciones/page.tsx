"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/domain/community";

type N = { key: string; category: Category; title: string; body: string; link: string | null; createdAt: number; read: boolean };
type Data = { notifications: N[]; unread: number; prefs: Record<Category, boolean> };
const ICON: Record<Category, string> = { challenges: "⚔️", results: "🏆", levels: "✨", badges: "🏅", polls: "🗳️", events: "📅", missions: "🎯", admin: "📣" };

export default function Notificaciones() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [authed, setAuthed] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(() => api<Data>("/api/notifications").then((d) => { setData(d); setAuthed(true); })
    .catch((e: { status?: number; message: string }) => { if (e.status === 401) setAuthed(false); else setMessage(e.message); }), []);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000); return () => clearInterval(t); }, [load]);

  async function post(body: unknown) { try { await api("/api/notifications", "POST", body); } catch (e) { setMessage((e as Error).message); } await load(); }
  const open = async (n: N) => { if (!n.read) await post({ action: "read", keys: [n.key] }); if (n.link) router.push(n.link); };

  return (
    <>
      <span className="eyebrow">AL DÍA</span>
      <h1 className="title">Notificaciones</h1>
      <p className="sub">Retos, resultados, niveles, votaciones y avisos del equipo.</p>
      {!authed && <div className="notice" style={{ marginTop: 18 }}>Para ver tus notificaciones debes <a href="/login" style={{ textDecoration: "underline" }}>iniciar sesión</a>.</div>}
      <div aria-live="polite">{message && <div className="notice" role="status" style={{ marginTop: 18 }}>{message}</div>}</div>

      {data && <div className="grid grid-main" style={{ marginTop: 22 }}>
        <section>
          <div className="between" style={{ marginBottom: 12 }}>
            <h2>Bandeja {data.unread > 0 && <span className="tag">{data.unread} sin leer</span>}</h2>
            <button className="button" disabled={data.unread === 0} onClick={() => post({ action: "read", keys: "all" })}>Marcar todas como leídas</button>
          </div>
          {data.notifications.length === 0 ? <div className="empty">No tienes notificaciones. ¡Todo al día!</div> :
            <div className="card"><div className="list">{data.notifications.map((n) => (
              <button key={n.key} className="listitem" onClick={() => open(n)} style={{ width: "100%", textAlign: "left", opacity: n.read ? 0.65 : 1, background: "transparent", border: 0, color: "inherit", cursor: "pointer" }}>
                <div className="avatar" aria-hidden>{ICON[n.category]}</div>
                <div className="grow"><strong>{n.title}{!n.read && <span className="sr-only"> (sin leer)</span>}</strong><small>{n.body}</small>
                  <small>{new Date(n.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</small></div>
                {!n.read && <span aria-hidden style={{ color: "#8ea8ff" }}>●</span>}
              </button>))}</div></div>}
        </section>
        <aside className="card" aria-labelledby="prefs">
          <h2 id="prefs" style={{ fontSize: 18 }}>Silenciar categorías</h2>
          <p className="muted" style={{ fontSize: 12 }}>Las categorías silenciadas dejan de mostrarse y de generar avisos nuevos.</p>
          <div className="list" style={{ marginTop: 12 }}>{CATEGORIES.map((c) => (
            <label key={c} className="row" style={{ cursor: "pointer", fontSize: 14 }}>
              <input type="checkbox" checked={data.prefs[c]} onChange={(e) => post({ action: "prefs", muted: { ...data.prefs, [c]: e.target.checked } })} />
              <span>{ICON[c]} {CATEGORY_LABEL[c]}</span>
            </label>))}</div>
        </aside>
      </div>}
    </>
  );
}
