import "server-only";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "./firebase-admin";
export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "refugio_session";
/** Usuario de la sesión, o null. Las cuentas suspendidas nunca pasan (defensa extra además de deshabilitar la cuenta en Firebase Auth). */
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    const suspended = (await adminDb().ref(`users/${decoded.uid}/suspended`).get()).val();
    return suspended === true ? null : decoded;
  } catch { return null; }
}
