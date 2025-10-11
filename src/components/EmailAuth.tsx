// src/components/EmailAuth.tsx
import { useState, useEffect } from "react";


import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { auth } from "../firebaseConfig"; // ensure you export `auth` from firebaseConfig

type Props = {
  onSignedIn: (fbUser: any | null) => void; // firebase.User
  actionUrl?: string; // optional override for the actionCodeSettings.url
};

export default function EmailAuth({ onSignedIn, actionUrl }: Props) {
  const [email, setEmail] = useState<string>(() => localStorage.getItem("emailForSignIn") || "");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default action URL = current origin (works for local and production if you don't hardcode)
  const url = actionUrl ?? `${window.location.origin}/`;

  useEffect(() => {
    // If this page was opened by clicking the sign-in link, complete sign-in.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const storedEmail = localStorage.getItem("emailForSignIn") || "";
      if (!storedEmail) {
        // Ask user to type email (simple fallback)
        const ask = window.prompt("Enter the email you used to sign in");
        if (ask) {
          completeSignIn(ask);
        }
      } else {
        completeSignIn(storedEmail);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function completeSignIn(emailForSignIn: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithEmailLink(auth, emailForSignIn, window.location.href);
      localStorage.removeItem("emailForSignIn");
      setMessage("Sign-in successful!");
      onSignedIn(result.user);
    } catch (err: any) {
      console.error("completeSignIn error", err);
      setError(err?.message ?? "Failed to complete sign-in.");
    } finally {
      setLoading(false);
    }
  }

  async function sendLink() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const actionCodeSettings = {
  url: "https://ether-x-excel-eisk-p709hxm8l-shivam-prasads-projects.vercel.app/",
  handleCodeInApp: true,
};
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Save email to localStorage so we can complete sign-in when the user returns.
      localStorage.setItem("emailForSignIn", email);
      setMessage(`A sign-in link was sent to ${email}. Check your inbox.`);
    } catch (err: any) {
      console.error("sendSignInLinkToEmail error", err);
      setError(err?.message ?? "Failed to send sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      maxWidth: 420,
      margin: "24px auto",
      padding: 18,
      borderRadius: 10,
      boxShadow: "0 6px 30px rgba(0,0,0,0.08)",
      background: "#fff"
    }}>
      <h3 style={{ marginTop: 0 }}>Sign in with Email (magic link)</h3>

      <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Email</label>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 12 }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={sendLink} disabled={!email || loading} style={{ flex: 1, padding: 10 }}>
          {loading ? "Sending…" : "Send sign-in link"}
        </button>
        <button onClick={() => { setEmail(""); setError(null); setMessage(null); }} style={{ padding: 10 }}>
          Clear
        </button>
      </div>

      {message && <div style={{ color: "green", marginTop: 12 }}>{message}</div>}
      {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}

      <div style={{ marginTop: 14, fontSize: 13, color: "#666" }}>
        Tip: For local testing add a Firebase test email or use a real mailbox. The sign-in link opens the app and completes sign-in.
      </div>
    </div>
  );
}
