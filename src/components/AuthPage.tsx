// src/components/AuthPage.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  RecaptchaVerifier,
} from "firebase/auth";
import type { ConfirmationResult } from "firebase/auth";

import logoLight from "../assets/logo_light.png";
import logoDark from "../assets/logo_dark.png";

export type AppUser = {
  name: string;
  email: string;
  password?: string;
};

interface AuthPageProps {
  theme?: "light" | "dark";
  onAuth: (user: AppUser) => void;
  savedUser?: AppUser | null;
}

type Step = "login" | "signup" | "verifyPhone" | "verifyEmail";

export default function AuthPage({ theme = "light", onAuth, savedUser }: AuthPageProps) {
  const isDark = theme === "dark";

  // firebase auth instance
  const auth = getAuth();

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
  const [name, setName] = useState(savedUser?.name || "");
  const [email, setEmail] = useState(savedUser?.email || "");
  const [password, setPassword] = useState(savedUser?.password || "");
  const [phone, setPhone] = useState(""); // optional phone field
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);

  // Keep a useEffect that references confirmation so TS won't flag it as unused
  useEffect(() => {
    if (confirmation) {
      // no-op debug
      // eslint-disable-next-line no-console
      console.debug("confirmation set");
    }
  }, [confirmation]);

  // recaptcha container ref & id
  const recaptchaContainerId = "recaptcha-container";
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    // cleanup RecaptchaVerifier on unmount if available
    return () => {
      try {
        // @ts-ignore
        recaptchaRef.current?.clear?.();
        recaptchaRef.current = null;
      } catch {}
    };
  }, []);

  // ensure a single RecaptchaVerifier instance (invisible)
  function ensureRecaptcha() {
    if (typeof window === "undefined") return null;
    // reuse existing instance if present on window
    // @ts-ignore
    if ((window as any).__firebaseRecaptchaVerifier) {
      // @ts-ignore
      recaptchaRef.current = (window as any).__firebaseRecaptchaVerifier;
      return recaptchaRef.current;
    }

    // IMPORTANT: cast `auth` to any to avoid TS version/type overload mismatches.
    // At runtime this still passes the actual Auth object.
    const verifier = new RecaptchaVerifier(
      recaptchaContainerId,
      { size: "invisible" },
      auth as unknown as any
    );

    verifier.render().catch(() => {});
    recaptchaRef.current = verifier;
    // @ts-ignore
    (window as any).__firebaseRecaptchaVerifier = verifier;
    return verifier;
  }

  // -------------------------
  // Server email OTP endpoint helpers (your API)
  async function sendEmailOtpToServer(email: string) {
    const r = await fetch("/api/send-email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return r.json();
  }

  async function verifyEmailOtpOnServer(email: string, code: string) {
    const r = await fetch("/api/verify-email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    return r.json();
  }

  // Signup: send OTP to email (do NOT create Firebase account yet)
  async function handleSignupSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!name.trim() || !email || !password) return alert("Please fill name, email and password");
    if (loading) return;
    ensureRecaptcha(); // optional/no-op on SSR
    setLoading(true);
    try {
      const res = await sendEmailOtpToServer(email);
      if (!res.ok) throw new Error(res.error || "Failed to send OTP");
      setStep("verifyEmail");
      alert("OTP sent to your email. Enter code to finish sign up.");
    } catch (err: any) {
      console.error("sendEmailOtp error:", err);
      alert(err?.message ?? err?.error ?? "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  // Verify OTP on server then create Firebase account
  async function handleVerifyEmailOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return alert("Enter a 6-digit OTP");
    if (loading) return;
    setLoading(true);
    try {
      const res = await verifyEmailOtpOnServer(email, otp);
      if (!res.ok) throw new Error(res.error || "OTP invalid");
      // create Firebase account
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      onAuth({ name, email, password });
    } catch (err: any) {
      console.error("verifyEmailOtp error:", err);
      alert(err?.message ?? err?.error ?? "Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  }

  // wrapper handlers used by forms
  async function handleSignupSubmit(e?: React.FormEvent) {
    return handleSignupSendOtp(e);
  }
  async function handleConfirmOtp(e?: React.FormEvent) {
    return handleVerifyEmailOtp(e);
  }
  async function handleResendOtp() {
    return handleSignupSendOtp();
  }

  // Login
  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email || !password) return alert("Please enter email and password");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const nameFromAuth = cred.user.displayName ?? email.split("@")[0];
      onAuth({ name: nameFromAuth, email, password });
    } catch (err: any) {
      console.error("login error", err);
      alert(err?.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  // Forgot password
  async function handleForgotPassword() {
    if (!email) return alert("Enter your email to reset password");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent.");
    } catch (err: any) {
      console.error("forgot password error", err);
      alert(err?.message ?? "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  // Styles (inline for drop-in)
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${C.inputBorder}`,
    background: C.inputBg,
    color: C.text,
    outline: "none",
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

  // UI
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 980, display: "flex", gap: 20, padding: 20 }}>
        <div style={{ flex: 1, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: isDark ? "0 0 30px rgba(255,255,255,0.02)" : "0 10px 30px rgba(0,0,0,0.08)", padding: 28 }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <img src={isDark ? logoDark : logoLight} alt="Logo" draggable={false} style={{ width: isDark ? 110 : 150, height: isDark ? 110 : 150, objectFit: "contain", marginBottom: 12 }} />
            <h1 style={{ margin: 0, fontSize: 24, color: C.text }}>{step === "signup" ? "Create Account" : step === "verifyPhone" ? "Verify Phone" : "Sign In"}</h1>
            <div style={{ marginTop: 8, fontSize: 13, color: C.sub }}>{step === "signup" ? "Enter details and verify your phone" : step === "verifyPhone" ? "Enter the OTP sent to your phone" : "Sign in with your email and password"}</div>
          </div>

          {/* SIGN UP */}
          {step === "signup" && (
            <form onSubmit={handleSignupSubmit} style={{ display: "grid", gap: 12 }}>
              <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              <input placeholder="Phone (optional) e.g. +911234567890" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
              <button type="submit" style={mainButtonStyle} disabled={loading}>{loading ? "Creating..." : "Create account & Send OTP"}</button>
              <button type="button" onClick={() => setStep("login")} style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer" }} disabled={loading}>Back to login</button>
            </form>
          )}

          {/* VERIFY PHONE (OTP) */}
          {step === "verifyPhone" && (
            <form onSubmit={handleConfirmOtp} style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13, color: C.sub }}>We sent an OTP to <strong>{phone}</strong>. Enter it below.</div>
              <input placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={inputStyle} />
              <button type="submit" style={mainButtonStyle} disabled={loading}>{loading ? "Verifying..." : "Verify & Finish"}</button>
              <button type="button" onClick={handleResendOtp} style={secondaryButtonStyle} disabled={loading}>Resend OTP</button>
              <button type="button" onClick={async () => { if (loading) return; await signOut(auth); setStep("signup"); setConfirmation(null); }} style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer" }}>Cancel & Edit</button>
            </form>
          )}

          {/* VERIFY EMAIL (OTP) - same modal used when step === "verifyEmail" */}
          {step === "verifyEmail" && (
            <form onSubmit={handleConfirmOtp} style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13, color: C.sub }}>We sent an OTP to <strong>{email}</strong>. Enter it below.</div>
              <input placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={inputStyle} />
              <button type="submit" style={mainButtonStyle} disabled={loading}>{loading ? "Verifying..." : "Verify & Finish"}</button>
              <button type="button" onClick={handleResendOtp} style={secondaryButtonStyle} disabled={loading}>Resend OTP</button>
              <button type="button" onClick={() => setStep("signup")} style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer" }}>Cancel & Edit</button>
            </form>
          )}

          {/* LOGIN */}
          {step === "login" && (
            <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={{ ...mainButtonStyle, flex: 1 }} disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
                <button type="button" onClick={handleForgotPassword} style={{ ...secondaryButtonStyle, width: 160 }} disabled={loading}>Forgot password</button>
              </div>
              <button type="button" onClick={() => setStep("signup")} style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer" }} disabled={loading}>Create account</button>
            </form>
          )}

          {/* recaptcha container (invisible) */}
          <div id={recaptchaContainerId} style={{ marginTop: 8 }} />
        </div>

        {/* Right info column */}
        <div style={{ width: 320, background: C.card, padding: 16, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <h4 style={{ marginTop: 0, color: C.text }}>Why verify?</h4>
          <ul style={{ color: C.sub }}>
            <li>Prevent bot & spam accounts.</li>
            <li>Recover access if password lost.</li>
            <li>Stronger account security.</li>
          </ul>
          {savedUser && <div style={{ marginTop: 12 }}>
            <button onClick={() => onAuth(savedUser)} style={secondaryButtonStyle}>Continue as {savedUser.name}</button>
          </div>}
        </div>
      </div>
    </div>
  );
}
