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
if (typeof document !== "undefined" && !document.getElementById("toolbar-animations")) {
  const style = document.createElement("style");
  style.id = "toolbar-animations";
  style.textContent = `
    @keyframes toolbarGradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    button {
      position: relative;
      overflow: hidden;
      outline: none;
      transition: all 0.25s ease;
    }
    button::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(120deg, transparent, rgba(255,255,255,0.25), transparent);
      transform: translateX(-100%);
      transition: transform 0.5s ease;
    }
    button:hover::after {
      transform: translateX(100%);
    }
    button:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 6px 15px rgba(0,0,0,0.2);
      filter: brightness(1.05);
    }
    button:active {
      transform: scale(0.96);
      filter: brightness(0.95);
    }
    button:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 3px;
    }
  `;
  document.head.appendChild(style);
}


export default function App() {
  // Inside App() add:
// App.tsx
const createFromTemplate = (tmpl: TemplateDef) => {
  const rows = tmpl.rows ?? 200;
  const cols = tmpl.cols ?? 50;

  const meta = makeNewMeta(tmpl.name, rows, cols);

  setSheets(prev => {
    const next = [...prev, meta];

    // persist workbook list
    localStorage.setItem(WORKBOOK_KEY, JSON.stringify(next));

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
{/* Toolbar */}
{/* Toolbar */}
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: theme === "dark" ? "1px solid #334155" : "1px solid #e2e8f0",
    background: theme === "dark"
      ? "linear-gradient(90deg, #0f172a 0%, #1e293b 100%)"
      : "linear-gradient(90deg, #ffffff 0%, #f8fafc 100%)",
    boxShadow:
      theme === "dark"
        ? "0 2px 10px rgba(0,0,0,0.4)"
        : "0 2px 8px rgba(0,0,0,0.08)",
    position: "sticky",
    top: 0,
    zIndex: 10,
    backdropFilter: "blur(6px)",
    transition: "background 0.3s ease, box-shadow 0.3s ease",
  }}
>
  {/* Dashboard Navigation */}
  <button onClick={() => setView("dashboard")} style={btn(theme)}>⬅ Dashboard</button>

  {/* Sheet Selector */}
  <select
    value={activeIndex}
    onChange={(e) => setActiveIndex(Number(e.target.value))}
    style={{
      height: 36,
      borderRadius: 8,
      padding: "0 10px",
      background: theme === "dark" ? "#1e293b" : "#ffffff",
      color: theme === "dark" ? "#e2e8f0" : "#0f172a",
      border: theme === "dark" ? "1px solid #334155" : "1px solid #cbd5e1",
      outline: "none",
      transition: "all 0.2s ease",
    }}
  >
    {sheets.map((s, i) => (
      <option key={s.id} value={i}>{s.name}</option>
    ))}
  </select>

  {/* Sheet actions */}
  <button onClick={addSheet} style={btn(theme)}>+ Sheet</button>
  <button onClick={() => duplicateSheet(activeIndex)} style={btn(theme)}>Duplicate</button>
  <button onClick={() => renameSheet(activeIndex)} style={btn(theme)}>Rename</button>
  <button onClick={() => deleteSheet(activeIndex)} style={btnDanger(theme)}>Delete</button>

  {/* CSV and Clear options */}
  <button
    onClick={() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv,text/csv";
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        const text = await f.text();
        window.importCSV?.(text);
      };
      input.click();
    }}
    style={btn(theme)}
  >
    Import CSV
  </button>

  <button
    onClick={() => {
      const csv = window.cellsToCSV?.();
      if (!csv) return;
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sheet-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }}
    style={btn(theme)}
  >
    Download CSV
  </button>

  <button onClick={() => window.clearSheet?.()} style={btnDanger(theme)}>Clear Sheet</button>

  {/* Spacer + Theme + Logout */}
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

// 🔹 Styles
// 🔹 Elegant button styles with hover, active, and smooth transitions
function btn(theme: "light" | "dark", variant: "default" | "accent" | "success" | "warning" | "danger" = "default"): React.CSSProperties {
  const isDark = theme === "dark";

  // Define variant base colors (adapt automatically to theme)
  const colors = {
    default: {
      bg: isDark ? "#1e293b" : "#ffffff",
      text: isDark ? "#f1f5f9" : "#0f172a",
      border: isDark ? "#334155" : "#cbd5e1",
      hover: isDark ? "#334155" : "#f1f5f9",
      glow: isDark ? "#60a5fa55" : "#3b82f655",
    },
    accent: {
      bg: isDark ? "#2563eb" : "#3b82f6",
      text: "#ffffff",
      border: "transparent",
      hover: isDark ? "#1d4ed8" : "#2563eb",
      glow: "#60a5fa88",
    },
    success: {
      bg: isDark ? "#15803d" : "#16a34a",
      text: "#ffffff",
      border: "transparent",
      hover: isDark ? "#166534" : "#15803d",
      glow: "#4ade8088",
    },
    warning: {
      bg: isDark ? "#b45309" : "#f59e0b",
      text: "#ffffff",
      border: "transparent",
      hover: isDark ? "#92400e" : "#d97706",
      glow: "#facc1588",
    },
    danger: {
      bg: isDark ? "#991b1b" : "#dc2626",
      text: "#ffffff",
      border: "transparent",
      hover: isDark ? "#7f1d1d" : "#b91c1c",
      glow: "#f8717188",
    },
  };

  const c = colors[variant];

  return {
    height: 38,
    padding: "0 16px",
    borderRadius: 10,
    border: `1px solid ${c.border}`,
    background: c.bg,
    color: c.text,
    fontWeight: 500,
    fontSize: 14,
    letterSpacing: 0.3,
    cursor: "pointer",
    transition: "all 0.25s ease, transform 0.15s ease",
    boxShadow: isDark
      ? "0 1px 3px rgba(0,0,0,0.4)"
      : "0 2px 4px rgba(0,0,0,0.1)",
  };
}

// 🔸 Red variant for destructive actions (Delete / Clear / Logout)
function btnDanger(theme: "light" | "dark"): React.CSSProperties {
  const isDark = theme === "dark";
  return {
    ...btn(theme),
    background: isDark ? "#7f1d1d" : "#fee2e2",
    color: isDark ? "#fca5a5" : "#b91c1c",
    border: `1px solid ${isDark ? "#f87171" : "#fca5a5"}`,
  };
}
// 🔧 Add hover and click animations globally
if (typeof document !== "undefined" && !document.getElementById("toolbar-btn-style")) {
  const style = document.createElement("style");
  style.id = "toolbar-btn-style";
  style.textContent = `
    button:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 3px 8px rgba(0,0,0,0.12);
    }
    button:active {
      transform: translateY(0px) scale(0.97);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    button:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);
}
if (typeof document !== "undefined" && !document.getElementById("animated-toolbar-style")) {
  const style = document.createElement("style");
  style.id = "animated-toolbar-style";
  style.textContent = `
    @keyframes buttonPulse {
      0% { box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
      50% { box-shadow: 0 0 8px rgba(59, 130, 246, 0.4); }
      100% { box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
    }

    button {
      position: relative;
      overflow: hidden;
      outline: none;
      border-radius: 8px;
      transition: all 0.25s ease, transform 0.2s ease, box-shadow 0.2s ease;
      transform-origin: center;
    }

    /* Subtle shimmer on hover */
    button::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(120deg, transparent, rgba(255,255,255,0.2), transparent);
      transform: translateX(-100%);
      transition: transform 0.45s ease;
    }

    button:hover::after {
      transform: translateX(100%);
    }

    /* Lift + glow pulse */
    button:hover {
      transform: translateY(-2px) scale(1.04);
      filter: brightness(1.05);
      animation: buttonPulse 1.5s ease-in-out infinite;
    }

    /* Click (press down) */
    button:active {
      transform: translateY(0px) scale(0.97);
      filter: brightness(0.95);
      animation: none;
    }

    /* Focus accessibility outline */
    button:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);
}
