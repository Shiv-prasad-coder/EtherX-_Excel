// src/App.tsx
import { useEffect, useState } from "react";
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

const THEME_KEY = "excel-clone:theme";
const USER_KEY = "excel-clone:user";

type User = { name: string; email: string; password?: string };
type View = "dashboard" | "sheet";

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
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
function ensureWorkbookFor(user: { email?: string; name?: string } | null) {
  const key = workbookKeyFor(user);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const suf = userSuffix(user);
        const fixed = parsed.map((m: SheetMeta) => {
          const expected = `excel-clone:sheet:${suf}:${m.id}`;
          if (!m.storageKey || !m.storageKey.includes(`:sheet:${suf}:`)) {
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
  } catch {}
  const suf = userSuffix(user);
  const def = [makeNewMeta("Sheet1", 200, 50, suf)];
  localStorage.setItem(key, JSON.stringify(def));
  try {
    const payloadKey = def[0].storageKey;
    if (!localStorage.getItem(payloadKey))
      localStorage.setItem(payloadKey, JSON.stringify({ cells: {} }));
  } catch {}
  return def;
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("dashboard");

  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(t);
  }, []);

  // For CSV + Clear function bridges
  const [importCSVFn, setImportCSVFn] = useState<(fileText: string) => void>();
  const [downloadCSVFn, setDownloadCSVFn] = useState<() => string>();
  const [clearSheetFn, setClearSheetFn] = useState<() => void>();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = localStorage.getItem(THEME_KEY) as "light" | "dark" | null;
    if (t) setTheme(t);

    let loadedUser: User | null = null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) loadedUser = JSON.parse(raw);
    } catch {}
    setUser(loadedUser);

    const meta = ensureWorkbookFor(loadedUser);
    setSheets(meta);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    localStorage.setItem(workbookKeyFor(user), JSON.stringify(sheets));
  }, [sheets, user]);

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }, [user]);

  function handleAuthed(u: User) {
    setUser(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    const meta = ensureWorkbookFor(u);
    setSheets(meta);
    setActiveIndex(0);
    setView("dashboard");
  }

  function handleLogout() {
    setUser(null);
    const meta = ensureWorkbookFor(null);
    setSheets(meta);
    setActiveIndex(0);
    setView("dashboard");
  }

  const addSheet = () => {
    const suf = userSuffix(user);
    const meta = makeNewMeta(`Sheet${sheets.length + 1}`, 200, 50, suf);
    setSheets((prev) => {
      const next = [...prev, meta];
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

  if (showSplash)
    return (
      <Fade show={showSplash}>
        <SplashScreen theme={theme} />
      </Fade>
    );

  if (!user)
    return (
      <Fade show={!showSplash}>
        <AuthPage theme={theme} onAuth={handleAuthed} />
      </Fade>
    );

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
          onLogout={handleLogout}
          onToggleTheme={toggleTheme}
        />
      </Fade>
    );

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

          {/* Sheet actions */}
          <button onClick={addSheet} className="toolbar-btn">+ Sheet</button>
          <button onClick={() => duplicateSheet(activeIndex)} className="toolbar-btn">Duplicate</button>
          <button onClick={() => renameSheet(activeIndex)} className="toolbar-btn">Rename</button>
          <button
            onClick={() => deleteSheet(activeIndex)}
            className="toolbar-btn toolbar-btn--danger"
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "#ef4444",
              border: "1px solid #ef4444",
              fontWeight: 600,
            }}
          >
            Delete
          </button>

          {/* CSV + Clear buttons */}
          <button
            className="toolbar-btn"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".csv,text/csv";
              input.onchange = async () => {
                const f = input.files?.[0];
                if (!f || !importCSVFn) return;
                const text = await f.text();
                importCSVFn(text);
              };
              input.click();
            }}
          >
            Import CSV
          </button>

          <button
            className="toolbar-btn"
            onClick={() => {
              if (!downloadCSVFn) return;
              const csv = downloadCSVFn();
              const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = `sheet-${ts}.csv`;
              link.click();
            }}
          >
            Download CSV
          </button>

          <button
            className="toolbar-btn toolbar-btn--danger"
            onClick={() => clearSheetFn?.()}
          >
            Clear Sheet
          </button>

          <div style={{ flex: 1 }} />
          <button onClick={toggleTheme} className="toolbar-btn">
            {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
          </button>
          <button onClick={handleLogout} className="toolbar-btn toolbar-btn--danger">
            Logout
          </button>
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
              onImportCSV={setImportCSVFn}
              onDownloadCSV={setDownloadCSVFn}
              onClearSheet={setClearSheetFn}
            />
          ) : (
            <div style={{ padding: 16 }}>No sheet loaded.</div>
          )}
        </div>
      </div>
    </Fade>
  );
}
