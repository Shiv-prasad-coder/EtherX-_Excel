// src/App.tsx
import { useEffect, useState,  } from "react";
import Sheet from "./components/Sheet";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import SplashScreen from "./components/SplashScreen";

type SheetMeta = {
  id: string;
  name: string;
  rows: number;
  cols: number;
  storageKey: string;
};
type CellData = {
  value?: any;
  raw?: string;
  bold?: boolean;
  formula?: string;
};

type TemplateDef = {
  name: string;
  rows?: number;
  cols?: number;
  cells: Record<string, CellData>;
};
// produce a short safe suffix from user (email or name)
function userSuffix(u: { email?: string; name?: string } | null) {
  if (!u) return "guest";
  const id = (u.email || u.name || "user").toLowerCase();
  // replace problematic chars (colon, slash, spaces, @, .) with '_'
  return id.replace(/[^a-z0-9]/g, "_");
}

function workbookKeyFor(user: { email?: string; name?: string } | null) {
  return `excel-clone:workbook-meta:${userSuffix(user)}`;
}

const THEME_KEY = "excel-clone:theme";
const USER_KEY = "excel-clone:user";

type User = { name: string; email: string; password?: string };
type View = "dashboard" | "sheet";


function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
function makeNewMeta(name = "Sheet", rows = 200, cols = 50, userSuffixStr = "guest"): SheetMeta {
  const id = makeId();
  return { id, name, rows, cols, storageKey: `excel-clone:sheet:${userSuffixStr}:${id}` };
}

function ensureWorkbookFor(user: { email?: string; name?: string } | null) {
  const key = workbookKeyFor(user);
  try {
    const raw = localStorage.getItem(key);
    console.debug("[ensureWorkbookFor] load key:", key, "len:", raw ? raw.length : 0);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure every entry has a storageKey using this user's suffix (fix older entries)
        const suf = userSuffix(user);
        const fixed = parsed.map((m: SheetMeta) => {
          // expected storageKey format: excel-clone:sheet:<suf>:<id>
          const expected = `excel-clone:sheet:${suf}:${m.id}`;
          if (!m.storageKey || !m.storageKey.includes(`:sheet:${suf}:`)) {
            // if original data exists under old key, copy it to new key
            try {
              const oldPayload = localStorage.getItem(m.storageKey || "");
              if (oldPayload) {
                localStorage.setItem(expected, oldPayload);
              } else {
                // if nothing under old key, create a blank payload to avoid load errors
                localStorage.setItem(expected, JSON.stringify({ cells: {} }));
              }
            } catch (e) {
              // fallback: create empty payload
              localStorage.setItem(expected, JSON.stringify({ cells: {} }));
            }
            return { ...m, storageKey: expected };
          }
          return m;
        });
        // persist fixed meta (so we don't keep migrating again)
        localStorage.setItem(key, JSON.stringify(fixed));
        return fixed as SheetMeta[];
      }
    }
  } catch (e) {
    console.warn("[ensureWorkbookFor] parse error", e);
  }
  // create default workbook for this user
  const suf = userSuffix(user);
  const def = [makeNewMeta("Sheet1", 200, 50, suf)];
  localStorage.setItem(key, JSON.stringify(def));
  // seed cells (if not existing) under the namespaced storageKey
  try {
    const payloadKey = def[0].storageKey;
    if (!localStorage.getItem(payloadKey)) localStorage.setItem(payloadKey, JSON.stringify({ cells: {} }));
  } catch (e) {}
  return def;
}


export default function App() {
  // Inside App() add:
// App.tsx
const createFromTemplate = (tmpl: TemplateDef) => {
  const rows = tmpl.rows ?? 200;
  const cols = tmpl.cols ?? 50;

  const meta = makeNewMeta(tmpl.name, rows, cols, userSuffix(user));

  setSheets(prev => {
    const next = [...prev, meta];

    // persist workbook list (user-scoped)
    localStorage.setItem(workbookKeyFor(user), JSON.stringify(next));


    // seed cells into the new sheet
    const payload = {
      cells: tmpl.cells,   // <-- prefilled A1 map
      rowCount: rows,
      colCount: cols,
    };
    localStorage.setItem(meta.storageKey, JSON.stringify(payload));

    // (debug) verify we saved something
    try {
      const check = JSON.parse(localStorage.getItem(meta.storageKey) || "{}");
      const count = check?.cells ? Object.keys(check.cells).length : 0;
      console.log(`Template “${tmpl.name}” seeded: ${count} cells`);
    } catch {}

    // ✅ select the newly created sheet (use next.length - 1, not sheets.length)
    setActiveIndex(next.length - 1);

    return next;
  });

  setView("sheet");
};



  // Theme
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
  );
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  // Workbook
  // start as guest workbook — will reload after login
const [sheets, setSheets] = useState<SheetMeta[]>(() => ensureWorkbookFor(null));

  const [activeIndex, setActiveIndex] = useState(0);

  // Auth
  // ✅ always require login on fresh run
const [user, setUser] = useState<User | null>(null);

  const [view, setView] = useState<View>("dashboard");

  function handleAuthed(u: User) {
    setUser(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setView("dashboard");
  }
  function handleLogout() {
    setUser(null);
    setView("dashboard");
  }

  // Splash
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(t);
  }, []);

  // Theme styling
  useEffect(() => {
    document.body.classList.remove("light", "dark");
    document.body.classList.add(theme);
    document.body.style.background = theme === "dark" ? "#0a0a0a" : "#f8fafc";
    document.body.style.color = theme === "dark" ? "#e5e7eb" : "#0f172a";
  }, [theme]);

    useEffect(() => {
    localStorage.setItem(workbookKeyFor(user), JSON.stringify(sheets));
  }, [sheets, user]);


  const activeSheet = sheets[activeIndex];
useEffect(() => {
  // ensure workbook/meta exist (and normalize storageKey values)
  const meta = ensureWorkbookFor(user);
  setSheets(meta);
  setActiveIndex(0);

  // if we want to migrate guest data into a newly-signed-in user:
  try {
    const userKey = workbookKeyFor(user);
    const guestKey = workbookKeyFor(null);
    // if user has no workbook entries but guest does, copy guest -> user (one-time)
    const userBlob = localStorage.getItem(userKey);
    const guestBlob = localStorage.getItem(guestKey);
    if ((!userBlob || userBlob === "[]") && guestBlob) {
      try {
        const parsed = JSON.parse(guestBlob);
        if (Array.isArray(parsed) && parsed.length > 0 && user) {
          const suf = userSuffix(user);
          const migrated = parsed.map((m: SheetMeta) => {
            const newKey = `excel-clone:sheet:${suf}:${m.id}`;
            // copy cells payload if exists under old key
            const oldPayload = localStorage.getItem(m.storageKey);
            if (oldPayload && !localStorage.getItem(newKey)) {
              localStorage.setItem(newKey, oldPayload);
            } else if (!localStorage.getItem(newKey)) {
              localStorage.setItem(newKey, JSON.stringify({ cells: {} }));
            }
            return { ...m, storageKey: newKey };
          });
          localStorage.setItem(userKey, JSON.stringify(migrated));
          setSheets(migrated);
          console.info("[migration] guest workbook copied to user:", userKey);
        }
      } catch (err) {
        console.warn("[migration] failed to migrate guest workbook", err);
      }
    }
  } catch (e) {
    /* ignore */
  }

  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}, [user]);


  // Sheet actions
 const addSheet = () => {
  const suf = userSuffix(user);
  const meta = makeNewMeta(`Sheet${sheets.length + 1}`, 200, 50, suf);
  setSheets((prev) => {
    const next = [...prev, meta];
    // persist workbook list (user-scoped)
    localStorage.setItem(workbookKeyFor(user), JSON.stringify(next));
    localStorage.setItem(meta.storageKey, JSON.stringify({ cells: {} }));
    return next;
  });
  setActiveIndex(sheets.length);
};

  const deleteSheet = (index: number) => {
    if (sheets.length === 1) return alert("Cannot delete the only sheet.");
    if (!confirm(`Delete "${sheets[index].name}"?`)) return;
    localStorage.removeItem(sheets[index].storageKey);
    const next = sheets.filter((_, i) => i !== index);
    setSheets(next);
    setActiveIndex(Math.max(0, index - 1));
  };
  const renameSheet = (index: number) => {
    const newName = prompt("Rename sheet", sheets[index].name);
    if (!newName) return;
    setSheets(sheets.map((s, i) => (i === index ? { ...s, name: newName } : s)));
  };
 const duplicateSheet = (index: number) => {
  const src = sheets[index];
  const copy = makeNewMeta(`${src.name}-copy`, src.rows, src.cols, userSuffix(user));
  setSheets((prev) => {
    const next = [...prev, copy];
    const blob = localStorage.getItem(src.storageKey);
    if (blob) localStorage.setItem(copy.storageKey, blob);
    localStorage.setItem(workbookKeyFor(user), JSON.stringify(next));
    return next;
  });
  setActiveIndex(sheets.length);
};


  // 🔹 Transition wrapper (fade-in)
  const Fade: React.FC<{ show: boolean; children: React.ReactNode }> = ({ show, children }) => (
    <div
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "scale(1)" : "scale(0.98)",
        transition: "opacity 0.8s ease, transform 0.6s ease",
        height: "100%",
        width: "100%",
      }}
    >
      {children}
    </div>
  );

  // 🟢 1) Splash
  if (showSplash)
    return (
      <Fade show={showSplash}>
        <SplashScreen theme={theme} />
      </Fade>
    );

  // 🟢 2) Not logged in
  if (!user)
    return (
      <Fade show={!showSplash}>
        <AuthPage
          theme={theme}
          onAuth={handleAuthed}
          savedUser={(() => {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? (JSON.parse(raw) as User) : null;
          })()}
        />
      </Fade>
    );

  // 🟢 3) Dashboard
if (view === "dashboard")
  return (
    <Fade show={!showSplash}>
      <Dashboard
        theme={theme}
        user={user}
        sheets={sheets}
        onOpenSheet={(i) => {
          setActiveIndex(i);
          setView("sheet");
        }}
        onCreateSheet={() => {
          addSheet();
          setView("sheet");
        }}
        onCreateFromTemplate={createFromTemplate} // ✅ Add this
        onLogout={handleLogout}
        onToggleTheme={toggleTheme}
      />
    </Fade>
  );


  // 🟢 4) Sheet view
  return (
    <Fade show={!showSplash}>
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          background: theme === "dark" ? "#0f172a" : "#f8fafc",
          color: theme === "dark" ? "#e5e7eb" : "#0f172a",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderBottom: theme === "dark" ? "1px solid #334155" : "1px solid #e5e7eb",
            background: theme === "dark" ? "#0b1220" : "#ffffff",
          }}
        >
          <button onClick={() => setView("dashboard")} className="toolbar-btn toolbar-btn--primary">
  ⬅ Dashboard
</button>
          <select
            value={activeIndex}
            onChange={(e) => setActiveIndex(Number(e.target.value))}
            style={{
              height: 30,
              borderRadius: 6,
              padding: "0 8px",
              background: theme === "dark" ? "#1e293b" : "#ffffff",
              color: theme === "dark" ? "#e2e8f0" : "#0f172a",
            }}
          >
            {sheets.map((s, i) => (
              <option key={s.id} value={i}>
                {s.name}
              </option>
            ))}
          </select>
          

<button onClick={addSheet} className="toolbar-btn">+ Sheet</button>
<button onClick={() => duplicateSheet(activeIndex)} className="toolbar-btn">Duplicate</button>
<button onClick={() => renameSheet(activeIndex)} className="toolbar-btn">Rename</button>
{/* around existing Delete button — place these just beside it */}
<button
  className="toolbar-btn"
  title="Import CSV"
  onClick={() => window.dispatchEvent(new CustomEvent("sheet-import-csv"))}
>
  Import CSV
</button>

<button
  className="toolbar-btn"
  title="Download CSV"
  onClick={() => window.dispatchEvent(new CustomEvent("sheet-download-csv"))}
>
  Download CSV
</button>

<button
  className="toolbar-btn"
  title="Clear Sheet"
  onClick={() => {
    if (!confirm("Clear all cells? This cannot be undone.")) return;
    window.dispatchEvent(new CustomEvent("sheet-clear"));
  }}
>
  Clear Sheet
</button>

<button
  className="toolbar-btn toolbar-btn--danger"
  title="Delete sheet"
  onClick={() => deleteSheet(activeIndex)}
>
  Delete
</button>

<div style={{ flex: 1 }} />

<button onClick={toggleTheme} className="toolbar-btn">
  {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
</button>
<button
  className="toolbar-btn toolbar-btn--danger"
  onClick={() => deleteSheet(activeIndex)}
  style={{ background: "linear-gradient(180deg,#ef4444 0%,#dc2626 100%)", color: "#fff", border: "none" }}
>
  Logout
</button>


        </div>

        {/* Sheet Area */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {activeSheet ? (
            <Sheet
  key={activeSheet.storageKey}   // 👈 add this line
  rows={activeSheet.rows}
  cols={activeSheet.cols}
  storageKey={activeSheet.storageKey}
  sheetName={activeSheet.name}
  theme={theme}
/>

          ) : (
            <div style={{ padding: 16 }}>No sheet loaded.</div>
          )}
        </div>
      </div>
    </Fade>
  );
}

