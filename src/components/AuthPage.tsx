// src/components/AuthPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  getAuth as firebaseGetAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import { initializeApp, type FirebaseApp } from "firebase/app";

import logoLight from "../assets/logo_light.png";
import logoDark from "../assets/logo_dark.png";

interface AuthPageProps {
  theme: "light" | "dark";
  onAuth: (user: { name: string; email: string; password?: string }) => void;
  savedUser?: { name: string; email: string; password?: string } | null;
}

type Step = "login" | "signup" | "otp";

/* --------------------------- Firebase Config --------------------------- */
let _fbApp: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null; // avoid SSR issues
  if (_fbApp) return _fbApp;

  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.projectId) {
    console.warn("⚠️ Firebase config missing — skipping initializeApp()", config);
    return null;
  }

  try {
    _fbApp = initializeApp(config);
    console.info("✅ Firebase initialized");
    return _fbApp;
  } catch (err) {
    console.error("🔥 Firebase initialization failed:", err);
    return null;
  }
}

function getAuthSafe(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    return firebaseGetAuth(app);
  } catch (err) {
    console.error("getAuth failed:", err);
    return null;
  }
}

/* ---------------------------- AuthPage Component ---------------------------- */
export default function AuthPage({ theme, onAuth, savedUser }: AuthPageProps) {
  const isDark = theme === "dark";

  const C = useMemo(
    () => ({
      bg: isDark ? "#000000" : "#f8fafc",
      card: isDark ? "#000000" : "#ffffff",
      text: isDark ? "#eaeaea" : "#0f172a",
      sub: isDark ? "#b4b4b4" : "#64748b",
      border: isDark ? "#1a1a1a" : "#e5e7eb",
      inputBg: isDark ? "#121212" : "#ffffff",
      inputBorder: isDark ? "#2a2a2a" : "#d1d5db",
      btn: "#2563eb",
      btnHover: "#1d4ed8",
      btnMuted: isDark ? "#1a1a1a" : "#f1f5f9",
    }),
    [isDark]
  );

  const [step, setStep] = useState<Step>("login");
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState(savedUser?.name || "");
  const [email, setEmail] = useState(savedUser?.email || "");
  const [password, setPassword] = useState(savedUser?.password || "");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const actionCodeSettings = {
    url: window.location.origin,
    handleCodeInApp: true,
  };

  /* ------------------------- Handle Magic Link Sign-in ------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    const auth = getAuthSafe();
    if (!auth) return;

    if (isSignInWithEmailLink(auth, href)) {
      (async () => {
        setLoading(true);
        try {
          let stored = window.localStorage.getItem("emailForSignIn") || "";
          if (!stored) stored = window.prompt("Confirm your email to finish sign-in") || "";
          if (!stored) return alert("Email required to finish sign-in.");
          const result = await signInWithEmailLink(auth, stored, href);
          const u = result.user;
          const displayName = u.displayName ?? u.email?.split("@")[0] ?? stored.split("@")[0];
          window.localStorage.removeItem("emailForSignIn");
          onAuth({ name: displayName, email: u.email ?? stored });
        } catch (err: any) {
          console.error("Error finishing sign-in:", err);
          alert(err?.message ?? "Failed to finish sign-in");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, []);

  /* ------------------------------- Handlers ------------------------------- */
  async function sendMagicLink(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email) return alert("Enter your email to receive the magic link");
    setLoading(true);
    try {
      const auth = getAuthSafe();
      if (!auth) throw new Error("Firebase not configured (auth missing).");
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      localStorage.setItem("emailForSignIn", email);
      alert("✅ Magic link sent! Check your email (including spam).");
    } catch (err: any) {
      console.error("sendSignInLinkToEmail error:", err);
      alert(err?.message ?? "Failed to send sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return alert("Enter email and password");
    setLoading(true);
    try {
      const auth = getAuthSafe();
      if (!auth) {
        onAuth({ name: name || email.split("@")[0], email, password });
        return;
      }
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const nameFromAuth = cred.user.displayName ?? email.split("@")[0];
        onAuth({ name: nameFromAuth, email, password });
      } catch (pwErr) {
        console.warn("Password login failed:", pwErr);
        if (confirm("Password login failed. Send magic link instead?")) await sendMagicLink();
      }
    } catch (err: any) {
      alert(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function startSignup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return alert("Enter your name");
    if (!email) return alert("Enter your email");
    setStep("otp");
  }

  function verifyAndSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return alert("Enter a 6-digit OTP");
    onAuth({ name, email, password });
  }

  /* ------------------------------- UI ------------------------------- */
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${C.inputBorder}`,
    background: C.inputBg,
    color: C.text,
    fontSize: 15,
  };

  const mainButtonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    background: C.btn,
    color: "#fff",
    fontWeight: 600,
    fontSize: 16,
    border: "none",
    cursor: "pointer",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    background: C.btnMuted,
    color: C.text,
    fontWeight: 600,
    fontSize: 15,
    border: `1px solid ${C.border}`,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.text,
        padding: 16,
      }}
    >
      <div
        style={{
          width: 520,
          background: C.card,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          padding: 28,
          boxShadow: isDark
            ? "0 0 30px rgba(255,255,255,0.02)"
            : "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img
            src={isDark ? logoDark : logoLight}
            alt="Logo"
            style={{
              width: 140,
              height: 140,
              marginBottom: 10,
              objectFit: "contain",
            }}
          />
          <h1>{step === "otp" ? "Verify Email" : isSignup ? "Sign Up" : "Sign In"}</h1>
          <p style={{ color: C.sub, marginTop: -5 }}>
            {step === "otp" ? "Check your inbox for OTP" : isSignup ? "Create a new account" : "Welcome back"}
          </p>
        </div>

        {step === "login" && !isSignup && (
          <form onSubmit={doLogin} style={{ display: "grid", gap: 14 }}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={mainButtonStyle} disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </button>
              <button type="button" onClick={sendMagicLink} style={secondaryButtonStyle} disabled={!email || loading}>
                Magic Link
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSignup(true);
                setStep("signup");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#60a5fa",
                cursor: "pointer",
                textDecoration: "underline",
                fontWeight: 500,
              }}
            >
              Create a new account
            </button>
          </form>
        )}

        {step === "signup" && (
          <form onSubmit={startSignup} style={{ display: "grid", gap: 14 }}>
            <input type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <button type="submit" style={mainButtonStyle}>
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignup(false);
                setStep("login");
              }}
              style={secondaryButtonStyle}
            >
              Back to login
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyAndSignup} style={{ display: "grid", gap: 14 }}>
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              style={inputStyle}
            />
            <button type="submit" style={mainButtonStyle}>
              Verify & Sign Up
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
