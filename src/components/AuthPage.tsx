// src/components/AuthPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  getAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  // keep existing auth flows (if using password login later)
  signInWithEmailAndPassword,
} from "firebase/auth";

import logoLight from "../assets/logo_light.png"; // white bg
import logoDark from "../assets/logo_dark.png"; // black bg

interface AuthPageProps {
  theme: "light" | "dark";
  onAuth: (user: { name: string; email: string; password?: string }) => void;
  savedUser?: { name: string; email: string; password?: string } | null;
}

type Step = "login" | "signup" | "otp";

export default function AuthPage({ theme, onAuth, savedUser }: AuthPageProps) {
  const isDark = theme === "dark";

  const C = useMemo(
    () => ({
      bg: isDark ? "#000000" : "#f8fafc",
      card: isDark ? "#000000" : "#ffffff", // full black in dark mode
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

  // form state
  const [name, setName] = useState(savedUser?.name || "");
  const [email, setEmail] = useState(savedUser?.email || "");
  const [password, setPassword] = useState(savedUser?.password || "");
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);

  // Firebase actionCodeSettings for magic link
  const actionCodeSettings = {
    // will redirect back to same origin and component mount will finish sign-in
    url: `${typeof window !== "undefined" ? window.location.origin : ""}`,
    handleCodeInApp: true,
  };

  // On mount: if app opened via Firebase email link, finish sign-in here
  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = getAuth();
    const href = window.location.href;
    if (isSignInWithEmailLink(auth, href)) {
      (async () => {
        setLoading(true);
        try {
          // Prefer email stored earlier; otherwise prompt user to confirm
          let stored = window.localStorage.getItem("emailForSignIn") || "";
          if (!stored) {
            // don't block — prompt user to input the same email they used earlier
            stored = window.prompt("Please confirm your email to finish sign-in") || "";
          }
          if (!stored) {
            alert("Email is required to finish sign-in.");
            setLoading(false);
            return;
          }

          const result = await signInWithEmailLink(auth, stored, href);
          // sign-in succeeded: call onAuth with basic info
          const u = result.user;
          const displayName = u.displayName ?? (u.email ? u.email.split("@")[0] : stored.split("@")[0]);
          // cleanup saved email
          try {
            window.localStorage.removeItem("emailForSignIn");
          } catch {}
          onAuth({ name: displayName, email: u.email ?? stored });
        } catch (err: any) {
          console.error("Error finishing sign-in with link:", err);
          alert(err?.message ?? "Failed to finish sign-in");
        } finally {
          setLoading(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Handlers ----------
  async function sendMagicLink(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email) return alert("Enter your email to receive the magic link");
    setLoading(true);
    try {
      const auth = getAuth();
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // store email so we can finish sign-in on same device
      try {
        window.localStorage.setItem("emailForSignIn", email);
      } catch (e) {
        // ignore storage errors
      }
      alert("Magic sign-in link sent. Check your email (spam folder too).");
    } catch (err: any) {
      console.error("sendSignInLinkToEmail error:", err);
      alert(err?.message ?? "Failed to send sign-in link");
    } finally {
      setLoading(false);
    }
  }

  function startSignup(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email || !password) return alert("Please enter email and password");
    if (!name.trim()) return alert("Please enter your name");
    setStep("otp");
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return alert("Please enter email and password");

    setLoading(true);
    try {
      const auth = getAuth();
      // Try password sign-in (existing behavior); if you don't use password sign-in, you can instead call sendMagicLink
      // If you want to rely on magic link only, remove the block below and call sendMagicLink()
      try {
        // attempt sign in with password if user exists
        // we import signInWithEmailAndPassword above; if you don't want password auth, remove this
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const nameFromAuth = cred.user.displayName ?? email.split("@")[0];
        onAuth({ name: nameFromAuth, email, password });
      } catch (pwErr) {
        // fallback: if password login fails, offer to send magic link instead
        console.warn("Password login failed, offering magic link:", pwErr);
        if (confirm("Password login failed. Send a magic sign-in link to your email instead?")) {
          await sendMagicLink();
        }
      }
    } catch (err: any) {
      console.error("Login error", err);
      alert(err?.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  function verifyAndSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return alert("Enter a 6-digit OTP");
    onAuth({ name, email, password });
  }

  // ---------- UI helpers ----------
  const Title = () => (
    <div style={{ textAlign: "center", marginTop: 6, marginBottom: 4 }}>
      <img
        src={isDark ? logoDark : logoLight}
        alt="Logo"
        draggable={false}
        style={{
          width: isDark ? 110 : 150,
          height: isDark ? 110 : 150,
          objectFit: "contain",
          marginBottom: 16,
          display: "block",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      />
      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 700,
          color: C.text,
          letterSpacing: 0.2,
        }}
      >
        {step === "otp" ? "Create Account" : isSignup ? "Create Account" : "Sign In"}
      </h1>
      <div style={{ marginTop: 8, fontSize: 15, color: C.sub }}>
        {step === "otp" ? "Join today" : isSignup ? "Join today" : "Welcome back"}
      </div>
    </div>
  );

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
    transition: "background .2s ease",
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
          boxShadow: isDark ? "0 0 30px rgba(255,255,255,0.02)" : "0 10px 30px rgba(0,0,0,0.08)",
          padding: 28,
        }}
      >
        <Title />

        {/* LOGIN */}
        {step === "login" && !isSignup && (
          <form onSubmit={doLogin} style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                style={{ ...mainButtonStyle, flex: 1 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.btnHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = C.btn)}
                disabled={loading}
              >
                {loading ? "Signing in..." : "Login"}
              </button>

              {/* Magic link button */}
              <button
                type="button"
                onClick={sendMagicLink}
                style={{
                  ...secondaryButtonStyle,
                  width: 160,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                disabled={!email || loading}
                title="Send a sign-in link to your email"
              >
                Send magic link
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
                marginTop: 2,
              }}
            >
              Create a new account
            </button>
          </form>
        )}

        {/* SIGNUP */}
        {step === "signup" && (
          <form onSubmit={startSignup} style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={inputStyle} />
            <button
              type="submit"
              style={mainButtonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.btnHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = C.btn)}
              disabled={loading}
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignup(false);
                setStep("login");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#60a5fa",
                cursor: "pointer",
                textDecoration: "underline",
                fontWeight: 500,
                marginTop: 2,
              }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {/* OTP */}
        {step === "otp" && (
          <form onSubmit={verifyAndSignup} style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <label style={{ fontSize: 14, color: C.text }}>Enter OTP</label>
            <input inputMode="numeric" maxLength={6} placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} style={inputStyle} />
            <div style={{ fontSize: 13, color: C.sub }}>
              OTP sent to <span style={{ color: isDark ? "#e5e7eb" : "#111827" }}>{email}</span>
            </div>
            <button
              type="submit"
              style={{ ...mainButtonStyle, background: "#9ca3af", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#6b7280")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#9ca3af")}
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify & Sign Up"}
            </button>
            <button type="button" onClick={() => setStep("signup")} style={secondaryButtonStyle} disabled={loading}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
