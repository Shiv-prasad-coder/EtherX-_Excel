import { useEffect, useState } from "react";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { auth } from "../firebaseConfig";

type Props = { onSignedIn: (user: any) => void };

export default function EmailAuth({ onSignedIn }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  const actionCodeSettings = {
    url: `${window.location.origin}/`,
    handleCodeInApp: true,
  };

  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const storedEmail = localStorage.getItem("emailForSignIn");
      const finalEmail = storedEmail || prompt("Confirm your email:");
      if (!finalEmail) return;
      signInWithEmailLink(auth, finalEmail, window.location.href)
        .then((result) => {
          localStorage.removeItem("emailForSignIn");
          onSignedIn(result.user);
        })
        .catch((err) => setStatus(err.message));
    }
  }, []);

  const sendLink = async () => {
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      localStorage.setItem("emailForSignIn", email);
      setStatus("Check your inbox for a sign-in link!");
    } catch (e: any) {
      setStatus(e.message);
    }
  };

  return (
    <div style={{ maxWidth: 400 }}>
      <h3>Sign in via Email Link</h3>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ width: "100%", padding: 8, marginBottom: 10 }}
      />
      <button disabled={!email} onClick={sendLink} style={{ padding: 8 }}>
        Send OTP Link
      </button>
      {status && <p style={{ marginTop: 10 }}>{status}</p>}
    </div>
  );
}
