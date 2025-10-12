// src/pages/finishSignIn.tsx
import { useEffect } from "react";
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function FinishSignIn() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const auth = getAuth();

      if (!isSignInWithEmailLink(auth, window.location.href)) {
        // Not an email link sign-in — go home
        navigate("/", { replace: true });
        return;
      }

      // email is string | null (localStorage returns string | null)
      let email: string | null = window.localStorage.getItem("emailForSignIn");

      if (!email) {
        // prompt returns string | null as well — keep the same union type
        const provided = window.prompt("Please provide the email you used to sign in");
        email = provided ?? null;
      }

      if (!email) {
        alert("Email is required to complete sign-in. Redirecting to home.");
        navigate("/", { replace: true });
        return;
      }

      try {
        // email is now guaranteed non-null, so assert with !
        await signInWithEmailLink(auth, email!, window.location.href);
        window.localStorage.removeItem("emailForSignIn");
        navigate("/", { replace: true });
      } catch (err: any) {
        alert(err?.message ?? "Failed to complete sign-in");
        navigate("/", { replace: true });
      }
    })();
  }, [navigate]);

  return <div style={{ padding: 24 }}>Completing sign-in... if nothing happens, check the console.</div>;
}
