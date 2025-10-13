
// src/components/AuthPage.tsx
import { useMemo, useState } from "react";
import logoLight from "../assets/logo_light.png"; // white bg
import logoDark from "../assets/logo_dark.png";   // black bg

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
      card: isDark ? "#000000" : "#ffffff",        // full black in dark mode
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

  function startSignup(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email || !password) return alert("Please enter email and password");
    if (!name.trim()) return alert("Please enter your name");
    setStep("otp");
  }

  function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return alert("Please enter email and password");
    onAuth({ name: name || email.split("@")[0], email, password });
  }

  function verifyAndSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return alert("Enter a 6-digit OTP");
    onAuth({ name, email, password });
  }

  const Title = () => (
  <div style={{ textAlign: "center", marginTop: 6, marginBottom: 4 }}>
    <img
      src={isDark ? logoDark : logoLight}
      alt="Logo"
      draggable={false}
      style={{
        width: isDark ? 110 : 150,      // 🔥 Bigger logo for light mode
        height: isDark ? 110 : 150,     // proportional height
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
          boxShadow: isDark
            ? "0 0 30px rgba(255,255,255,0.02)"
            : "0 10px 30px rgba(0,0,0,0.08)",
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
            <button
              type="submit"
              style={mainButtonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.btnHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = C.btn)}
            >
              Login
            </button>
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
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
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
              autoComplete="new-password"
              style={inputStyle}
            />
            <button
              type="submit"
              style={mainButtonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.btnHover)}  // ✅ fixed
              onMouseLeave={(e) => (e.currentTarget.style.background = C.btn)}      // ✅ fixed
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
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              style={inputStyle}
            />
            <div style={{ fontSize: 13, color: C.sub }}>
              OTP sent to{" "}
              <span style={{ color: isDark ? "#e5e7eb" : "#111827" }}>{email}</span>
            </div>
            <button
              type="submit"
              style={{ ...mainButtonStyle, background: "#9ca3af", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#6b7280")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#9ca3af")}
            >
              Verify & Sign Up
            </button>
            <button type="button" onClick={() => setStep("signup")} style={secondaryButtonStyle}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
