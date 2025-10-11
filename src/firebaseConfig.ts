// src/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import.meta.env.VITE_FIREBASE_API_KEY

// 🔐 use Vercel environment variables (Settings → Environment Variables)
const firebaseConfig = {
  apiKey: "AIzaSyANe3RYfFKKeRf4ya2llEcukPT7pNMAQYA",
  authDomain: "excel-realtime.firebaseapp.com",
  projectId: "excel-realtime",
  storageBucket: "excel-realtime.firebasestorage.app",
  messagingSenderId: "999891162837",
  appId: "1:999891162837:web:654863c076f1ce3715745c",
  measurementId: "G-4ZPQHFGPLS"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

isSupported()
  .then((ok) => ok && getAnalytics(app))
  .catch(() => null);

export default app;
