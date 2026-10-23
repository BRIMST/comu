import type { NextConfig } from "next";

// Cabeceras de seguridad básicas. No se define Content-Security-Policy aquí porque Next.js inyecta scripts en línea;
// si se requiere CSP estricta hay que añadir nonces vía middleware (ver docs/DESPLIEGUE.md).
const headers = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() { return [{ source: "/:path*", headers }]; },
};
export default nextConfig;
