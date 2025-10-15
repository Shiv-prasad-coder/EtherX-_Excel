// src/App.tsx
import { useEffect, useState } from "react";

import Sheet from "./components/Sheet";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import SplashScreen from "./components/SplashScreen";
// Extend the Window interface so TypeScript recognizes our global helpers
declare global {
  interface Window {
    importCSV?: (csvText: string) => void;
    cellsToCSV?: () => string;
    clearSheet?: () => void;
  }
}


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

// stable keys (per-user workbook key is computed)
const THEME_KEY = "excel-clone:theme";
const USER_KEY = "excel-clone:user";

type User = { name: string; email: string; password?: string };
type View = "dashboard" | "sheet";

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// produce a short safe suffix from user (email or name)
function userSuffix(u: { email?: string; name?: string } | null) {
  if (!u) return "guest";
  const id = (u.email || u.name || "user").toLowerCase();
  return id.replace(/[^a-z0-9]/g, "_");
}
function workbookKeyFor(user: { email?: string; name?: string } | null) {
  return `excel-clone:workbook-meta:${userSuffix(user)}`;
}
function makeNewMeta(name = "Sheet", rows = 200, cols = 50, suf = "guest"): SheetMeta {
  const id = makeId();
  return { id, name, rows, cols, storageKey: `excel-clone:sheet:${suf}:${id}` };
}

// ensure workbook exists for a given user (client-only)
function ensureWorkbookFor(user: { email?: string; name?: string } | null) {
  const key = workbookKeyFor(user);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // ensure storageKey format contains suffix — fix older entries
        const suf = userSuffix(user);
        const fixed = parsed.map((m: SheetMeta) => {
          const expected = `excel-clone:sheet:${suf}:${m.id}`;
          if (!m.storageKey || !m.storageKey.includes(`:sheet:${suf}:`)) {
            // migrate payload if present under old key
            try {
              const oldPayload = localStorage.getItem(m.storageKey || "");
              if (oldPayload) localStorage.setItem(expected, oldPayload);
              else localStorage.setItem(expected, JSON.stringify({ cells: {} }));
            } catch {
              localStorage.setItem(expected, JSON.stringify({ cells: {} }));
            }
            return { ...m, storageKey: expected };
          }
          return m;
        });
        localStorage.setItem(key, JSON.stringify(fixed));
        return fixed as SheetMeta[];
      }
    }
  } catch (e) {
    // ignore parse errors
  }
  // create default workbook for this user
  const suf = userSuffix(user);
  const def = [makeNewMeta("Sheet1", 200, 50, suf)];
  localStorage.setItem(key, JSON.stringify(def));
  try {
    const payloadKey = def[0].storageKey;
    if (!localStorage.getItem(payloadKey)) localStorage.setItem(payloadKey, JSON.stringify({ cells: {} }));
  } catch {}
  return def;
}

export default function App() {
  // Theme: default to light; will load from storage on mount
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  // Workbook + auth state (start empty; load on mount)
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("dashboard");

  // Splash
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(t);
  }, []);

  // On client mount, load user/theme/workbook
  useEffect(() => {
    if (typeof window === "undefined") return;

    // load theme
    try {
      const t = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}

    // load user (if any)
    let loadedUser: User | null = null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as User;
        loadedUser = { ...parsed, email: parsed.email ? parsed.email.toLowerCase() : parsed.email };
      }
    } catch {}

    setUser(loadedUser);

    // ensure workbook for loadedUser (namespaced)
    try {
      const meta = ensureWorkbookFor(loadedUser);
      setSheets(meta);
      setActiveIndex(0);
    } catch (err) {
      // fallback
      const suf = userSuffix(loadedUser);
      const def = [makeNewMeta("Sheet1", 200, 50, suf)];
      setSheets(def);
      setActiveIndex(0);
    }
  }, []);

  // persist workbook meta when sheets change or when user changes (user-specific key)
  useEffect(() => {
    try {
      const key = workbookKeyFor(user);
      localStorage.setItem(key, JSON.stringify(sheets));
    } catch {}
  }, [sheets, user]);

  // persist user (normalized) whenever it changes
  useEffect(() => {
    try {
      if (user) {
        const normalized = { ...user, email: user.email ? user.email.toLowerCase() : user.email };
        localStorage.setItem(USER_KEY, JSON.stringify(normalized));
      } else {
        localStorage.removeItem(USER_KEY);
      }
    } catch {}
  }, [user]);

  // sheet helpers that must be user-aware
  const createFromTemplate = (tmpl: TemplateDef) => {
    const rows = tmpl.rows ?? 200;
    const cols = tmpl.cols ?? 50;
    const suf = userSuffix(user);
    const meta = makeNewMeta(tmpl.name, rows, cols, suf);

    setSheets((prev) => {
      const next = [...prev, meta];
      try {
        localStorage.setItem(workbookKeyFor(user), JSON.stringify(next));
      } catch {}
      const payload = { cells: tmpl.cells, rowCount: rows, colCount: cols };
      try {
        localStorage.setItem(meta.storageKey, JSON.stringify(payload));
      } catch {}
      setActiveIndex(next.length - 1);
      return next;
    });

    setView("sheet");
  };

  // Auth handlers (called from AuthPage)
  function handleAuthed(u: User) {
    const normalized: User = { ...u, email: u.email ? u.email.toLowerCase() : u.email };
    setUser(normalized);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(normalized));
    } catch {}
    // if user had no workbook but guest does, migrate guest -> user (one-time)
    try {
      const userKey = workbookKeyFor(normalized);
      const guestKey = workbookKeyFor(null);
      const userBlob = localStorage.getItem(userKey);
      const guestBlob = localStorage.getItem(guestKey);
      if ((!userBlob || userBlob === "[]") && guestBlob) {
        const parsed = JSON.parse(guestBlob);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const suf = userSuffix(normalized);
          const migrated = parsed.map((m: SheetMeta) => {
            const newKey = `excel-clone:sheet:${suf}:${m.id}`;
            // copy payload if exists under old key
            const oldPayload = localStorage.getItem(m.storageKey);
            if (oldPayload && !localStorage.getItem(newKey)) localStorage.setItem(newKey, oldPayload);
            else if (!localStorage.getItem(newKey)) localStorage.setItem(newKey, JSON.stringify({ cells: {} }));
            return { ...m, storageKey: newKey };
          });
          localStorage.setItem(userKey, JSON.stringify(migrated));
          setSheets(migrated);
          setActiveIndex(0);
          console.info("[migration] guest workbook copied to user:", userKey);
        }
      } else {
        // ensure we load user's workbook
        const meta = ensureWorkbookFor(normalized);
        setSheets(meta);
        setActiveIndex(0);
      }
    } catch (err) {
      // fallback to ensure
      const meta = ensureWorkbookFor(normalized);
      setSheets(meta);
      setActiveIndex(0);
    }

    setView("dashboard");
  }
  function handleLogout() {
    setUser(null);
    // keep user data in storage; just switch state to logged out (guest)
    // load guest workbook
    try {
      const guestMeta = ensureWorkbookFor(null);
      setSheets(guestMeta);
      setActiveIndex(0);
    } catch (e) {
      setSheets([makeNewMeta("Sheet1", 200, 50, "guest")]);
      setActiveIndex(0);
    }
    setView("dashboard");
  }

  // Sheet actions (user-aware)
  const addSheet = () => {
    const suf = userSuffix(user);
    const meta = makeNewMeta(`Sheet${sheets.length + 1}`, 200, 50, suf);
    setSheets((prev) => {
      const next = [...prev, meta];
      try {
        localStorage.setItem(workbookKeyFor(user), JSON.stringify(next));
        localStorage.setItem(meta.storageKey, JSON.stringify({ cells: {} }));
      } catch {}
      return next;
    });
    setActiveIndex(sheets.length);
  };
  const deleteSheet = (index: number) => {
    if (sheets.length === 1) return alert("Cannot delete the only sheet.");
    if (!confirm(`Delete "${sheets[index].name}"?`)) return;
    try {
      localStorage.removeItem(sheets[index].storageKey);
    } catch {}
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
      try {
        const blob = localStorage.getItem(src.storageKey);
        if (blob) localStorage.setItem(copy.storageKey, blob);
        localStorage.setItem(workbookKeyFor(user), JSON.stringify(next));
      } catch {}
      return next;
    });
    setActiveIndex(sheets.length);
  };

  // UI: Fade / splash
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

  // show splash
  if (showSplash)
    return (
      <Fade show={showSplash}>
        <SplashScreen theme={theme} />
      </Fade>
    );

  // Not logged in -> show AuthPage
  if (!user)
    return (
      <Fade show={!showSplash}>
       <AuthPage
  theme={theme}
  onAuth={handleAuthed}
/>

      </Fade>
    );

  // Dashboard
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
          onCreateFromTemplate={createFromTemplate}
          onLogout={handleLogout}
          onToggleTheme={toggleTheme}
        />
      </Fade>
    );

  // Sheet view
  const activeSheet = sheets[activeIndex];
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
         {/* Sheet Actions */}
<button onClick={addSheet} className="toolbar-btn transition-transform duration-150 hover:scale-105 active:scale-95">
  + Sheet
</button>

<button onClick={() => duplicateSheet(activeIndex)} className="toolbar-btn transition-transform duration-150 hover:scale-105 active:scale-95">
  Duplicate
</button>

{/* Rename */}
<button
  onClick={() => renameSheet(activeIndex)}
  className="toolbar-btn transition-transform duration-150 hover:scale-105 active:scale-95"
>
  Rename
</button>

{/* Delete */}
<button
  onClick={() => deleteSheet(activeIndex)}
  className="toolbar-btn transition-transform duration-150 hover:scale-105 active:scale-95"
  style={{
    background: "rgba(239, 68, 68, 0.15)",
    color: "#ef4444",
    border: "1px solid #ef4444",
    fontWeight: 600,
  }}
>
  Delete
</button>

{/* Import CSV */}
<button
  className="toolbar-btn transition-transform duration-150 hover:scale-105 active:scale-95"
  style={{
    background: "rgba(59, 130, 246, 0.1)",
    color: "#3b82f6",
    fontWeight: 600,
  }}
  onClick={() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (window.importCSV) window.importCSV(text);
      else alert("Import function not found");
    };
    input.click();
  }}
>
  Import CSV
</button>

{/* Download CSV */}
<button
  className="toolbar-btn transition-transform duration-150 hover:scale-105 active:scale-95"
  style={{
    background: "rgba(59, 130, 246, 0.1)",
    color: "#3b82f6",
    fontWeight: 600,
  }}
  onClick={() => {
    if (window.cellsToCSV) {
      const csv = window.cellsToCSV();
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `sheet-${ts}.csv`;
      link.click();
    } else alert("Download function not found");
  }}
>
  Download CSV
</button>

{/* Clear Sheet */}
<button
  className="toolbar-btn transition-transform duration-150 hover:scale-105 active:scale-95"
  style={{
    background: "rgba(245, 158, 11, 0.1)",
    color: "#f59e0b",
    fontWeight: 600,
  }}
  onClick={() => {
    if (confirm("Clear all cells in this sheet?")) {
      if (window.clearSheet) window.clearSheet();
      else alert("Clear function not found");
    }
  }}
>
  Clear Sheet
</button>


<div style={{ flex: 1 }} />

<button onClick={toggleTheme} className="toolbar-btn">
  {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
</button>
<button onClick={handleLogout} className="toolbar-btn toolbar-btn--danger">Logout</button>
        </div>

        {/* Sheet Area */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {activeSheet ? (
            <Sheet
              key={activeSheet.storageKey}
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


