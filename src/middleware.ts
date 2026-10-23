import { NextResponse, type NextRequest } from "next/server";

/**
 * Protección de rutas privadas: si no hay cookie de sesión, se redirige a /login.
 * Es solo una comodidad de navegación (no verifica la cookie): la verificación real ocurre en cada API del servidor.
 */

export function middleware(req: NextRequest) {
  const name = process.env.SESSION_COOKIE_NAME || "refugio_session";
  if (req.cookies.get(name)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/monedero/:path*", "/notificaciones/:path*", "/coleccion/:path*", "/progresion/:path*", "/retos/:path*", "/cuenta/:path*", "/admin/:path*"] };
