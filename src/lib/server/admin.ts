import "server-only";
import { adminDb } from "./firebase-admin";
import { currentUser } from "./session";

/** Devuelve el usuario solo si es administrador verificado en el servidor (claims o users/{uid}/role). */
export async function requireAdmin() {
  const user = await currentUser();
  if (!user) return null;
  const claims = user as unknown as Record<string, unknown>;
  if (claims.admin === true || claims.role === "admin") return user;
  const role = (await adminDb().ref(`users/${user.uid}/role`).get()).val();
  return role === "admin" ? user : null;
}
