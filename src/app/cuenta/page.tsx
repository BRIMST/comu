"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { api } from "@/lib/client-api";

export default function Cuenta() {
  const [username, setUsername] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => { api<{ profile: { username: string } | null }>("/api/profile").then((d) => setUsername(d.profile?.username ?? "")).catch(() => setUsername("")); }, []);

  async function remove(e: React.FormEvent) {
    e.preventDefault(); setMsg(""); setBusy(true);
    try {
      const user = auth?.currentUser;
      if (!auth || !user || !user.email) throw new Error("Vuelve a iniciar sesión para eliminar tu cuenta.");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      const idToken = await user.getIdToken(true);
      await api("/api/account/delete", "POST", { idToken, confirm });
      await signOut(auth).catch(() => {});
      setOk(true); setMsg("Tu cuenta fue eliminada. ¡Gracias por haber sido parte del Refugio!");
    } catch (er) {
      const code = (er as { code?: string }).code;
      setMsg(code === "auth/invalid-credential" || code === "auth/wrong-password" ? "La contraseña no es correcta." : (er as Error).message);
    } finally { setBusy(false); }
  }

  if (ok) return <div className="card" style={{ maxWidth: 620, margin: "30px auto" }} role="status"><h1 className="title">Cuenta eliminada</h1><p>{msg}</p><Link className="button primary" href="/comunidad">Ir al inicio</Link></div>;

  return (
    <>
      <span className="eyebrow">TUS DATOS, TU DECISIÓN</span>
      <h1 className="title">Mi cuenta</h1>
      <p className="sub">Descarga una copia de tus datos o elimina tu cuenta. Más información en la <Link href="/privacidad" style={{ textDecoration: "underline" }}>política de privacidad</Link>.</p>
      <div className="grid grid-3" style={{ marginTop: 22, alignItems: "start" }}>
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Descargar mis datos</h2>
          <p style={{ fontSize: 13 }}>Un archivo JSON con tu perfil, saldo e historial, estadísticas, insignias, colección, notificaciones, retos y aportes.</p>
          <a className="button primary" href="/api/account/export" download>Descargar copia</a>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Privacidad del perfil</h2>
          <p style={{ fontSize: 13 }}>Elige qué se muestra públicamente: rankings, estadísticas, insignias y actividad.</p>
          {username ? <Link className="button" href={`/perfil/${username}`}>Ir a mi perfil</Link> : null}
        </section>
        <form className="card" onSubmit={remove} style={{ gridColumn: "1 / -1" }}>
          <h2 style={{ fontSize: 18 }}>Eliminar mi cuenta</h2>
          <p style={{ fontSize: 13 }}>Es <strong>permanente</strong>: se borran tu perfil, estadísticas, monedas, insignias y colección, y tu nombre de usuario queda libre. Los retos terminados se conservan sin tu nombre. No se puede hacer con retos en curso.</p>
          <div className="field"><label htmlFor="cf">Escribe tu nombre de usuario{username ? ` (${username})` : ""} para confirmar</label><input id="cf" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required /></div>
          <div className="field"><label htmlFor="pw">Tu contraseña</label><input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></div>
          {msg && <div className="notice" role="alert" style={{ marginBottom: 10 }}>{msg}</div>}
          <button className="button" style={{ borderColor: "#ff7a7a", color: "#ffb4b4" }} disabled={busy || !username || confirm.trim().toLowerCase() !== username}>{busy ? "Eliminando…" : "Eliminar mi cuenta definitivamente"}</button>
        </form>
      </div>
    </>
  );
}
