import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
const config = { apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, databaseURL:process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID };
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.databaseURL && config.projectId && config.appId);
export const firebaseApp = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const database = firebaseApp ? getDatabase(firebaseApp) : null;
