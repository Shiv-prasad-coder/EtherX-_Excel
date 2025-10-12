// src/pages/finishSignIn.tsx
import { useEffect } from "react";
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { useNavigate } from "react-router-dom"; // or your router

export default function FinishSignIn() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      const auth = getAuth();
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem("emailForSignIn");
        if (!email) {
          // ask user to provide the email they used
          email = window.prompt("Please provide your email for confirmation") ?? undefined;
        }
        try {
          // perform sign-in; no need to store the return value here
          await signInWithEmailLink(auth, email!, window.location.href);
          window.localStorage.removeItem("emailForSignIn");
          navigate("/", { replace: true });
        } catch (err: any) {
          alert(err.message ?? "Failed to complete sign-in");
        }
      } else {
        navigate("/", { replace: true });
      }
    })();
  }, [navigate]);

  return <div style={{ padding: 24 }}>Completing sign-in... if nothing happens, check the console.</div>;
}
