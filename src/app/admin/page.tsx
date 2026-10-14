"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [siteName, setSiteName] = useState("El Refugio");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "No tienes permisos para acceder al panel.");
        setSiteName(data.siteName); setAuthorized(true);
      })
      .catch((e: unknown) => { setError(true); setMessage(e instanceof Error ? e.message : "No se pudo cargar el panel."); })
      .finally(() => setLoading(false));
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el nombre.");
      setSiteName(data.siteName); setMessage("Nombre de la comunidad actualizado correctamente."); setError(false);
      window.dispatchEvent(new CustomEvent("site-name-updated", { detail: data.siteName }));
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : "Ocurrió un error."); }
    finally { setSaving(false); }
  }

  return <section className="page-wrap" style={{ maxWidth: 850, margin: "40px auto", padding: "0 20px" }}>
    <span className="eyebrow">CONFIGURACIÓN DE LA PLATAFORMA</span>
    <h1 style={{ fontSize: 36, margin: "12px 0" }}>Panel de administración</h1>
    <p className="muted">Administra la identidad básica de tu comunidad. Los cambios se guardan en Firebase y se reflejan en la navegación.</p>
    {loading ? <div className="card" style={{ marginTop: 24 }}>Verificando permisos y cargando configuración…</div> : !authorized ? <div className="card" role="alert" style={{ marginTop: 24 }}><p>{message || "No tienes permisos para acceder al panel."}</p><Link href="/comunidad" className="button">Volver a la comunidad</Link></div> : <form className="card" onSubmit={save} style={{ marginTop: 24, padding: 24 }}>
      <h2 style={{ fontSize: 20, marginTop: 0 }}>Nombre de la comunidad</h2>
      <p className="muted" style={{ fontSize: 13 }}>Este nombre aparece en la cabecera y el pie de página. Puedes cambiarlo más adelante.</p>
      <label htmlFor="siteName" style={{ display: "block", margin: "18px 0 8px" }}>Nombre visible</label>
      <input id="siteName" name="siteName" value={siteName} onChange={e => setSiteName(e.target.value)} minLength={2} maxLength={40} required disabled={saving} className="field" style={{ width: "100%", marginBottom: 16 }} />
      <button type="submit" className="button primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
      {message && <p role={error ? "alert" : "status"} style={{ marginTop: 14, color: error ? "#ff9b9b" : "#8ee6bd" }}>{message}</p>}
    </form>}
    <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>Por seguridad, esta sección solo está disponible para usuarios con el rol de administrador verificado en el servidor.</p>
  </section>;
}
