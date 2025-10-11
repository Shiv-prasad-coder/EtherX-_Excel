// src/components/AuthPage.tsx

import PhoneAuth from "./PhoneAuth";

/** Local app user shape (rename so it doesn't clash with firebase.User) */
export type AppUser = {
  name: string;
  email: string;
  password?: string;
};

type Props = {
  theme?: "light" | "dark";
  onAuth: (u: AppUser) => void;
  savedUser?: AppUser | null;
};

export default function AuthPage({ theme, onAuth, savedUser }: Props) {
  // If savedUser exists, show quick continue button
  const continueAsSaved = () => {
    if (!savedUser) return;
    onAuth(savedUser);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme === "dark" ? "#0b1220" : "#f3f4f6",
      }}
    >
      <div style={{ width: "100%", maxWidth: 980, padding: 20 }}>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0 }}>Welcome</h1>
            <p style={{ color: "#6b7280" }}>Sign in to access your spreadsheets.</p>

            {savedUser && (
              <div style={{ marginBottom: 12 }}>
                <button onClick={continueAsSaved} style={{ padding: "8px 12px", marginRight: 8 }}>
                  Continue as {savedUser.name}
                </button>
              </div>
            )}

            <div style={{ borderRadius: 8, overflow: "hidden" }}>
              <PhoneAuth
                onSignedIn={(fbUser: any) => {
                  if (!fbUser) return;
                  // Map firebase user fields to your app user shape.
                  const u: AppUser = {
                    name: fbUser.displayName ?? fbUser.phoneNumber ?? "User",
                    email: fbUser.email ?? "", // phone-only users may not have email
                  };
                  onAuth(u);
                }}
                // optional: defaultPhone="+911234567890"
              />
            </div>
          </div>

          <div style={{ width: 360, background: "#fff", padding: 16, borderRadius: 8 }}>
            <h4 style={{ marginTop: 0 }}>Why sign in?</h4>
            <ul style={{ paddingLeft: 18 }}>
              <li>Save sheets to the cloud.</li>
              <li>Access from multiple devices.</li>
              <li>Enable real-time collaboration (setup later).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
