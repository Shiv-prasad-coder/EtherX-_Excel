// src/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🧠 Paste your actual Firebase config below (from Firebase Console)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ Export Firestore (this fixes your error)
export const db = getFirestore(app);
