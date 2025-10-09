// src/App.tsx
import { useEffect, useState, type CSSProperties } from "react";
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

const WORKBOOK_KEY = "excel-clone:workbook-meta";
const THEME_KEY = "excel-clone:theme";
const USER_KEY = "excel-clone:user";

type User = { name: string; email: string; password?: string };
type View = "dashboard" | "sheet";

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
function makeNewMeta(name = "Sheet", rows = 200, cols = 50): SheetMeta {
  const id = makeId();
  return { id, name, rows, cols, storageKey: `excel-clone:sheet:${id}` };
}
function ensureWorkbook(): SheetMeta[] {
  try {
    const raw = localStorage.getItem(WORKBOOK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  const def = [makeNewMeta("Sheet1")];
  localStorage.setItem(WORKBOOK_KEY, JSON.stringify(def));
  localStorage.setItem(def[0].storageKey, JSON.stringify({ cells: {} }));
  return def;
}

export default function App() {
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
  const [sheets, setSheets] = useState<SheetMeta[]>(() => ensureWorkbook());
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
    localStorage.setItem(WORKBOOK_KEY, JSON.stringify(sheets));
  }, [sheets]);

  const activeSheet = sheets[activeIndex];

  // Sheet actions
  const addSheet = () => {
    const meta = makeNewMeta(`Sheet${sheets.length + 1}`);
    setSheets((prev) => {
      const next = [...prev, meta];
      localStorage.setItem(WORKBOOK_KEY, JSON.stringify(next));
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
    const copy = makeNewMeta(`${src.name}-copy`, src.rows, src.cols);
    setSheets((prev) => {
      const next = [...prev, copy];
      const blob = localStorage.getItem(src.storageKey);
      if (blob) localStorage.setItem(copy.storageKey, blob);
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
          <button onClick={() => setView("dashboard")} style={btn(theme)}>
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
          <button onClick={addSheet} style={btn(theme)}>+ Sheet</button>
          <button onClick={() => duplicateSheet(activeIndex)} style={btn(theme)}>Duplicate</button>
          <button onClick={() => renameSheet(activeIndex)} style={btn(theme)}>Rename</button>
          <button onClick={() => deleteSheet(activeIndex)} style={btnDanger(theme)}>Delete</button>
          <div style={{ flex: 1 }} />
          <button onClick={toggleTheme} style={btn(theme)}>
            {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
          </button>
          <button onClick={handleLogout} style={btnDanger(theme)}>Logout</button>
        </div>

        {/* Sheet Area */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {activeSheet ? (
            <Sheet
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

// 🔹 Styles
function btn(theme: "light" | "dark"): CSSProperties {
  const isDark = theme === "dark";
  return {
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    cursor: "pointer",
    border: `1px solid ${isDark ? "#475569" : "#d1d5db"}`,
    background: isDark ? "#1f2937" : "#ffffff",
    color: isDark ? "#e5e7eb" : "#0f172a",
    marginRight: 8,
    transition: "all 0.25s ease",
  };
}
function btnDanger(theme: "light" | "dark"): CSSProperties {
  const isDark = theme === "dark";
  return {
    ...btn(theme),
    background: isDark ? "#7f1d1d" : "#fee2e2",
    color: isDark ? "#fee2e2" : "#b91c1c",
  };
}
