"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";

type Item = { id: string; slot: "frame" | "theme" | "title"; name: string; desc: string; price: number; css: string | null; emoji: string | null; owned: boolean; equipped: boolean; lockedReason: string | null; buyable: boolean };
type Cat = { balance: number; items: Item[]; owned: number };
type Prog = { achievements: { id: string; name: string; desc: string; emoji: string; unlocked: boolean }[] };
const SLOTS = [["frame", "Marcos de avatar"], ["theme", "Temas de perfil"], ["title", "Títulos"]] as const;

export default function Coleccion() {
  const [cat, setCat] = useState<Cat | null>(null);
  const [prog, setProg] = useState<Prog | null>(null);
  const [authed, setAuthed] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const [c, p] = await Promise.all([api<Cat>("/api/collection"), api<Prog>("/api/progress")]); setCat(c); setProg(p); }
    catch (e) { if ((e as { status?: number }).status === 401) setAuthed(false); else setMsg((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(key: string, body: unknown, ok: string) {
    setBusy(key); setMsg("");
    try { await api("/api/collection", "POST", body); setMsg(ok); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); void load(); }
  }

  const unlocked = prog?.achievements.filter((a) => a.unlocked).length ?? 0;
  return (
    <>
      <span className="eyebrow">TUS LOGROS, TU ESTILO</span>
      <h1 className="title">Colección e insignias</h1>
      <p className="sub">Personalizaciones cosméticas para celebrar tu recorrido. Se compran solo con monedas virtuales, no se pueden vender ni transferir y no tienen valor económico.</p>
      {!authed && <div className="notice" style={{ marginTop: 18 }}>Para ver tu colección debes <a href="/login" style={{ textDecoration: "underline" }}>iniciar sesión</a>.</div>}
      <div aria-live="polite">{msg && <div className="notice" role="status" style={{ marginTop: 18 }}>{msg}</div>}</div>

      {prog && <>
        <div className="section-head" style={{ marginTop: 24 }}><h2>Insignias</h2><span className="tag">{unlocked} / {prog.achievements.length} DESBLOQUEADAS</span></div>
        <div className="grid grid-3">{prog.achievements.map((a) => (
          <article className="card" key={a.id} style={{ opacity: a.unlocked ? 1 : 0.6 }}>
            <div className="badge-icon" style={{ width: 58, height: 58, fontSize: 29 }} aria-hidden>{a.emoji}</div>
            <h3 style={{ marginTop: 15 }}>{a.name}</h3><p style={{ fontSize: 13 }}>{a.desc}</p>
            <span className="tag">{a.unlocked ? "DESBLOQUEADA" : "POR DESBLOQUEAR"}</span>
          </article>))}</div>
      </>}

      {cat && <>
        <div className="section-head" style={{ marginTop: 30 }}><h2>Catálogo</h2><span className="tag">🪙 {cat.balance.toLocaleString("es-CO")} · {cat.owned} elementos tuyos</span></div>
        {SLOTS.map(([slot, label]) => (
          <section key={slot} style={{ marginTop: 14 }}>
            <h3>{label}</h3>
            <div className="grid grid-3" style={{ marginTop: 10 }}>{cat.items.filter((i) => i.slot === slot).map((i) => (
              <article className="card" key={i.id}>
                <div className="between"><strong>{i.name}</strong>{i.equipped && <span className="tag">EQUIPADO</span>}</div>
                <div aria-hidden style={{ height: 44, borderRadius: 12, margin: "10px 0", display: "grid", placeItems: "center", fontSize: 24, background: slot === "theme" ? i.css ?? undefined : "rgba(255,255,255,.04)", boxShadow: slot === "frame" ? i.css ?? undefined : undefined }}>{i.emoji ?? (slot === "frame" ? "🎮" : "")}</div>
                <p style={{ fontSize: 13 }}>{i.desc}</p>
                {i.owned ? (
                  <button className="button" disabled={busy !== null || i.equipped} onClick={() => act(i.id, { action: "equip", slot, itemId: i.id }, `${i.name} equipado.`)}>{i.equipped ? "En uso" : "Equipar"}</button>
                ) : i.buyable ? (
                  <button className="button primary" disabled={busy !== null || cat.balance < i.price} onClick={() => act(i.id, { action: "buy", itemId: i.id }, `¡${i.name} añadido a tu colección!`)}>Comprar · {i.price} 🪙</button>
                ) : <span className="muted" style={{ fontSize: 12 }}>🔒 {i.lockedReason ?? "No disponible"}</span>}
              </article>))}</div>
          </section>))}
      </>}
    </>
  );
}
