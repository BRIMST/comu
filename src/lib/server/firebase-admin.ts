import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
let adminApp: App | null = null;
export function getAdminApp(): App { if (adminApp) return adminApp; const encoded=process.env.FIREBASE_SERVICE_ACCOUNT_BASE64; if(!encoded) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED"); const serviceAccount=JSON.parse(Buffer.from(encoded,"base64").toString("utf8")); adminApp=getApps().length?getApps()[0]!:initializeApp({credential:cert(serviceAccount),databaseURL:process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}); return adminApp; }
export function adminAuth(){return getAuth(getAdminApp())}
export function adminDb(){return getDatabase(getAdminApp())}
