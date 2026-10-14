import type { Metadata } from "next";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";
export const metadata: Metadata = { title: "El Refugio — Comunidad gamer", description: "Tu punto de encuentro para jugar, crecer y compartir con la comunidad.", applicationName: "El Refugio" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body><SiteShell>{children}</SiteShell></body></html>; }
