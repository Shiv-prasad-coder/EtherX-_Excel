// src/components/AuthPage.tsx
import { useMemo, useState, useRef, useEffect } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";
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

type Step = "login" | "signup" | "verifyPhone";

export default function AuthPage({ theme = "light", onAuth, savedUser }: AuthPageProps) {
  const isDark = theme === "dark";
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
  const [phone, setPhone] = useState(""); // E.164 recommended: +911234567890
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);

  // recaptcha container ref
  const recaptchaContainerId = "recaptcha-container";
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    // cleanup when component unmounts
    return () => {
      try {
        // @ts-ignore
        if (recaptchaRef.current) {
          // RecaptchaVerifier doesn't have .clear() in type defs, but it does have clear in some builds.
          // Best-effort cleanup:
          // @ts-ignore
          recaptchaRef.current.clear?.();
          recaptchaRef.current = null;
        }
      } catch (e) {
        // ignore
      }
    };
  }, []);

  function ensureRecaptcha() {
    if (typeof window === "undefined") return null;
    // cache on window to avoid re-rendering multiple instances
    // @ts-ignore
    if ((window as any).__firebaseRecaptchaVerifier) {
      // @ts-ignore
      recaptchaRef.current = (window as any).__firebaseRecaptchaVerifier;
      return recaptchaRef.current;
    }
    // create invisible recaptcha
    const verifier = new RecaptchaVerifier(
      recaptchaContainerId,
      { size: "invisible" },
      auth
    );
    // render returns a promise but we don't strictly need to await render here
    verifier.render().catch(() => {});
    recaptchaRef.current = verifier;
    // @ts-ignore
    (window as any).__firebaseRecaptchaVerifier = verifier;
    return verifier;
  }

  // -------------------------
  // SIGNUP flow (email+password -> link phone -> complete)
  // -------------------------
  async function handleSignupSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!name.trim() || !email || !password || !phone) {
      return alert("Please fill name, email, password and phone number (for OTP).");
    }
    if (loading) return;
    setLoading(true);

    try {
      // Create email/password user — this signs the user in immediately
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Prepare reCAPTCHA and link phone to the currently-signed-in user
      const verifier = ensureRecaptcha();
      if (!verifier) throw new Error("reCAPTCHA unavailable");

      // linkWithPhoneNumber will send SMS to the phone and return a ConfirmationResult
      const confirmationResult = await linkWithPhoneNumber(cred.user, phone, verifier);
      setConfirmation(confirmationResult);
      // advance to OTP verification step
      setStep("verifyPhone");
    } catch (err: any) {
      console.error("Signup error:", err?.code, err?.message || err);
      // If account was partially created and you want to clean it up, you could delete via Admin SDK server-side.
      alert(err?.message ?? "Signup failed");
      // if something went wrong after user was created and is signed in, sign them out to avoid partial states
      try {
        await signOut(auth);
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!/^\d{4,8}$/.test(otp)) return alert("Enter the OTP you received");
    if (!confirmation) return alert("No OTP request in progress");
    if (loading) return;
    setLoading(true);
    try {
      // Confirm the SMS code and link phone credential (confirmationResult.confirm will finish linking)
      await confirmation.confirm(otp);

      // Set displayName for nice UX
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
      }

      // Completed — call onAuth with app user shape
      onAuth({ name, email, password });
    } catch (err: any) {
      console.error("OTP confirm error:", err?.code, err?.message || err);
      alert(err?.message ?? "Failed to confirm OTP");
      // optional: on repeated failures you may want to sign out and cleanup
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (!phone) return alert("Phone is empty");
    if (loading) return;
    setLoading(true);
    try {
      const verifier = ensureRecaptcha();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No signed-in user to link phone to");
      const confirmationResult = await linkWithPhoneNumber(currentUser, phone, verifier as RecaptchaVerifier);
      setConfirmation(confirmationResult);
      alert("OTP resent");
    } catch (err: any) {
      console.error("resend OTP error:", err?.code, err?.message || err);
      alert(err?.message ?? "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------
  // LOGIN flow (email+password) + forgot password
  // -------------------------
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return alert("Enter email and password");
    if (loading) return;
    setLoading(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      onAuth({ name: user.displayName ?? email.split("@")[0], email });
    } catch (err: any) {
      console.error("login error:", err?.code, err?.message || err);
      if (err?.code === "auth/wrong-password" || err?.code === "auth/user-not-found") {
        alert("Invalid email or password.");
      } else {
        alert(err?.message ?? "Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) return alert("Enter your email to reset password");
    if (loading) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      console.error("forgot password error:", err?.code, err?.message || err);
      alert(err?.message ?? "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  // Styles (kept small, inline for drop-in)
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

  // UI: unified card
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
              <input placeholder="Phone (E.164) e.g. +911234567890" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
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
              <button type="button" onClick={async () => { /* cancel signup: sign out & go back */ if (loading) return; await signOut(auth); setStep("signup"); setConfirmation(null); }} style={{ background: "transparent", border: "none", color: "#60a5fa", cursor: "pointer" }}>Cancel & Edit</button>
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
          <h4 style={{ marginTop: 0, color: C.text }}>Why verify phone?</h4>
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
