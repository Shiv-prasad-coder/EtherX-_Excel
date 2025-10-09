// src/components/Dashboard.tsx
import React, { useState, useMemo } from "react";
import logoLight from "../assets/logo_light.png";
import logoDark from "../assets/logo_dark.png";

type SheetMeta = {
  id: string;
  name: string;
  rows: number;
  cols: number;
  storageKey: string;
};

type CellData = {
  value?: any;
  raw?: string;      // formulas go in raw ("=SUM(...)")
  bold?: boolean;
  formula?: string;  // optional (Sheet mainly reads `raw`)
};

type TemplateDef = {
  name: string;
  rows?: number;
  cols?: number;
  cells: Record<string, CellData>;
};

type Props = {
  theme: "light" | "dark";
  user: { name: string; email: string };
  sheets: SheetMeta[];
  onOpenSheet: (index: number) => void;
  onCreateSheet: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onCreateFromTemplate: (tmpl: TemplateDef) => void; // provided by App
};
// Make A1 keys from 2D array; store each as raw string


export default function Dashboard({
  theme,
  user,
  sheets,
  onOpenSheet,
  onCreateSheet,
  onLogout,
  onToggleTheme,
  onCreateFromTemplate,
}: Props) {
  const dark = theme === "dark";

  const C = {
    bg: dark ? "#000000" : "#ffffff",
    panel: dark ? "#0a0a0a" : "#ffffff",
    text: dark ? "#f3f3f3" : "#0f172a",
    sub: dark ? "#bdbdbd" : "#64748b",
    border: dark ? "#1a1a1a" : "#e2e2e2",
    card: dark ? "#0d0d0d" : "#ffffff",
    cardHover: dark ? "#111111" : "#f5f5f5",
    accent: "#2563eb",
    accentText: "#ffffff",
  };


  // ===== Template gallery state =====
  const [showTemplates, setShowTemplates] = useState(false);
  const categories = ["All", "Budget", "Personal", "School", "Business"] as const;
  type Category = typeof categories[number];
  const [activeCat, setActiveCat] = useState<Category>("All");

  // ===== Template data (with categories) =====
  type TemplateMatrix = {
    key: string;
    name: string;
    description: string;
    category: Category;
    data: string[][];
  };

  const templates: TemplateMatrix[] = [
    // ==== Budget ====
    {
      key: "budget-monthly",
      name: "Monthly Budget",
      description: "Plan vs Actual with difference + totals",
      category: "Budget",
      data: [
        ["Category", "Planned", "Actual", "Difference"],
        ["Rent", "1200", "1200", "=C2-B2"],
        ["Groceries", "350", "310", "=C3-B3"],
        ["Transport", "120", "95", "=C4-B4"],
        [],
        ["TOTALS", "=SUM(B2:B4)", "=SUM(C2:C4)", "=C6-B6"],
      ],
    },
    {
      key: "budget-daily",
      name: "Daily Expenses",
      description: "Track daily spend by category",
      category: "Budget",
      data: [
        ["Date", "Category", "Description", "Amount"],
        ["2025-10-01", "Food", "Lunch", "8.50"],
        ["2025-10-01", "Transport", "Cab", "12.00"],
      ],
    },
    // ==== Personal ====
    {
      key: "personal-habits",
      name: "Habit Tracker",
      description: "Simple monthly habit grid",
      category: "Personal",
      data: [
        ["Habit", "1", "2", "3", "4", "5", "6", "7"],
        ["Workout", "", "", "", "", "", "", ""],
        ["Read", "", "", "", "", "", "", ""],
      ],
    },
    {
      key: "personal-fitness",
      name: "Workout Log",
      description: "Exercise / sets / reps / weight",
      category: "Personal",
      data: [
        ["Date", "Exercise", "Sets", "Reps", "Weight"],
        ["2025-10-01", "Bench Press", "4", "8", "60"],
        ["2025-10-03", "Squat", "4", "6", "80"],
      ],
    },
    // ==== School ====
    {
      key: "school-gradebook",
      name: "Gradebook",
      description: "Average computed from three assessments",
      category: "School",
      data: [
        ["Student", "Quiz 1", "Quiz 2", "Project", "Average"],
        ["Priya", "86", "90", "95", "=(B2+C2+D2)/3"],
        ["Rahul", "78", "82", "88", "=(B3+C3+D3)/3"],
      ],
    },
    {
      key: "school-study",
      name: "Study Plan",
      description: "Subjects, chapters, schedule",
      category: "School",
      data: [
        ["Subject", "Topic", "Pages", "Date", "Status"],
        ["Math", "Derivatives", "35-54", "2025-10-12", "Planned"],
        ["Physics", "Kinematics", "12-30", "2025-10-14", "Planned"],
      ],
    },
    // ==== Business ====
    {
      key: "biz-sales",
      name: "Sales Tracker",
      description: "Units, price, revenue with totals",
      category: "Business",
      data: [
        ["Item", "Units", "Price", "Revenue"],
        ["Widget A", "12", "9.5", "=B2*C2"],
        ["Widget B", "7", "14.0", "=B3*C3"],
        [],
        ["TOTAL", "", "", "=SUM(D2:D3)"],
      ],
    },
    {
      key: "biz-inventory",
      name: "Inventory",
      description: "Stock, reorder level, status",
      category: "Business",
      data: [
        ["SKU", "Name", "In Stock", "Reorder Level", "Status"],
        ["A101", "Cable 1m", "44", "20", "=IF(C2<=D2,\"Reorder\",\"OK\")"],
        ["A205", "HDMI Adapter", "12", "15", "=IF(C3<=D3,\"Reorder\",\"OK\")"],
      ],
    },
  ];

 

function matrixToTemplate(name: string, matrix: string[][]): TemplateDef {
  const cells: Record<string, CellData> = {};
  let maxCols = 0;

  const colToA1 = (col: number) => {
    let s = "";
    while (col >= 0) {
      s = String.fromCharCode((col % 26) + 65) + s;
      col = Math.floor(col / 26) - 1;
    }
    return s;
  };

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] || [];
    maxCols = Math.max(maxCols, row.length);

    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v === undefined || v === null || v === "") continue;

      const a1 = `${colToA1(c)}${r + 1}`;
      const asText = String(v);

      if (asText.startsWith("=")) {
        // formulas: keep only raw
        cells[a1] = { raw: asText };
      } else {
        // literals: set both raw and value (header row bold)
        cells[a1] = r === 0
          ? { raw: asText, value: asText, bold: true }
          : { raw: asText, value: asText };
      }
    }
  }

  return {
    name,
    rows: Math.max(200, matrix.length + 50),
    cols: Math.max(50, maxCols + 10),
    cells,
  };
}

  // ===== CSV export helper (kept for users who want it) =====
  function toCSV(matrix: string[][]): string {
    const esc = (s: string) =>
      /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    return matrix.map((row) => row.map((c) => esc(c ?? "")).join(",")).join("\r\n");
  }
  function downloadCSV(name: string, matrix: string[][]) {
    const blob = new Blob([toCSV(matrix)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Filtered view for the gallery
  const filtered = useMemo(
    () => (activeCat === "All" ? templates : templates.filter(t => t.category === activeCat)),
    [activeCat, templates]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        padding: 28,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* subtle background glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: dark
            ? "radial-gradient(900px 360px at 12% -8%, rgba(37,99,235,0.08), transparent 60%), radial-gradient(800px 260px at 88% 108%, rgba(236,72,153,0.06), transparent 65%)"
            : "radial-gradient(900px 360px at 12% -8%, rgba(37,99,235,0.05), transparent 60%), radial-gradient(800px 260px at 88% 108%, rgba(236,72,153,0.04), transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 1,
        }}
      >
        {/* Left: Logo + Welcome */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src={dark ? logoDark : logoLight}
            alt="Logo"
            style={{ width: 130, height: 130, objectFit: "contain" }}
            draggable={false}
          />
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: 0.3,
                color: C.text,
              }}
            >
              Welcome back, {user.name}!
            </h1>
            <div style={{ marginTop: 2, fontSize: 15, color: C.sub }}>
              What would you like to work on today?
            </div>
          </div>
        </div>

        {/* Right: buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onToggleTheme}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.text,
              cursor: "pointer",
            }}
          >
            {dark ? "🌞 Light" : "🌙 Dark"}
          </button>

          <button
            onClick={onLogout}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: dark ? "#7f1d1d" : "#fee2e2",
              color: dark ? "#fee2e2" : "#b91c1c",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Action Cards */}
      <div
        style={{
          marginTop: 40,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <ActionCard
          title="Blank Spreadsheet"
          subtitle="Start with an empty spreadsheet"
          icon="➕"
          onClick={onCreateSheet}
          accent={C.accent}
          accentText={C.accentText}
        />

    
{/* Browse Templates — opens modal with categories */}
<ActionCard
  title="Use Templates"
  subtitle="Budget, study, workout & more"
  icon="✨"
  onClick={() => setShowTemplates(true)}   // 👈 open the modal instead of creating
  accent={C.accent}
  accentText={C.accentText}
/>



        <ActionCard
          title="Import File"
          subtitle="Upload CSV or JSON"
          icon="⬆"
          onClick={() => alert("Import feature coming soon")}
          dim
        />

        <ActionCard
          title="Advanced Features"
          subtitle="Analytics, Achievements, Activity Log"
          icon="⭐"
          onClick={() => alert("Advanced area coming soon")}
        />
      </div>

      {/* Recent Sheets List */}
      {sheets.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 18 }}>
            Recent Sheets
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: 300,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {sheets.slice(-8).reverse().map((s, idx) => {
              const i = sheets.length - 1 - idx;
              return (
                <button
                  key={s.id}
                  onClick={() => onOpenSheet(i)}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: C.panel,
                    color: C.text,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transition: "background .15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = C.cardHover;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = C.panel;
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: C.sub }}>
                      {s.rows} × {s.cols}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, opacity: 0.6 }}>📄</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Template Gallery Modal with Categories ===== */}
      {showTemplates && (
        <div
          onClick={() => setShowTemplates(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 920,
              maxWidth: "95vw",
              background: C.card,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: 18,
              boxShadow: "0 10px 30px rgba(0,0,0,.35)",
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 18 }}>Template Gallery</div>
              <button
                onClick={() => setShowTemplates(false)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  color: C.text,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Category tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {categories.map((cat) => {
                const active = activeCat === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCat(cat)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: `1px solid ${active ? C.accent : C.border}`,
                      background: active ? C.accent : C.panel,
                      color: active ? C.accentText : C.text,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Template cards grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {filtered.map((t) => (
                <div
                  key={t.key}
                  style={{
                    border: `1px solid ${C.border}`,
                    background: C.panel,
                    borderRadius: 12,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: C.sub }}>{t.description}</div>

                  <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                    {/* Create directly from template (matrix → A1 cells) */}
                    <button
                      onClick={() => {
                        const tmpl = matrixToTemplate(t.name, t.data);
                        onCreateFromTemplate(tmpl);
                        setShowTemplates(false);
                      }}
                      style={{
                        padding: "10px",
                        borderRadius: 10,
                        background: C.accent,
                        color: C.accentText,
                        border: "none",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Create from Template
                    </button>

                    <button
                      onClick={() => downloadCSV(t.name, t.data)}
                      style={{
                        padding: "10px",
                        borderRadius: 10,
                        background: C.panel,
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Download CSV
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: C.sub }}>
              Tip: After creation you can edit headers, add more formulas, and resize columns.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* small reusable Action Card */
const ActionCard: React.FC<{
  title: string;
  subtitle: string;
  icon: string;
  onClick: () => void;
  accent?: string;
  accentText?: string;
  dim?: boolean;
}> = ({ title, subtitle, icon, onClick, accent, accentText, dim }) => {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: 18,
        background: dim ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
        transition: "all .15s ease",
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{subtitle}</div>
      <button
        style={{
          marginTop: 16,
          width: "100%",
          padding: "10px",
          borderRadius: 10,
          background: accent || "rgba(255,255,255,0.08)",
          color: accentText || "#fff",
          border: "none",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {dim ? "Coming Soon" : "Open"}
      </button>
    </div>
  );
};
