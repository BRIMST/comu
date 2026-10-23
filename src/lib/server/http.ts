import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "./errors";

/** Defensa CSRF básica para POST con cookie de sesión: si el navegador envía Origin, debe coincidir con el host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch { return false; }
}

export function fail(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("api_error", e instanceof Error ? e.message : "unknown");
  return NextResponse.json({ error: "Ocurrió un error. Intenta de nuevo." }, { status: 500 });
}
