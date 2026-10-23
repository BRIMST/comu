"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export default function PerfilIndex() {
  const router = useRouter();
  const [msg, setMsg] = useState("Abriendo tu perfil…");
  useEffect(() => {
    api<{ profile: { username: string } | null }>("/api/profile")
      .then((d) => { if (d.profile?.username) router.replace(`/perfil/${d.profile.username}`); else setMsg("Aún no tienes perfil."); })
      .catch(() => setMsg("Inicia sesión para ver tu perfil."));
  }, [router]);
  return <div className="card" style={{ maxWidth: 620, margin: "30px auto" }}><h1 className="title">Tu perfil</h1><p className="muted">{msg}</p>
    <div className="row" style={{ marginTop: 12 }}><a className="button primary" href="/login">Iniciar sesión</a><a className="button" href="/registro">Crear cuenta</a></div></div>;
}
