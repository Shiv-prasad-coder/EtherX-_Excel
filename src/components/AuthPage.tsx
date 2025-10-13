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

/**
 * Client-only Firebase initialization helper (no new files).
 * This safely initializes Firebase only if running in browser and env vars exist.
 */
let _fbApp: FirebaseApp | null = null;
function getFirebaseConfigFromEnv(): Record<string, string | undefined> {
  // support CRA (REACT_APP_), Next.js (NEXT_PUBLIC_), Vite (VITE_)
  const prefixes = ["REACT_APP_", "NEXT_PUBLIC_", "VITE_"];
  const keys = ["FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID", "FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_STORAGE_BUCKET"];
  const found: Record<string, string | undefined> = {};
  for (const k of keys) {
    for (const p of prefixes) {
      const value = (process.env as any)[p + k];
      if (value) {
        found[k.toLowerCase()] = value;
        break;
      }
    }
    // if not found, keep undefined
    if (!(k.toLowerCase() in found)) found[k.toLowerCase()] = undefined;
  }
  return found;
}

function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null; // server: don't init
  if (_fbApp) return _fbApp;

  const cfgParts = getFirebaseConfigFromEnv();
  const apiKey = cfgParts["firebase_api_key".replace("firebase_", "")] ?? cfgParts["api_key"] ?? cfgParts["api_key"]; // defensive but we will instead map explicitly below

  // Build config more reliably:
  const config = {
    apiKey:
      (process.env.REACT_APP_FIREBASE_API_KEY as string | undefined) ??
      (process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string | undefined) ??
      (process.env.VITE_FIREBASE_API_KEY as string | undefined) ??
      (process.env.REACT_APP_FIREBASE_APIKEY as string | undefined) ??
      undefined,
    authDomain:
      (process.env.REACT_APP_FIREBASE_AUTH_DOMAIN as string | undefined) ??
      (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string | undefined) ??
      (process.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ??
      undefined,
    projectId:
      (process.env.REACT_APP_FIREBASE_PROJECT_ID as string | undefined) ??
      (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string | undefined) ??
      (process.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ??
      undefined,
    storageBucket:
      (process.env.REACT_APP_FIREBASE_STORAGE_BUCKET as string | undefined) ??
      (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined) ??
      (process.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ??
      undefined,
    messagingSenderId:
      (process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ??
      (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ??
      (process.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ??
      undefined,
    appId:
      (process.env.REACT_APP_FIREBASE_APP_ID as string | undefined) ??
      (process.env.NEXT_PUBLIC_FIREBASE_APP_ID as string | undefined) ??
      (process.env.VITE_FIREBASE_APP_ID as string | undefined) ??
      undefined,
  };

  // Minimal guard: require apiKey and projectId (adjust if you want less strict)
  if (!config.apiKey || !config.projectId) {
    // helpful debug: prints at runtime in browser console
    // eslint-disable-next-line no-console
    console.warn("Firebase config missing or incomplete. Skipping initializeApp().", {
      apiKey: !!config.apiKey,
      projectId: !!config.projectId,
      // Do not print actual keys in prod logs
    });
    return null;
  }

  try {
    _fbApp = initializeApp(config);
    // eslint-disable-next-line no-console
    console.info("Firebase initialized (client).");
    return _fbApp;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to initialize Firebase:", err);
    return null;
  }
}

function getAuthSafe(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    return firebaseGetAuth(app);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("getAuth failed:", err);
    return null;
  }
}

/* ----------------- Component ----------------- */

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
    url: typeof window !== "undefined" ? window.location.origin : undefined,
    handleCodeInApp: true,
  };

  // On mount: finish sign-in if opened from email link
  useEffect(() => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    const auth = getAuthSafe();
    if (!auth) {
      // firebase not configured — nothing to do
      return;
    }

    if (isSignInWithEmailLink(auth, href)) {
      (async () => {
        setLoading(true);
        try {
          let stored = "";
          try {
            stored = window.localStorage.getItem("emailForSignIn") || "";
          } catch (e) {
            stored = "";
          }
          if (!stored) {
            stored = window.prompt("Please confirm your email to finish sign-in") || "";
          }
          if (!stored) {
            alert("Email required to finish sign-in.");
            setLoading(false);
            return;
          }
          const result = await signInWithEmailLink(auth, stored, href);
          const u = result.user;
          const displayName = u.displayName ?? (u.email ? u.email.split("@")[0] : stored.split("@")[0]);
          try {
            window.localStorage.removeItem("emailForSignIn");
          } catch {}
          onAuth({ name: displayName, email: u.email ?? stored });
        } catch (err: any) {
          console.error("Error finishing sign-in with link:", err);
          alert(err?.message ?? "Failed to finish sign-in with link.");
        } finally {
          setLoading(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- handlers ----------

  async function sendMagicLink(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email) return alert("Enter your email to receive the magic link");
    setLoading(true);
    try {
      const auth = getAuthSafe();
      if (!auth) throw new Error("Firebase not configured (auth missing).");
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      try {
        window.localStorage.setItem("emailForSignIn", email);
      } catch {}
      alert("Magic sign-in link sent. Check your email (spam too).");
    } catch (err: any) {
      console.error("sendSignInLinkToEmail error:", err);
      alert(err?.message ?? "Failed to send sign-in link. Check console.");
    } finally {
      setLoading(false);
    }
  }

  function startSignup(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email || !password) return alert("Enter email and password");
    if (!name.trim()) return alert("Enter your name");
    setStep("otp");
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return alert("Enter email and password");
    setLoading(true);
    try {
      const auth = getAuthSafe();
      if (!auth) {
        // If Firebase not configured, fallback to app-local onAuth() with simple behavior:
        // (use this only if you intentionally want a no-Firebase fallback)
        onAuth({ name: name || email.split("@")[0], email, password });
        setLoading(false);
        return;
      }
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const nameFromAuth = cred.user.displayName ?? email.split("@")[0];
        onAuth({ name: nameFromAuth, email, password });
      } catch (pwErr) {
        console.warn("Password login failed:", pwErr);
        if (confirm("Password login failed. Send a magic sign-in link to your email instead?")) {
          await sendMagicLink();
        }
      }
    } catch (err: any) {
      console.error("Login error:", err);
      alert(err?.message ?? "Login failed. See console.");
    } finally {
      setLoading(false);
    }
  }

  function verifyAndSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return alert("Enter a 6-digit OTP");
    // Note: OTP flow not backed by Firebase here; placeholder for your own OTP service.
    // Proceed to local create user behavior (persist in localStorage via parent onAuth)
    onAuth({ name, email, password });
  }

  /* ----------------- UI ----------------- */

  const Title = () => (
    <div style={{ textAlign: "center", marginTop: 6, marginBottom: 4 }}>
      <img src={isDark ? logoDark : logoLight} alt="Logo" draggable={false} style={{ width: isDark ? 110 : 150, height: isDark ? 110 : 150, objectFit: "contain", marginBottom: 16, display: "block", marginLeft: "auto", marginRight: "auto" }} />
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>
        {step === "otp" ? "Create Account" : isSignup ? "Create Account" : "Sign In"}
      </h1>
      <div style={{ marginTop: 8, fontSize: 15, color: C.sub }}>{step === "otp" ? "Join today" : isSignup ? "Join today" : "Welcome back"}</div>
    </div>
  );

  const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.inputBorder}`, background: C.inputBg, color: C.text, outline: "none", fontSize: 15 };
  const mainButtonStyle: React.CSSProperties = { width: "100%", padding: "12px", borderRadius: 10, background: C.btn, color: "#fff", fontWeight: 600, fontSize: 16, border: "none", cursor: "pointer", transition: "background .2s ease" };
  const secondaryButtonStyle: React.CSSProperties = { width: "100%", padding: "12px", borderRadius: 10, background: C.btnMuted, color: C.text, fontWeight: 600, fontSize: 15, border: `1px solid ${C.border}`, cursor: "pointer" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, padding: 16 }}>
      <div style={{ width: 520, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: isDark ? "0 0 30px rgba(255,255,255,0.02)" : "0 10px 30px rgba(0,0,0,0.08)", padding: 28 }}>
        <Title />
        {step === "login" && !isSignup && (
          <form onSubmit={doLogin} style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={{ ...mainButtonStyle, flex: 1 }} onMouseEnter={(e) => (e.currentTarget.style.background = C.btnHover)} onMouseLeave={(e) => (e.currentTarget.style.background = C.btn)} disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </button>
              <button type="button" onClick={sendMagicLink} style={{ ...secondaryButtonStyle, width: 160, display: "inline-flex", alignItems: "center", justifyContent: "center" }} disabled={!email || loading} title="Send a sign-in link to your email">
                Send magic link
              </button>
            </div>
            <button type="button" onClick={() => { setIsSignup(true); setStep("signup"); }} style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer", textDecoration: "underline", fontWeight: 500, marginTop: 2 }}>
              Create a new account
            </button>
          </form>
        )}

        {step === "signup" && (
          <form onSubmit={startSignup} style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={inputStyle} />
            <button type="submit" style={mainButtonStyle} onMouseEnter={(e) => (e.currentTarget.style.background = C.btnHover)} onMouseLeave={(e) => (e.currentTarget.style.background = C.btn)} disabled={loading}>
              Continue
            </button>
            <button type="button" onClick={() => { setIsSignup(false); setStep("login"); }} style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer", textDecoration: "underline", fontWeight: 500, marginTop: 2 }}>
              Back to sign in
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyAndSignup} style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <label style={{ fontSize: 14, color: C.text }}>Enter OTP</label>
            <input inputMode="numeric" maxLength={6} placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} style={inputStyle} />
            <div style={{ fontSize: 13, color: C.sub }}>OTP sent to <span style={{ color: isDark ? "#e5e7eb" : "#111827" }}>{email}</span></div>
            <button type="submit" style={{ ...mainButtonStyle, background: "#9ca3af", cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#6b7280")} onMouseLeave={(e) => (e.currentTarget.style.background = "#9ca3af")} disabled={loading}>
              {loading ? "Verifying..." : "Verify & Sign Up"}
            </button>
            <button type="button" onClick={() => setStep("signup")} style={secondaryButtonStyle} disabled={loading}>Back</button>
          </form>
        )}
      </div>
    </div>
  );
}
