// Copia de seguridad opcional de la Realtime Database (solo lectura) a un JSON local.
// Uso: FIREBASE_SERVICE_ACCOUNT_BASE64=... NEXT_PUBLIC_FIREBASE_DATABASE_URL=... node scripts/backup.mjs [carpeta]
// El archivo contiene datos personales: guárdalo cifrado y fuera del repositorio.
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { mkdirSync, writeFileSync } from "node:fs";

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
if (!b64 || !databaseURL) { console.error("Faltan FIREBASE_SERVICE_ACCOUNT_BASE64 o NEXT_PUBLIC_FIREBASE_DATABASE_URL."); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8"))), databaseURL });
const dir = process.argv[2] ?? "backups";
mkdirSync(dir, { recursive: true });
const snap = await getDatabase().ref("/").get();
const file = `${dir}/refugio-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(snap.val() ?? {}), { mode: 0o600 });
console.log("Copia guardada en", file);
process.exit(0);
