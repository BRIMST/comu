import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "./firebase-admin";
export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "refugio_session";
export async function currentUser(){ const token=(await cookies()).get(SESSION_COOKIE)?.value; if(!token) return null; try{return await adminAuth().verifySessionCookie(token,true)}catch{return null} }
