"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [{ href: "/comunidad", label: "Comunidad", icon: "⌂" }, { href: "/juegos", label: "Juegos", icon: "▣" }, { href: "/retos", label: "Retos", icon: "⚔" }, { href: "/ranking", label: "Ranking", icon: "♜" }, { href: "/perfil", label: "Perfil", icon: "◉" }];
type Me = { loggedIn: boolean; username?: string | null; avatar?: string; isAdmin?: boolean };

export function SiteShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [siteName, setSiteName] = useState("El Refugio");
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/site-settings", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive && typeof d.siteName === "string") setSiteName(d.siteName); }).catch(() => {});
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) setMe(d); }).catch(() => {});
    const update = (e: Event) => { const name = (e as CustomEvent<string>).detail; if (typeof name === "string") setSiteName(name); };
    window.addEventListener("site-name-updated", update);
    return () => { alive = false; window.removeEventListener("site-name-updated", update); };
  }, [path]);
  const active = (href: string) => (path === href || path.startsWith(href + "/") ? "active" : "");
  return (
    <>
      <div className="shell">
        <a href="#contenido" className="sr-only">Saltar al contenido</a>
        <header className="topbar">
          <Link href="/comunidad" className="brand"><span className="brand-mark">✦</span><span>{siteName.toLocaleUpperCase()} <span style={{ color: "#8da0ff" }}>.</span><small style={{ display: "block", fontSize: 10, letterSpacing: 2, color: "#8998b6", fontWeight: 600, marginTop: 2 }}>COMUNIDAD GAMER</small></span></Link>
          <nav className="nav" aria-label="Navegación principal">
            {links.map((x) => <Link key={x.href} href={x.href} className={active(x.href)}>{x.label}</Link>)}
            <Link href="/lives" className={active("/lives")}>Lives</Link>
            <Link href="/monedero" className={active("/monedero")}>Monedero</Link>
            <Link href="/progresion" className={active("/progresion")}>Progresión</Link>
            <Link href="/coleccion" className={active("/coleccion")}>Colección</Link>
            <Link href="/apoyar" className={active("/apoyar")}>💜 Apoyar</Link>
            {me?.isAdmin && <Link href="/admin" className={active("/admin")}>Admin</Link>}
          </nav>
          {me?.loggedIn
            ? <Link className="button primary" href={me.username ? `/perfil/${me.username}` : "/perfil"}>{me.avatar ?? "🎮"} {me.username ?? "Mi perfil"}</Link>
            : <Link className="button primary" href="/login">Entrar ↗</Link>}
        </header>
        <main id="contenido">{children}</main>
        <footer className="footer">
          {siteName.toLocaleUpperCase()} · Una comunidad para jugar, crecer y compartir. <span style={{ color: "#7e8caf" }}>Monedas sin valor monetario.</span>
          <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <Link href="/lives">Lives</Link><Link href="/notificaciones">Notificaciones</Link><Link href="/apoyar">Apoyar</Link><Link href="/cuenta">Mi cuenta</Link><Link href="/terminos">Términos</Link><Link href="/privacidad">Privacidad</Link>
          </div>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {links.map((x) => <Link key={x.href} href={x.href} className={active(x.href)}><span>{x.icon}</span><span>{x.label}</span></Link>)}
      </nav>
    </>
  );
}
