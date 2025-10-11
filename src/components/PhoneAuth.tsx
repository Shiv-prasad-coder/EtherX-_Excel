// src/components/PhoneAuth.tsx
import { useEffect, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { auth } from "../firebaseConfig"; // ensure this export exists

type Props = {
  onSignedIn: (user: User | null) => void;
  defaultPhone?: string;
};

export default function PhoneAuth({ onSignedIn, defaultPhone = "" }: Props) {
  const [phone, setPhone] = useState(defaultPhone);
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = recaptchaRef.current;
    if (!container) return;

    // Prevent double-initialization during HMR/dev
    if ((window as any).__recaptcha_initialized) return;
    (window as any).__recaptcha_initialized = true;

    try {
      // YOUR ENVIRONMENT expects (auth, container, params)
      (window as any).recaptchaVerifier = new RecaptchaVerifier(
        auth,
        container,
        { size: "invisible" }
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Failed to init reCAPTCHA:", e);
    }

    return () => {
      try {
        const rv = (window as any).recaptchaVerifier as RecaptchaVerifier | undefined;
        if (rv && typeof rv.clear === "function") rv.clear();
        (window as any).__recaptcha_initialized = false;
        (window as any).recaptchaVerifier = undefined;
      } catch {}
    };
  }, []);

  const sendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const verifier: RecaptchaVerifier | undefined = (window as any).recaptchaVerifier;
      if (!verifier) {
        setError("reCAPTCHA not ready - reload the page.");
        setLoading(false);
        return;
      }
      const confirmed = await signInWithPhoneNumber(auth, phone, verifier);
      setConfirmation(confirmed);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!confirmation) throw new Error("No confirmation available");
      const result = await confirmation.confirm(otp);
      onSignedIn(result.user);
    } catch (err: any) {
      setError(err?.message ?? "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "48px auto",
        padding: 18,
        borderRadius: 10,
        boxShadow: "0 6px 30px rgba(0,0,0,0.08)",
        background: "#fff",
      }}
    >
      <h3 style={{ marginTop: 0 }}>Sign in with Phone (OTP)</h3>

      {/* reCAPTCHA container */}
      <div ref={recaptchaRef} />

      {!confirmation ? (
        <>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Phone number</label>
          <input
            type="tel"
            placeholder="+911234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={sendOtp} disabled={!phone || loading} style={{ flex: 1, padding: 10 }}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            OTP sent to <strong>{phone}</strong>
          </p>
          <input
            type="text"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={verifyOtp} disabled={!otp || loading} style={{ flex: 1, padding: 10 }}>
              {loading ? "Verifying…" : "Verify OTP"}
            </button>
            <button onClick={() => setConfirmation(null)} style={{ padding: 10 }}>
              Resend
            </button>
          </div>
        </>
      )}

      {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}

      <div style={{ marginTop: 14, fontSize: 13, color: "#666" }}>
        For local testing add a Firebase test phone (Console → Auth → Sign-in method → Phone → Phone numbers for testing).
      </div>
    </div>
  );
}
