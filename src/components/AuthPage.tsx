// src/components/AuthPage.tsx
import React, { useMemo, useState } from "react";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { initializeApp } from "firebase/app";
import emailjs from "emailjs-com";

import logoLight from "../assets/logo_light.png";
import logoDark from "../assets/logo_dark.png";

/* ----------------- Firebase Init ----------------- */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/* ----------------- Component ----------------- */
interface AuthPageProps {
  theme: "light" | "dark";
  onAuth: (user: { name: string; email: string }) => void;
}

type Step = "login" | "signup" | "verify";

export default function AuthPage({ theme, onAuth }: AuthPageProps) {
  const isDark = theme === "dark";
  const C = useMemo(
    () => ({
      bg: isDark ? "#000" : "#f8fafc",
      card: isDark ? "#000" : "#fff",
      text: isDark ? "#eaeaea" : "#0f172a",
      sub: isDark ? "#b4b4b4" : "#64748b",
      border: isDark ? "#1a1a1a" : "#e5e7eb",
      inputBg: isDark ? "#121212" : "#ffffff",
      inputBorder: isDark ? "#2a2a2a" : "#d1d5db",
      btn: "#2563eb",
      btnHover: "#1d4ed8",
    }),
    [isDark]
  );

  /* ----------------- State ----------------- */
  const [step, setStep] = useState<Step>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sentOtp, setSentOtp] = useState("");
  const [loading, setLoading] = useState(false);

  /* ----------------- Helpers ----------------- */
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${C.inputBorder}`,
    background: C.inputBg,
    color: C.text,
    fontSize: 15,
  };
  const btn: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    background: C.btn,
    color: "#fff",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
  };

  /* ----------------- Actions ----------------- */
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) return alert("Fill all fields");

    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    setSentOtp(generated);
    setLoading(true);

    try {
      console.log("EmailJS payload being sent:", {
  to_name: email.split("@")[0],
  to_email: email,
  otp_code: otp,
});

      await emailjs.send(
  import.meta.env.VITE_EMAILJS_SERVICE_ID,
  import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
  {
    to_name: name,
    to_email: email,
    otp_code: generated,  // ✅ match the template variable
  },
  import.meta.env.VITE_EMAILJS_PUBLIC_KEY
);

      alert("OTP sent to your email!");
      setStep("verify");
    } catch (err) {
      console.error("EmailJS error:", err);
      alert("Failed to send OTP email");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp !== sentOtp) return alert("Incorrect OTP");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      alert("Account created successfully!");
      onAuth({ name, email: cred.user.email! });
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return alert("Enter credentials");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      onAuth({ name: cred.user.displayName ?? email.split("@")[0], email });
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  /* ----------------- UI ----------------- */
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 460, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 30 }}>
        <div style={{ textAlign: "center" }}>
          <img src={isDark ? logoDark : logoLight} alt="Logo" style={{ width: 120, height: 120 }} />
          <h1 style={{ color: C.text }}>{step === "verify" ? "Verify OTP" : step === "signup" ? "Create Account" : "Login"}</h1>
        </div>

        {step === "login" && (
          <form onSubmit={handleLogin} style={{ display: "grid", gap: 14, marginTop: 20 }}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            <button type="submit" style={btn} disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
            <button
              type="button"
              onClick={() => setStep("signup")}
              style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer" }}
            >
              Create a new account
            </button>
          </form>
        )}

        {step === "signup" && (
          <form onSubmit={handleSendOtp} style={{ display: "grid", gap: 14, marginTop: 20 }}>
            <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            <button type="submit" style={btn} disabled={loading}>
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
            <button
              type="button"
              onClick={() => setStep("login")}
              style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer" }}
            >
              Back to login
            </button>
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={handleVerifyOtp} style={{ display: "grid", gap: 14, marginTop: 20 }}>
            <input type="text" placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} style={inputStyle} maxLength={6} />
            <button type="submit" style={btn} disabled={loading}>
              {loading ? "Verifying..." : "Verify & Create Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
