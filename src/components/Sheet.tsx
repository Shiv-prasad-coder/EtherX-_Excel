// src/components/Sheet.tsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { evaluateAndUpdate, setCellRaw } from "../utils/formulaEngine";
import type { CellValue } from "../utils/formulaEngine";
declare global {
  interface Window {
    importCSV?: (csvText: string) => void;
    cellsToCSV?: () => string;
    clearSheet?: () => void;
    setFontSize?: (size: number) => void; // ✅ add this line
  }
}

  


function getPalette(theme?: "light" | "dark") {
  const dark = theme === "dark";
  return {
    appBg: dark ? "#0a0a0a" : "#ffffff",         // App background → deep black
    surface: dark ? "#121212" : "#ffffff",       // Grid background / cells
    surfaceAlt: dark ? "#1c1c1c" : "#fafafa",    // Headers background
    border: dark ? "#2a2a2a" : "#e5e7eb",        // Cell borders
    text: dark ? "#e5e5e5" : "#0f172a",
    textMuted: dark ? "#b3b3b3" : "#475569",
    selection: dark ? "#2563eb" : "#3b82f6",     // Blue accent for highlight
    selectionFill: dark ? "#1e3a8a" : "#dbeafe", // Fill color on selection
  };
}






/** Layout constants */
const COL_WIDTH = 100;
const ROW_HEIGHT = 28;
const COL_HEADER_HEIGHT = 28;

type Props = {
  rows: number;
  cols: number;
  storageKey?: string;
  sheetName?: string;
  theme?: "light" | "dark"; // 👈 NEW
};


/** Utilities */
function colIndexToName(n: number) {
  let s = "", i = n + 1;
  while (i > 0) { const rem = (i - 1) % 26; s = String.fromCharCode(65 + rem) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
function colNameToIndex(name: string) {
  let col = 0;
  for (let i = 0; i < name.length; i++) col = col * 26 + (name.charCodeAt(i) - 64);
  return col - 1;
}
function cellId(r: number, c: number) { return `${colIndexToName(c)}${r + 1}`; }
function tryParseId(id: string) {
  const m = id.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const col = colNameToIndex(m[1]);
  const row = parseInt(m[2], 10) - 1;
  return { row, col };
}
function parseId(id: string): { row: number; col: number } | null {
  return tryParseId(id);
}
function inRect(r: number, c: number, rect: { r1: number; c1: number; r2: number; c2: number }) {
  const rMin = Math.min(rect.r1, rect.r2);
  const rMax = Math.max(rect.r1, rect.r2);
  const cMin = Math.min(rect.c1, rect.c2);
  const cMax = Math.max(rect.c1, rect.c2);
  return r >= rMin && r <= rMax && c >= cMin && c <= cMax;
}
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Number formatting types */
type NumFmt = "general" | "number" | "currency" | "percent" | "date";
type CellFmt = {
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  bg?: string;
  color?: string;
  numFmt?: NumFmt;
  decimals?: number;
  currency?: string;
  fontSize?: number;
    fontFamily?: string;
     border?: string;   

};

/** Conditional formatting color helper */
function getConditionalBg(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) return undefined;      // numeric only
  if (n < 0) return "#fde2e2";
  if (n === 0) return "#f0f0f0";
  if (n <= 50) return "#fff7cc";
  if (n <= 100) return "#e6ffed";
  return "#c6f6d5";
}
export default function Sheet({
  rows,
  cols,
  storageKey = "excel-clone:sheet1",
  sheetName = "Sheet1",
  theme = "light",
}: Props) {

const pal = useMemo(() => getPalette(theme), [theme]);


  const effectiveKey = storageKey;
  function ShapeIcon({ type, stroke }: { type: ShapeType; stroke: string }) {
  const common = { fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg width="48" height="32" viewBox="0 0 48 32" aria-hidden>
      {type === "rect" && <rect x="8" y="6" width="32" height="20" {...common} />}
      {type === "circle" && <circle cx="24" cy="16" r="10" {...common} />}
      {type === "triangle" && <path d="M24 6 L40 26 H8 Z" {...common} />}
      {type === "arrow" && <path d="M8 16 H34 M26 10 L34 16 L26 22" {...common} />}
      {type === "line" && <path d="M8 8 L40 24" {...common} />}
      {type === "diamond" && <path d="M24 6 L40 16 L24 26 L8 16 Z" {...common} />}
      {type === "star" && (
        <path d="M24 6 L27.5 14 H36 L29 18.5 L31.5 26 L24 21.2 L16.5 26 L19 18.5 L12 14 H20.5 Z" {...common} />
      )}
      {type === "heart" && (
        <path d="M16 12c0-3 3-4 5-2c2-2 5-1 5 2c0 4-5 7-5 7s-5-3-5-7Z" {...common} />
      )}
      {type === "cloud" && (
        <path d="M16 20h16a6 6 0 0 0-1.5-11.8A8 8 0 0 0 16 12a5 5 0 0 0 0 8Z" {...common} />
      )}
      {type === "textbox" && (
        <>
          <rect x="8" y="6" width="32" height="20" {...common} />
          <path d="M12 12 H36 M12 16 H28" {...common} />
        </>
      )}
    </svg>
  );
}


  /** Core data state */
  const [cells, setCells] = useState<Record<string, CellValue>>(() => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.cells || {};
    }
  } catch (err) {
    console.warn("Failed to load saved sheet:", err);
  }
  return {};
});


  const [editing, setEditing] = useState<string | null>(null);
  const [formulaBar, setFormulaBar] = useState("");
  const selectedRef = useRef<string | null>(null);
  // inside the Sheet() component, with your other useState hooks:
const [ribbonTab, setRibbonTab] = useState<"home" | "insert" | "view">("home");


  /** Dynamic sheet size (start from props) */
  const [rowCount, setRowCount] = useState(rows);
  const [colCount, setColCount] = useState(cols);
  // Conditional Formatting Rules
const [rules, setRules] = useState<{ condition: string; value: string; color: string }[]>([]);



  /** Freeze toggles */
  const [freezeTopRow, setFreezeTopRow] = useState(false);
  const [freezeFirstCol, setFreezeFirstCol] = useState(false);
  // Zoom level (1.0 = 100%)
const [zoom, setZoom] = useState(1);
const [showZoomModal, setShowZoomModal] = useState(false);


  /** Conditional formatting toggle */
  const [condEnabled, setCondEnabled] = useState(false);
  const [showCondModal, setShowCondModal] = useState(false);
  const [showFontModal, setShowFontModal] = useState(false);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Table insert modal
const [showTableModal, setShowTableModal] = useState(false);
const [tableSize, setTableSize] = useState({ rows: 3, cols: 3 });

const [showFormulaModal, setShowFormulaModal] = useState(false);



// ---------- Pivot table UI / logic (drop into Sheet component) ----------
const [showPivotModal, setShowPivotModal] = useState(false);
const [pivotPreview, setPivotPreview] = useState<string[][] | null>(null);
const [pivotOpts, setPivotOpts] = useState<{
  rowIndex: number;
  colIndex: number | null;
  valueIndex: number;
  agg: "sum" | "count" | "avg" | "min" | "max";
  includeHeaderRow: boolean;
}>({
  rowIndex: 0,
  colIndex: null,
  valueIndex: 1,
  agg: "sum",
  includeHeaderRow: true,
});
// ---------- Shapes Layer ----------
type SheetShape = {
  id: string;
  type: ShapeType;
  x: number; // pixel position (relative to grid)
  y: number;
  width: number;
  height: number;
  color: string;
};

const [shapes, setShapes] = useState<SheetShape[]>([]);

// ---------- Insert Shapes (dialog + selection) ----------
type ShapeType =
  | "rect"
  | "circle"
  | "triangle"
  | "arrow"
  | "line"
  | "diamond"
  | "star"
  | "heart"
  | "cloud"
  | "textbox";

// Dialog visibility state
const [showShapesModal, setShowShapesModal] = useState(false);

// Shape insertion logic (for now it just alerts — you’ll hook it up later)
const startShapeInsert = (type: ShapeType) => {
  setShowShapesModal(false);
  
  // Create a new shape object (appears near top-left for now)
  const newShape: SheetShape = {
    id: `shape_${Date.now()}`,
    type,
    x: 120, // starting X position
    y: 100, // starting Y position
    width: 100,
    height: 60,
    color: "#3b82f6", // blue for now
  };

  setShapes(prev => [...prev, newShape]);
};

/** Helper: get textual value from a cell id */
function cellToText(id: string): string {
  const v = cells[id];
  if (!v) return "";
  if (v.raw != null) return String(v.raw);
  if (v.value != null) return String(v.value);
  return "";
}

/** Build a matrix (strings) from a given selection range */
function rangeToMatrix(rng: { r1: number; c1: number; r2: number; c2: number }) {
  const rows: string[][] = [];
  const rMin = Math.min(rng.r1, rng.r2);
  const rMax = Math.max(rng.r1, rng.r2);
  const cMin = Math.min(rng.c1, rng.c2);
  const cMax = Math.max(rng.c1, rng.c2);
  for (let r = rMin; r <= rMax; r++) {
    const row: string[] = [];
    for (let c = cMin; c <= cMax; c++) {
      row.push(cellToText(cellId(r, c)));
    }
    rows.push(row);
  }
  return rows;
}

/** Pivot computation: from matrix (rows of strings) produce pivot matrix */
function computePivotMatrix(
  matrix: string[][],
  rowIdx: number,
  colIdx: number | null,
  valueIdx: number,
  agg: "sum" | "count" | "avg" | "min" | "max"
): string[][] {
  // matrix: array of rows, possibly including header row at index 0
  // We'll treat input rows as data rows (not excluding headers) — caller decides
  const dataRows = matrix;
  const rowMap = new Map<string, Map<string, { sum: number; count: number; min: number; max: number }>>();
  const rowKeysSet = new Set<string>();
  const colKeysSet = new Set<string>();
  const colAllKey = "__ALL__";

  for (const r of dataRows) {
    const rowKey = String(r[rowIdx] ?? "");
    const colKey = colIdx == null ? colAllKey : String(r[colIdx] ?? "");
    const valRaw = r[valueIdx] ?? "";
    const valNum = Number(String(valRaw).replace(/,/g, "")); // attempt numeric
    const isNum = Number.isFinite(valNum);

    let inner = rowMap.get(rowKey);
    if (!inner) { inner = new Map(); rowMap.set(rowKey, inner); }
    let aggObj = inner.get(colKey);
    if (!aggObj) aggObj = { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };

    if (agg === "count") {
      // count presence
      const present = String(valRaw).trim() !== "";
      if (present) { aggObj.count += 1; aggObj.sum += isNum ? valNum : 0; }
    } else {
      if (isNum) {
        aggObj.sum += valNum;
        aggObj.count += 1;
        aggObj.min = Math.min(aggObj.min, valNum);
        aggObj.max = Math.max(aggObj.max, valNum);
      } else {
        // non-numeric values: for count treat as 1, else ignore (you could change behavior)
        if (agg === "sum" || agg === "avg" || agg === "min" || agg === "max") {
          // ignore non-numeric in numeric aggregations
        }
      }
    }

    inner.set(colKey, aggObj);
    rowKeysSet.add(rowKey);
    colKeysSet.add(colKey);
  }

  const rowKeys = Array.from(rowKeysSet).sort();
  const colKeys = Array.from(colKeysSet).filter(k => k !== "__ALL__").sort();
  const includeAllCol = colIdx == null; // if colIndex null, we used single pivot column

  // Build header row: [RowField, colKey1, ..., colKeyN, (Total)]
  const headerRow = [ " " , ...colKeys ];
  if (includeAllCol || colKeys.length > 0) headerRow.push("Total");
  const out: string[][] = [headerRow];

  function finalize(aggObj?: { sum: number; count: number; min: number; max: number }): string {
    if (!aggObj) return "";
    if (agg === "count") return String(aggObj.count);
    if (agg === "sum") return String(Number.isFinite(aggObj.sum) ? +aggObj.sum : "");
    if (agg === "avg") return aggObj.count ? String(+(aggObj.sum / aggObj.count).toFixed(4)) : "";
    if (agg === "min") return aggObj.min === Number.POSITIVE_INFINITY ? "" : String(aggObj.min);
    if (agg === "max") return aggObj.max === Number.NEGATIVE_INFINITY ? "" : String(aggObj.max);
    return "";
  }

  for (const rk of rowKeys) {
    const inner = rowMap.get(rk) ?? new Map();
    const rowOut: string[] = [rk];
    let rowTotalObj = { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
    for (const ck of colKeys) {
      const aggObj = inner.get(ck);
      rowOut.push(finalize(aggObj));
      if (agg === "count") { rowTotalObj.count += aggObj?.count ?? 0; }
      else { rowTotalObj.sum += aggObj?.sum ?? 0; rowTotalObj.count += aggObj?.count ?? 0; rowTotalObj.min = Math.min(rowTotalObj.min, aggObj?.min ?? Number.POSITIVE_INFINITY); rowTotalObj.max = Math.max(rowTotalObj.max, aggObj?.max ?? Number.NEGATIVE_INFINITY); }
    }
    // total
    rowOut.push(finalize(rowTotalObj));
    out.push(rowOut);
  }

  // optionally append a "Totals" row (sum across rows)
  const totalsRow = ["Totals"];
  if (rowKeys.length > 0) {
    for (let i = 0; i < colKeys.length; i++) {
      // sum down column i
      let colSumObj = { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
      for (const rk of rowKeys) {
        const aggObj = rowMap.get(rk)?.get(colKeys[i]);
        if (aggObj) {
          colSumObj.sum += aggObj.sum ?? 0;
          colSumObj.count += aggObj.count ?? 0;
          colSumObj.min = Math.min(colSumObj.min, aggObj.min ?? Number.POSITIVE_INFINITY);
          colSumObj.max = Math.max(colSumObj.max, aggObj.max ?? Number.NEGATIVE_INFINITY);
        }
      }
      totalsRow.push(finalize(colSumObj));
    }
    // grand total
    let grand = { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
    for (const rk of rowKeys) {
      for (const ck of colKeys) {
        const a = rowMap.get(rk)?.get(ck);
        if (a) { grand.sum += a.sum ?? 0; grand.count += a.count ?? 0; grand.min = Math.min(grand.min, a.min ?? Number.POSITIVE_INFINITY); grand.max = Math.max(grand.max, a.max ?? Number.NEGATIVE_INFINITY); }
      }
    }
    totalsRow.push(finalize(grand));
    out.push(totalsRow);
  }

  return out;
}


  /** Column widths */
  const [colWidths, setColWidths] = useState<number[]>(
    () => Array.from({ length: cols }, () => COL_WIDTH)
  );
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  /** Scroll tracking for row header sync */
  const [scrollTop, setScrollTop] = useState(0);

  /** Fill handle (drag-to-fill) */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const fillDraggingRef = useRef(false);
  const fillStartRangeRef = useRef<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const fillPreviewRef = useRef<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const [, setFillPreviewRange] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);

  /** Selection/range */
  const [range, setRange] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const draggingRef = useRef(false);

  /** Formatting state */
  const [formats, setFormats] = useState<Record<string, CellFmt>>({});

  /** Find/Replace state */
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [findHits, setFindHits] = useState<Array<{ id: string; r: number; c: number }>>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const findHitSet = useMemo(() => new Set(findHits.map(h => h.id)), [findHits]);

  /** Undo/Redo */
  type Snapshot = {
    cells: Record<string, CellValue>;
    colWidths: number[];
    selected: string | null;
    range: { r1: number; c1: number; r2: number; c2: number } | null;
    freezeTopRow: boolean;
    freezeFirstCol: boolean;
    formats: Record<string, CellFmt>;
    rowCount: number;
    colCount: number;
    condEnabled: boolean;
  };
  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const HISTORY_LIMIT = 100;
  const takeSnapshot = (): Snapshot => ({
    cells: { ...cells },
    colWidths: [...colWidths],
    selected: selectedRef.current ?? null,
    range: range ? { ...range } : null,
    freezeTopRow,
    freezeFirstCol,
    formats: { ...formats },
    rowCount,
    colCount,
    condEnabled,
  });
  const pushHistory = () => {
    historyRef.current.push(takeSnapshot());
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    futureRef.current = [];
  };
  const applySnapshot = (s: Snapshot) => {
    setCells(s.cells);
    setColWidths(s.colWidths);
    selectedRef.current = s.selected;
    setRange(s.range);
    setFreezeTopRow(s.freezeTopRow);
    setFreezeFirstCol(s.freezeFirstCol);
    setFormats(s.formats);
    setRowCount(s.rowCount);
    setColCount(s.colCount);
    setCondEnabled(s.condEnabled);
    if (s.selected) {
      const cur = s.cells[s.selected];
      setFormulaBar(cur?.raw ?? (cur?.value?.toString() ?? ""));
    } else setFormulaBar("");
  };
  const undo = () => { const prev = historyRef.current.pop(); if (!prev) return; futureRef.current.push(takeSnapshot()); applySnapshot(prev); };
  const redo = () => { const next = futureRef.current.pop(); if (!next) return; historyRef.current.push(takeSnapshot()); applySnapshot(next); };

  /** Iterate selected cells */
  function forEachSelectedCell(fn: (id: string, r: number, c: number) => void) {
    if (range) {
      const rMin = Math.min(range.r1, range.r2);
      const rMax = Math.max(range.r1, range.r2);
      const cMin = Math.min(range.c1, range.c2);
      const cMax = Math.max(range.c1, range.c2);
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          fn(cellId(r, c), r, c);
        }
      }
    } else if (selectedRef.current) {
      const id = selectedRef.current;
      const p = parseId(id);
      if (p) fn(id, p.row, p.col);
    }
  }

  /** Selection & edit */
  const onSelect = useCallback((id: string) => {
    selectedRef.current = id;
    setEditing(null);
    setFormulaBar(cells[id]?.raw ?? (cells[id]?.value?.toString() ?? ""));
    
    const p = parseId(id); if (p) setRange({ r1: p.row, c1: p.col, r2: p.row, c2: p.col });
  }, [cells]);

  const onEdit = useCallback((id: string) => {
    selectedRef.current = id;
    setEditing(id);
    setFormulaBar(cells[id]?.raw ?? (cells[id]?.value?.toString() ?? ""));
  }, [cells]);
const commitEdit = useCallback((id: string, raw: string) => {
  pushHistory();

  setCells(prev => {
    const copy = { ...prev };

    // Ensure cell object
    if (!copy[id]) copy[id] = {};

    // Always store exactly what the user typed
    copy[id].raw = raw;

    // If it's a formula, let the formula engine compute value
    if (raw.startsWith("=")) {
      copy[id].value = "";
      evaluateAndUpdate(copy, id);
      return copy;
    }

    // Otherwise, store a number if it parses cleanly; else store as text
    const n = Number(raw);
    if (!Number.isNaN(n) && raw.trim() !== "") {
      // IMPORTANT: do NOT auto-apply percent/date/currency conversions here.
      // We keep the data pure. Any formatting happens only at render time.
      copy[id].value = n;
    } else {
      copy[id].value = raw ?? "";
    }

    return copy;
  });

  setEditing(null);
}, []);// place inside the component where commitEdit and selectedRef are in scope
function insertCurrentDateTime(includeTime: boolean) {
  const sel = selectedRef.current;
  if (!sel) {
    alert("Please select a cell first.");
    return;
  }

  const now = new Date();
  if (includeTime) {
    // keep format simple: YYYY-MM-DD HH:MM
    const pad = (n: number) => String(n).padStart(2, "0");
    const value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    commitEdit(sel, value);
  } else {
    const pad = (n: number) => String(n).padStart(2, "0");
    const value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    commitEdit(sel, value);
  }
}
function insertTable(rows: number, cols: number) {
  const startId = selectedRef.current;
  if (!startId) return alert("Select a cell first!");

  pushHistory();

  const pos = parseId(startId);
  if (!pos) return;

  setCells((prev) => {
    const next = { ...prev };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = cellId(pos.row + r, pos.col + c);
        if (!next[id]) next[id] = {};
        next[id].value = ""; // empty cell
        next[id].raw = "";
      }
    }
    return next;
  });

  // give cells a border to visually form a "table"
  setFormats((prev) => {
    const next = { ...prev };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = cellId(pos.row + r, pos.col + c);
        next[id] = {
          ...(next[id] || {}),
          border: "1px solid #3b82f6",
        };
      }
    }
    return next;
  });
}





  /** Copy/Paste and CSV */
  const copySelectedToClipboard = async () => {
    const id = selectedRef.current; if (!id) return;
    const v = cells[id]?.value;
    const text = v == null ? "" : String(v);
    try { await navigator.clipboard.writeText(text); } catch {}
  };
  function parseTable(text: string): string[][] {
    if (text.includes("\t")) return text.split(/\r?\n/).map(line => line.split("\t"));
    const out: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ",") { row.push(cur); cur = ""; }
        else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
        else if (ch !== "\r") cur += ch;
      }
    }
    row.push(cur); out.push(row);
    return out;
  }
  function pasteMatrix(matrix: string[][]) {
    const startId = selectedRef.current; if (!startId || matrix.length === 0) return;
    pushHistory();
    const m = startId.match(/^([A-Z]+)(\d+)$/); if (!m) return;
    const [, colName, rowStr] = m;
    let startCol = 0; for (let i = 0; i < colName.length; i++) startCol = startCol * 26 + (colName.charCodeAt(i) - 64); startCol--;
    const startRow = parseInt(rowStr, 10) - 1;
    setCells(prev => {
      const next = { ...prev };
      const maxR = Math.min(rowCount - startRow, matrix.length);
      for (let r = 0; r < maxR; r++) {
        const line = matrix[r] ?? [];
        const maxC = Math.min(colCount - startCol, line.length);
        for (let c = 0; c < maxC; c++) {
          const id = cellId(startRow + r, startCol + c);
          const raw = String(line[c] ?? "");
          setCellRaw(next, id, raw); evaluateAndUpdate(next, id);
        }
      }
      return next;
    });
  }


  /** Auto-fit + column resize */
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  function ensureCtx(): CanvasRenderingContext2D {
    if (!measureCanvasRef.current) measureCanvasRef.current = document.createElement("canvas");
    const ctx = measureCanvasRef.current.getContext("2d")!;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    return ctx;
  }
  function textWidth(s: string) { return ensureCtx().measureText(s).width; }
  function autoFitColumn(col: number) {
    const padding = 24;
    let maxW = textWidth(colIndexToName(col));
    for (let r = 0; r < Math.min(rowCount, 1000); r++) {
      const v = cells[cellId(r, col)]?.value;
      const w = textWidth(v == null ? "" : String(v));
      if (w > maxW) maxW = w;
    }
    const newW = Math.min(Math.max(40, Math.ceil(maxW + padding)), 600);
    if (newW !== colWidths[col]) {
      pushHistory();
      setColWidths(prev => { const copy = [...prev]; copy[col] = newW; return copy; });
    }
  }
  function startColDrag(col: number, x0: number) {
    const startW = colWidths[col];
    const onMove = (e: MouseEvent) => {
      const nextW = Math.max(40, startW + (e.clientX - x0));
      setColWidths(prev => { const copy = [...prev]; copy[col] = nextW; return copy; });
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    pushHistory();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  // ================= CSV / Import / Clear Helpers =================

// Convert all sheet data to CSV string
function cellsToCSV(): string {
  const rowsArr: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowVals: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const id = `${String.fromCharCode(65 + c)}${r + 1}`;
      const val = cells[id]?.raw ?? cells[id]?.value ?? "";
      const safe = typeof val === "string"
        ? `"${val.replace(/"/g, '""')}"`
        : String(val);
      rowVals.push(safe);
    }
    rowsArr.push(rowVals.join(","));
  }
  return rowsArr.join("\n");
}

// Import CSV text into cells
function importCSV(csvText: string) {
  const lines = csvText.split("\n").map(l => l.split(","));
  const newCells: Record<string, any> = {};
  for (let r = 0; r < lines.length; r++) {
    for (let c = 0; c < lines[r].length; c++) {
      const id = `${String.fromCharCode(65 + c)}${r + 1}`;
      const val = lines[r][c].replace(/^"|"$/g, "");
      if (val.trim() !== "") newCells[id] = { value: val, raw: val };
    }
  }
  setCells(prev => ({ ...prev, ...newCells }));
}

// Clear entire sheet
function clearSheet() {
  if (!confirm("Are you sure you want to clear all data?")) return;
  setCells({});
}


// Expose globally so App toolbar can access
useEffect(() => {
  if (typeof setFontSize === "function") {
    window.setFontSize = (size: number) => setFontSize(size);
  }
}, []);


// --- Font Size Control ---
function setFontSize(size: number) {
  const sel = selectedRef.current;
  if (!sel) return alert("Please select a cell first.");

  setFormats(prev => ({
    ...prev,
    [sel]: { ...(prev[sel] || {}), fontSize: size },
  }));
}

useEffect(() => {
  if (typeof setFontSize === "function") {
    window.setFontSize = (size: number) => setFontSize(size);
  }
}, []);

// ✅ Expose helpers globally ONCE (safe place for useEffect)
useEffect(() => {
  window.importCSV = importCSV;
  window.cellsToCSV = cellsToCSV;
  window.clearSheet = clearSheet;
}, []);


  /** Keyboard shortcuts (do not fire when typing in an input field) */
  useEffect(() => {
    const isTypingInAField = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || (node as HTMLElement).isContentEditable;
    };

    const onKey = async (e: KeyboardEvent) => {
      if (isTypingInAField(e.target)) return;

      const sel = selectedRef.current;

      if (!editing) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      }

      if (!sel) return;

      if (!editing) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); await copySelectedToClipboard(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
          e.preventDefault();
          try { const text = await navigator.clipboard.readText(); pasteMatrix(parseTable(text)); } catch {}
          return;
        }
      }

      if (!editing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setEditing(sel); setFormulaBar(e.key); e.preventDefault(); return;
      }

      const p = parseId(sel); if (!p) return;
      const goto = (r: number, c: number) => {
        const id = cellId(r, c); selectedRef.current = id;
        setEditing(null);
        setFormulaBar(cells[id]?.raw ?? (cells[id]?.value?.toString() ?? ""));
        setCells({ ...cells });
        setRange({ r1: r, c1: c, r2: r, c2: c });
      };
      if (e.key === "ArrowDown") { goto(Math.min(rowCount - 1, p.row + 1), p.col); e.preventDefault(); }
      else if (e.key === "ArrowUp") { goto(Math.max(0, p.row - 1), p.col); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { goto(p.row, Math.max(0, p.col - 1)); e.preventDefault(); }
      else if (e.key === "ArrowRight") { goto(p.row, Math.min(colCount - 1, p.col + 1)); e.preventDefault(); }
      else if (e.key === "Enter" || e.key === "F2") { setEditing(sel); e.preventDefault(); }
      else if (e.key === "Escape") { setEditing(null); setFormulaBar(""); e.preventDefault(); }
      else if (e.key === "Backspace" || e.key === "Delete") { pushHistory(); commitEdit(sel, ""); e.preventDefault(); }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cells, colCount, rowCount, editing]);

  /** Load from localStorage (incl. condEnabled) */
  /** Load from localStorage (incl. condEnabled) */
// Paste this entire block in place of your previous "Load from localStorage" useEffect
useEffect(() => {
  try {
    const raw = localStorage.getItem(effectiveKey);
    if (raw) {
      // parse safely
      const saved = JSON.parse(raw) as {
        cells?: Record<string, CellValue>;
        selected?: string | null;
        colWidths?: number[];
        freezeTopRow?: boolean;
        freezeFirstCol?: boolean;
        formats?: Record<string, CellFmt>;
        rowCount?: number;
        colCount?: number;
        condEnabled?: boolean;
      };

      // If cells exist in storage, attempt to evaluate formulas so .value is populated.
      if (saved.cells) {
        try {
          // evaluateAndUpdate mutates saved.cells to populate computed values
          evaluateAndUpdate(saved.cells);
        } catch (err) {
          // don't block load on evaluation error — show warning for debugging
          // eslint-disable-next-line no-console
          console.warn("Formula evaluation failed when loading sheet:", err);
        }
        setCells(saved.cells);
      } else {
        setCells({});
      }

      if (Array.isArray(saved.colWidths) && saved.colWidths.length) setColWidths(saved.colWidths);
      if (typeof saved.freezeTopRow === "boolean") setFreezeTopRow(saved.freezeTopRow);
      if (typeof saved.freezeFirstCol === "boolean") setFreezeFirstCol(saved.freezeFirstCol);
      if (saved.formats) setFormats(saved.formats);
      if (typeof saved.rowCount === "number") setRowCount(saved.rowCount);
      if (typeof saved.colCount === "number") setColCount(saved.colCount);
      if (typeof saved.condEnabled === "boolean") setCondEnabled(saved.condEnabled);

      // ensure selectedRef.current is a string before using it as an index
      selectedRef.current = saved.selected ?? "A1";
      const id = selectedRef.current ?? "A1"; // GUARANTEED string for indexing

      // only read formula/raw/value safely if saved.cells exists
      const cellForId = saved.cells?.[id];
      setFormulaBar(cellForId?.raw ?? (cellForId?.value != null ? String(cellForId.value) : ""));
      setRange({ r1: 0, c1: 0, r2: 0, c2: 0 });
    } else {
      // no saved state
      selectedRef.current = "A1";
      setRange({ r1: 0, c1: 0, r2: 0, c2: 0 });
      setCells({}); // start empty
    }
  } catch (err) {
    // parse/read error — fallback to defaults
    // eslint-disable-next-line no-console
    console.warn("Failed to load sheet from storage:", err);
    selectedRef.current = "A1";
    setRange({ r1: 0, c1: 0, r2: 0, c2: 0 });
    setCells({});
  }

  // initialize history/future (you had this previously)
  historyRef.current = [takeSnapshot()];
  futureRef.current = [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [effectiveKey]);


  /** Autosave */
  useEffect(() => {
  const payload = {
    cells,
    colWidths,
    freezeTopRow,
    freezeFirstCol,
    formats,
    rowCount,
    colCount,
    condEnabled,
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (e) {
    console.warn("Failed saving sheet to localStorage:", e);
  }
}, [cells, colWidths, freezeTopRow, freezeFirstCol, formats, rowCount, colCount, condEnabled, storageKey]);

 
 


  /** Formatting helpers */
  function toggleBold() {
    pushHistory();
    setFormats(prev => {
      const copy = { ...prev };
      forEachSelectedCell((id) => {
        const cur = copy[id] ?? {};
        copy[id] = { ...cur, bold: !cur.bold };
      });
      return copy;
    });
  }
  function toggleItalic() {
    pushHistory();
    setFormats(prev => {
      const copy = { ...prev };
      forEachSelectedCell((id) => {
        const cur = copy[id] ?? {};
        copy[id] = { ...cur, italic: !cur.italic };
      });
      return copy;
    });
  }
  function setAlign(align: "left" | "center" | "right") {
    pushHistory();
    setFormats(prev => {
      const copy = { ...prev };
      forEachSelectedCell((id) => {
        const cur = copy[id] ?? {};
        copy[id] = { ...cur, align };
      });
      return copy;
    });
  }
  function setBg(color: string) {
    pushHistory();
    setFormats(prev => {
      const copy = { ...prev };
      forEachSelectedCell((id) => {
        const cur = copy[id] ?? {};
        copy[id] = { ...cur, bg: color || undefined };
      });
      return copy;
    });
  }
  // 🖋️ Font family setter (applies font style to selected cells)
function setFontFamily(family: string) {
  const sel = selectedRef.current;
  if (!sel) return;
  pushHistory();
  setFormats((prev) => ({
    ...prev,
    [sel]: { ...(prev[sel] || {}), fontFamily: family },
  }));
}

  function setColor(color: string) {
    pushHistory();
    setFormats(prev => {
      const copy = { ...prev };
      forEachSelectedCell((id) => {
        const cur = copy[id] ?? {};
        copy[id] = { ...cur, color: color || undefined };
      });
      return copy;
    });
  }

  /** Number format helpers */
  function setNumFmt(fmt: NumFmt) {
    pushHistory();
    setFormats(prev => {
      const copy = { ...prev };
      forEachSelectedCell((id) => {
        const cur = copy[id] ?? {};
        const defaults: Record<string, number> = { number: 2, currency: 2, percent: 2 };
        copy[id] = {
          ...cur,
          numFmt: fmt,
          decimals: fmt in defaults ? (cur.decimals ?? defaults[fmt]) : cur.decimals,
          currency: cur.currency ?? "₹",
        };
      });
      return copy;
    });
  }
  function incDecimals(delta: 1 | -1) {
  pushHistory();
  setFormats(prev => {
    const copy = { ...prev };
    forEachSelectedCell((id) => {
      const cur = copy[id] ?? {};
      const nextDecimals = Math.max(0, Math.min(10, (cur.decimals ?? 2) + delta));
      copy[id] = {
        ...cur,
        // <-- if no explicit format yet, treat decimals change as "Number" format
        numFmt: cur.numFmt ?? "number",
        decimals: nextDecimals,
      };
    });
    return copy;
  });
}

  function setCurrencySymbol(sym: string) {
    pushHistory();
    setFormats(prev => {
      const copy = { ...prev };
      forEachSelectedCell((id) => {
        const cur = copy[id] ?? {};
        copy[id] = {
          ...cur,
          currency: sym || "₹",
          numFmt: cur.numFmt ?? "currency",
          decimals: cur.decimals ?? 2
        };
      });
      return copy;
    });
  }

  /** Find/Replace helpers */
  function scanFind() {
  if (!findText) {
    setFindHits([]);
    setHitIndex(0);
    return;
  }

  // whole-word regex for the current query
  const regex = new RegExp(`\\b${escapeRegExp(findText)}\\b`, matchCase ? "" : "i");

  const out: Array<{ id: string; r: number; c: number }> = [];
  for (const [id, cell] of Object.entries(cells)) {
    const pos = parseId(id);
    if (!pos) continue;

    const base = cell?.raw ?? (cell?.value == null ? "" : String(cell.value));
    if (regex.test(String(base))) {
      out.push({ id, r: pos.row, c: pos.col });
    }
  }

  out.sort((a, b) => (a.r - b.r) || (a.c - b.c));
  setFindHits(out);
  setHitIndex(0);
}

  useEffect(() => { scanFind(); }, [findText, matchCase, cells, rowCount, colCount]);

  function ensureVisible(r: number, c: number) {
    const grid = gridRef.current;
    if (!grid) return;
    let left = 0;
    for (let i = 0; i < c; i++) left += colWidths[i] ?? COL_WIDTH;
    const width = colWidths[c] ?? COL_WIDTH;
    const top = COL_HEADER_HEIGHT + r * ROW_HEIGHT;
    const height = ROW_HEIGHT;

    const viewLeft = grid.scrollLeft;
    const viewRight = viewLeft + grid.clientWidth;
    const viewTop = grid.scrollTop;
    const viewBottom = viewTop + grid.clientHeight;

    if (left < viewLeft) grid.scrollLeft = left;
    else if (left + width > viewRight) grid.scrollLeft = left + width - grid.clientWidth;

    if (top < viewTop) grid.scrollTop = top;
    else if (top + height > viewBottom) grid.scrollTop = top + height - grid.clientHeight;
  }

  function gotoHit(idx: number) {
    const hit = findHits[idx];
    if (!hit) return;
    const id = hit.id;
    selectedRef.current = id;
    setEditing(null);
    setFormulaBar(cells[id]?.raw ?? (cells[id]?.value?.toString() ?? ""));
  
    setRange({ r1: hit.r, c1: hit.c, r2: hit.r, c2: hit.c });
    setHitIndex(idx);
    ensureVisible(hit.r, hit.c);
  }
  function nextHit() {
    if (!findHits.length) return;
    gotoHit((hitIndex + 1) % findHits.length);
  }
  function prevHit() {
    if (!findHits.length) return;
    gotoHit((hitIndex - 1 + findHits.length) % findHits.length);
  }
  function replaceCurrent() {
    if (!findHits.length) return;
    const { id } = findHits[hitIndex];
    const cell = cells[id];
    const raw0 = cell?.raw ?? (cell?.value == null ? "" : String(cell.value));
    if (String(raw0).startsWith("=")) { nextHit(); return; } // skip formulas
    if (!findText) return;

    const re = new RegExp(escapeRegExp(findText), matchCase ? "" : "i"); // first occurrence only
    const newRaw = String(raw0).replace(re, replaceText);

    pushHistory();
    setCells(prev => {
      const copy = { ...prev };
      setCellRaw(copy, id, newRaw);
      evaluateAndUpdate(copy, id);
      return copy;
    });
    setTimeout(nextHit, 0); // advance after state flush
  }
  function replaceAll() {
    if (!findHits.length || !findText) return;
    const re = new RegExp(escapeRegExp(findText), matchCase ? "g" : "gi");

    pushHistory();
    setCells(prev => {
      const copy = { ...prev };
      let touched = false;
      for (const { id } of findHits) {
        const cell = copy[id];
        const raw0 = cell?.raw ?? (cell?.value == null ? "" : String(cell?.value));
        if (String(raw0).startsWith("=")) continue; // skip formulas
        const newRaw = String(raw0).replace(re, replaceText);
        if (newRaw !== String(raw0)) {
          setCellRaw(copy, id, newRaw);
          touched = true;
        }
      }
      if (touched) evaluateAndUpdate(copy);
      return copy;
    });
  }
  function clearFind() {
    setFindText("");
    setReplaceText("");
    setFindHits([]);
    setHitIndex(0);
  }

  /** Insert/Delete helpers (rebase cells & formats) */
  function anchorRC() {
    const id = selectedRef.current;
    if (!id) return null;
    return tryParseId(id);
  }
  function rebaseCellsAndFormats(
    transform: (r: number, c: number) => { r: number | null; c: number | null } | null
  ) {
    const nextCells: Record<string, CellValue> = {};
    for (const [id, val] of Object.entries(cells)) {
      const pos = tryParseId(id); if (!pos) continue;
      const t = transform(pos.row, pos.col);
      if (!t || t.r == null || t.c == null) continue;
      const nid = cellId(t.r, t.c);
      nextCells[nid] = val;
    }
    const nextFmt: typeof formats = {};
    for (const [id, fmt] of Object.entries(formats)) {
      const pos = tryParseId(id); if (!pos) continue;
      const t = transform(pos.row, pos.col);
      if (!t || t.r == null || t.c == null) continue;
      const nid = cellId(t.r, t.c);
      nextFmt[nid] = fmt;
    }
    setCells(nextCells);
    setFormats(nextFmt);
  }
  function insertRowAt(idx: number, count = 1) {
    pushHistory();
    setRowCount(rc => rc + count);
    rebaseCellsAndFormats((r, c) => (r >= idx ? { r: r + count, c } : { r, c }));
    const p = anchorRC();
    if (p) { selectedRef.current = cellId(idx, p.col); setRange({ r1: idx, c1: p.col, r2: idx, c2: p.col }); }
  }
  function deleteRowAt(idx: number, count = 1) {
    if (rowCount <= 1) return;
    pushHistory();
    const last = Math.min(rowCount - 1, idx + count - 1);
    const dropMin = idx, dropMax = last;
    rebaseCellsAndFormats((r, c) => {
      if (r < dropMin) return { r, c };
      if (r > dropMax) return { r: r - (dropMax - dropMin + 1), c };
      return null;
    });
    setRowCount(rc => Math.max(1, rc - (last - idx + 1)));
    const p = anchorRC();
    if (p) { const nr = Math.min(idx, rowCount - 2); selectedRef.current = cellId(Math.max(0, nr), p.col); }
  }
  function insertColAt(idx: number, count = 1) {
    pushHistory();
    setColCount(cc => cc + count);
    setColWidths(prev => {
      const copy = [...prev];
      for (let k = 0; k < count; k++) copy.splice(idx, 0, COL_WIDTH);
      return copy;
    });
    rebaseCellsAndFormats((r, c) => (c >= idx ? { r, c: c + count } : { r, c }));
    const p = anchorRC();
    if (p) { selectedRef.current = cellId(p.row, idx); setRange({ r1: p.row, c1: idx, r2: p.row, c2: idx }); }
  }
  function deleteColAt(idx: number, count = 1) {
    if (colCount <= 1) return;
    pushHistory();
    const last = Math.min(colCount - 1, idx + count - 1);
    const dropMin = idx, dropMax = last;
    setColWidths(prev => {
      const copy = [...prev];
      copy.splice(idx, last - idx + 1);
      return copy.length ? copy : [COL_WIDTH];
    });
    rebaseCellsAndFormats((r, c) => {
      if (c < dropMin) return { r, c };
      if (c > dropMax) return { r, c: c - (dropMax - dropMin + 1) };
      return null;
    });
    setColCount(cc => Math.max(1, cc - (last - idx + 1)));
    const p = anchorRC();
    if (p) { const nc = Math.min(idx, colCount - 2); selectedRef.current = cellId(p.row, Math.max(0, nc)); }
  }
  

  /** Fill-handle helpers */
  function startFillDrag(srcRect: { r1: number; c1: number; r2: number; c2: number }, startEvt: MouseEvent) {
    fillStartRangeRef.current = { ...srcRect };
    fillDraggingRef.current = true;
    setFillPreviewRange(srcRect);

    const onMove = (ev: MouseEvent) => {
      const grid = gridRef.current;
      if (!grid || !fillStartRangeRef.current) return;
      const rect = grid.getBoundingClientRect();
      const scrollLeft = grid.scrollLeft;
      const scrollTopLocal = grid.scrollTop;

      const x = ev.clientX - rect.left + scrollLeft;
      const y = ev.clientY - rect.top + scrollTopLocal;

      // x -> column
      let acc = 0;
      let targetCol = 0;
      for (let i = 0; i < colCount; i++) {
        const w = colWidths[i] ?? COL_WIDTH;
        if (x < acc + w) { targetCol = i; break; }
        acc += w;
        if (i === colCount - 1) targetCol = colCount - 1;
      }

      // y -> row (minus header)
      const yInside = y - COL_HEADER_HEIGHT;
      let targetRow = Math.floor(yInside / ROW_HEIGHT);
      if (targetRow < 0) targetRow = 0;
      if (targetRow > rowCount - 1) targetRow = rowCount - 1;

      const src = fillStartRangeRef.current;
      const r1 = Math.min(src.r1, targetRow);
      const r2 = Math.max(src.r2, targetRow);
      const c1 = Math.min(src.c1, targetCol);
      const c2 = Math.max(src.c2, targetCol);
      const preview = { r1, c1, r2, c2 };
      fillPreviewRef.current = preview;
      setFillPreviewRange(preview);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      completeFill();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    startEvt.preventDefault();
  }
 
  
  function completeFill() {
    if (!fillDraggingRef.current) return;
    fillDraggingRef.current = false;
    const src = fillStartRangeRef.current;
    const preview = fillPreviewRef.current;
    fillStartRangeRef.current = null;
    fillPreviewRef.current = null;
    setFillPreviewRange(null);

    if (!src || !preview) return;
    if (src.r1 === preview.r1 && src.c1 === preview.c1 && src.r2 === preview.r2 && src.c2 === preview.c2) return;

    pushHistory();
    setCells(prev => {
      const next = { ...prev };
      const srcRows = src.r2 - src.r1 + 1;
      const srcCols = src.c2 - src.c1 + 1;

      for (let r = preview.r1; r <= preview.r2; r++) {
        for (let c = preview.c1; c <= preview.c2; c++) {
          const sr = src.r1 + ((r - preview.r1) % srcRows + srcRows) % srcRows;
          const sc = src.c1 + ((c - preview.c1) % srcCols + srcCols) % srcCols;
          const sid = cellId(sr, sc);
          const did = cellId(r, c);
          const raw = next[sid]?.raw ?? "";
          setCellRaw(next, did, raw);
          evaluateAndUpdate(next, did);
        }
      }
      return next;
    });
  }

  /** Render helpers */
  
  const allCols = Array.from({ length: colCount }, (_, c) => c);
  const allRows = Array.from({ length: rowCount }, (_, r) => r);
const cellBase: React.CSSProperties = {
  border: `1px solid ${pal.border}`,
  padding: 4,
  boxSizing: "border-box",
  height: ROW_HEIGHT,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  display: "flex",
  alignItems: "center",
  fontSize: 13,
  background: pal.surface,
  color: pal.text,
};

  function renderCell(r: number, c: number, keyOverride?: string) {
    const id = cellId(r, c);
    const isSelected = selectedRef.current === id;
   const rectBg = range && inRect(r, c, range) && editing !== id
   ? pal.selectionFill
   : (isSelected ? pal.selectionFill : pal.surface);
    const display = cells[id]?.value ?? "";
    

    // LEFT sticky only (freeze first column)
    const isLeftSticky = freezeFirstCol && c === 0;
     

    // formatting for this cell
    const fmt = formats[id] || {};
    const fontWeight = fmt.bold ? 600 : 400;
    const fontStyle = fmt.italic ? "italic" : "normal";
    const textAlign: React.CSSProperties["textAlign"] = fmt.align ?? "left";

    // conditional + manual + find highlight
    // ---- Conditional Formatting (user-defined + default numeric) ----
// ---- Conditional Formatting (user-defined + default numeric) ----
let condBg: string | undefined;
if (condEnabled && rules.length > 0 && display !== "" && display != null) {
  for (const rule of rules) {
    const vStr = String(display ?? "");
    const vNum = Number(vStr);
    const ruleNum = Number(rule.value);

    // Skip if rule value is empty → prevents full-sheet coloring
    if (rule.value === "" || rule.value == null) continue;

    let match = false;
    if (rule.condition === "greater" && !Number.isNaN(vNum) && !Number.isNaN(ruleNum) && vNum > ruleNum) match = true;
    else if (rule.condition === "less" && !Number.isNaN(vNum) && !Number.isNaN(ruleNum) && vNum < ruleNum) match = true;
    else if (rule.condition === "equal" && vStr === String(rule.value)) match = true;
    else if (
      rule.condition === "contains" &&
      rule.value.trim() !== "" &&
      vStr.toLowerCase().includes(String(rule.value).toLowerCase())
    )
      match = true;

    if (match) {
      condBg = rule.color;
      break;
    }
  }

  if (!condBg && rules.length === 0 && condEnabled) {
  condBg = getConditionalBg(display);
}
}
    const isFindHit = !!findText && findHitSet.has(id);
   const background = rectBg !== pal.surface
   ? rectBg
   : (fmt.bg ?? condBg ?? (isFindHit ? (theme === "dark" ? "#7c2d12" : "#fff7ed") : pal.surface));

    const color = fmt.color ?? undefined;

    // Number-format display
    // Number-format display (uses fmt.decimals)
// Number-format display (robust)
let displayText: any = display;
try {
  if (fmt.numFmt && display != null && display !== "") {
    const decimals = fmt.decimals ?? 2;

    // parse numeric safely (accept numbers or numeric strings with commas)
    const asNum = (v: unknown) => {
      if (typeof v === "number") return v;
      const s = String(v).replace(/,/g, "");
      const n = Number(s);
      return Number.isNaN(n) ? null : n;
    };

    if (fmt.numFmt === "number") {
      const n = asNum(display);
      if (n !== null) {
        displayText = new Intl.NumberFormat(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(n);
      }
    } else if (fmt.numFmt === "currency") {
      const n = asNum(display);
      if (n !== null) {
        const sym = fmt.currency || "₹";
        const core = new Intl.NumberFormat(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(n);
        displayText = `${sym}${core}`;
      }
    } else if (fmt.numFmt === "percent") {
      const n = asNum(display);
      if (n !== null) {
        const pct = n * 100;
        const core = new Intl.NumberFormat(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(pct);
        displayText = `${core}%`;
      }
    } else if (fmt.numFmt === "date") {
      // Accept: JS timestamp number, ISO string, or dd/mm/yyyy-like strings
      let d: Date | null = null;

      if (typeof display === "number") {
        d = new Date(display);
      } else {
        const s = String(display).trim();

        // try native Date
        const d1 = new Date(s);
        if (!Number.isNaN(d1.getTime())) d = d1;
        else {
          // simple dd/mm/yyyy or dd-mm-yyyy
          const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
          if (m) {
            const dd = parseInt(m[1], 10);
            const mm = parseInt(m[2], 10) - 1;
            const yy = parseInt(m[3], 10);
            const d2 = new Date(yy, mm, dd);
            if (!Number.isNaN(d2.getTime())) d = d2;
          }
        }
      }

      if (d && !Number.isNaN(d.getTime())) {
        displayText = new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
        }).format(d);
      }
    }
  }
} catch {
  // leave 
  // as-is on any error
}
    return (
      <div
        key={keyOverride ?? id}
        onMouseDown={() => {
          const pos = parseId(id); if (!pos) return;
          setRange({ r1: pos.row, c1: pos.col, r2: pos.row, c2: pos.col });
          selectedRef.current = id;
          draggingRef.current = true;
          const onUp = () => { draggingRef.current = false; window.removeEventListener("mouseup", onUp); };
          window.addEventListener("mouseup", onUp);
        }}
        onMouseEnter={() => {
          if (!draggingRef.current || !range) return;
          const pos = parseId(id); if (!pos) return;
          setRange(prev => prev ? { ...prev, r2: pos.row, c2: pos.col } : prev);
        }}
        onDoubleClick={() => onEdit(id)}
        onClick={(e) => {
          if (e.shiftKey && selectedRef.current) {
            const a = parseId(selectedRef.current);
            const b = parseId(id);
            if (a && b) { setRange({ r1: a.row, c1: a.col, r2: b.row, c2: b.col }); return; }
          }
          if (selectedRef.current === id && editing !== id) {
            setEditing(id);
            setFormulaBar(cells[id]?.raw ?? (cells[id]?.value?.toString() ?? ""));
          } else onSelect(id);
        }}
        style={{
  ...cellBase,
  // make position depend on whether this is the frozen first col
  position: isLeftSticky ? "sticky" : "relative",
  left: isLeftSticky ? 0 : undefined,
  zIndex: isLeftSticky ? 7 : undefined,
  boxShadow: isLeftSticky ? "inset -1px 0 #e3e3e3" : undefined,

  width: colWidths[c],
  background,
  color,
  fontWeight,
  fontStyle,
  justifyContent:
    textAlign === "left" ? "flex-start" :
    textAlign === "center" ? "center" : "flex-end",
  textAlign,
  outline: isSelected ? "2px solid #3b82f6" : "none",
  outlineOffset: -2,
    fontSize: fmt.fontSize ? `${fmt.fontSize}px` : "13px",
    fontFamily: fmt.fontFamily || "Arial, sans-serif",
    border: fmt.border ?? `1px solid ${pal.border}`,

}}

      >
   {editing === id ? (
  <input
    autoFocus
    style={{
      width: "100%",
      height: "100%",
      border: "none",
      outline: "none",
      fontSize: 13,
      textAlign,
      background: theme === "dark" ? "#1e293b" : "#ffffff", // dark: slate background, light: white
      color: theme === "dark" ? "#f1f5f9" : "#0f172a",        // dark: light text, light: dark text
      padding: "0 4px",
      borderRadius: 2,
    }}
    value={formulaBar}
    onChange={(e) => setFormulaBar(e.target.value)}
    onBlur={() => commitEdit(id, formulaBar)}
    onKeyDown={(e) => {
      if (e.key === "Enter") commitEdit(id, formulaBar);
      else if (e.key === "Escape") { setEditing(null); setFormulaBar(""); }
    }}
  />
) : (
  <span>{displayText as any}</span>
)}


        {/* Fill handle */}
        {isSelected && editing !== id && (
          <div
            onMouseDown={(e) => {
              const src = range ?? (() => {
                const p = parseId(id)!;
                return { r1: p.row, c1: p.col, r2: p.row, c2: p.col };
              })();
              startFillDrag(src, e.nativeEvent);
            }}
            title="Drag to fill"
            style={{
              position: "absolute",
              right: 2,
              bottom: 2,
              width: 8,
              height: 8,
              border: "1px solid #0f48f1ff",
              background: "#1a68efff",
              cursor: "crosshair",
              zIndex: 10,
            }}
          />
        )}
      </div>
    );
  }
  // Detect current format of the selected cell (for dropdown)
const currentFmt =
  (selectedRef.current && formats[selectedRef.current]?.numFmt) || "general";

  return (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",     // <-- important
      width: "100%",
      overflow: "hidden",
    }}
  >
{/* Ribbon (sticky header) */}
<div
  className="sticky top-0 z-20 border-b backdrop-blur"
  style={{
    background: pal.surfaceAlt,
    color: pal.text,
    borderColor: pal.border
  }}
>
  {/* Tabs row */}
  <div
    className="flex items-center justify-between px-3 py-2"
    style={{ borderBottom: `1px solid ${pal.border}` }}
  >
    <div className="flex items-center gap-6">
      {(["home", "insert", "view"] as const).map((t) => {
        const active = ribbonTab === t;
        const label = t === "home" ? "Home" : t[0].toUpperCase() + t.slice(1);
        return (
          <button
            key={t}
            onClick={() => setRibbonTab(t)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${active ? pal.selection : pal.border}`,
              background: active ? pal.selection : pal.surface,
              color: active ? "#fff" : pal.text,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>

    {/* Theme + (you can add extra quick actions here if you want) */}
    <div className="flex items-center gap-2" />
  </div>

  {/* HOME TAB CONTENT — this is your existing toolbar, unchanged in logic */}
  {ribbonTab === "home" ? (
    <div
      className="px-3 py-2"
      style={{
        background: pal.surfaceAlt,
        color: pal.text,
        borderColor: pal.border
      }}
    >
      <div
        className="flex flex-wrap items-center gap-2"
        style={{
          background: pal.surface,
          color: pal.text,
          border: `1px solid ${pal.border}`,
          borderRadius: 8,
          padding: 8,
        }}
      >
        {/* A) Name chip + Formula bar (unchanged) */}
        <span
          className="toolbar-chip"
          style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
        >
          {`${sheetName}${selectedRef.current ? ` • ${selectedRef.current}` : ""}`}
        </span>
{/* Enhanced Formula Bar */}
<div
  style={{
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minWidth: "650px", // ✅ wider default
    maxWidth: "100%",
  }}
>
  <input
    className="formula-bar w-full max-w-[950px]" // ✅ longer, animated
    value={formulaBar}
    onChange={(e) => setFormulaBar(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter" && selectedRef.current) {
        commitEdit(selectedRef.current, formulaBar);
      }
    }}
    placeholder="Type value or =formula"
  />
</div>


        {/* C) Freeze + Insert/Delete + Conditional Format (unchanged) */}
      {/* C) Freeze + Insert/Delete + Conditional Format */}  
<div className="flex items-center gap-2">
  
  {/* 🎨 Conditional Formatting Controls */}
  <div className="flex items-center gap-2">
    <button
      onClick={() => setShowCondModal(true)}
      className="toolbar-btn"
      style={{
        border: `1px solid ${pal.border}`,
        background: pal.surface,
        color: pal.text,
      }}
    >
      ✨ Conditional Format
    </button>

    {/* 🟢 Toggle switch for ON/OFF */}
    <label className="toggle-switch">
      <input
        type="checkbox"
        checked={condEnabled}
        onChange={(e) => setCondEnabled(e.target.checked)}
      />
      <span className="slider" />
      <span className="toggle-label">{condEnabled ? "ON" : "OFF"}</span>
    </label>
  </div>

  <button
    className={`toolbar-btn ${freezeTopRow ? "active" : ""}`}
    onClick={() => {
      pushHistory();
      setFreezeTopRow((v) => !v);
    }}
  >
    {freezeTopRow ? "🧊 Unfreeze Top Row" : "❄️ Freeze Top Row"}
  </button>

  <button
    className={`toolbar-btn ${freezeFirstCol ? "active" : ""}`}
    onClick={() => {
      pushHistory();
      setFreezeFirstCol((v) => !v);
    }}
  >
    {freezeFirstCol ? "🧊 Unfreeze First Column" : "❄️ Freeze First Column"}
  </button>

  <button
    className="toolbar-btn"
    style={{
      background: pal.surface,
      color: pal.text,
      border: `1px solid ${pal.border}`,
    }}
    title="+ Row"
    onClick={() => {
      const p = anchorRC();
      if (!p) return;
      insertRowAt(p.row);
    }}
  >
    ➕ Row
  </button>

  <button
    className="toolbar-btn danger"
    title="− Row"
    onClick={() => {
      const p = anchorRC();
      if (!p) return;
      deleteRowAt(p.row);
    }}
  >
    🗑️− Row
  </button>
  <button
    className="toolbar-btn"
    style={{
      background: pal.surface,
      color: pal.text,
      border: `1px solid ${pal.border}`,
    }}
    title="+ Col"
    onClick={() => {
      const p = anchorRC();
      if (!p) return;
      insertColAt(p.col);
    }}
  >
    ➕  Col
  </button>

  <button
    className="toolbar-btn danger"
    title="− Col"
    onClick={() => {
      const p = anchorRC();
      if (!p) return;
      deleteColAt(p.col);
    }}
  >
    🗑️ − Col
  </button>
</div>

        {/* 🎨 Font & Text Controls */}
<div className="flex items-center gap-3">

  {/* Font Size */}
  <div className="flex items-center gap-2">
    <label
      style={{
        fontSize: 13,
        color: pal.textMuted,
        userSelect: "none",
      }}
    >
      Font Size:
    </label>

    <select
      className="format-btn font-size-btn"
      onChange={(e) => window.setFontSize?.(parseInt(e.target.value))}
      defaultValue={13}
    >
      {[8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72].map(
        (size) => (
          <option key={size} value={size}>
            {size}
          </option>
        )
      )}
    </select>
  </div>

  {/* Text Style Buttons */}
  <div className="flex items-center gap-2">
    <button
      className="format-btn"
      title="Bold"
      onClick={toggleBold}
    >
      <b>B</b>
    </button>
    <button
      className="format-btn"
      title="Italic"
      onClick={toggleItalic}
    >
      <i>I</i>
    </button>
    <button
      className="format-btn"
      title="Align Left"
      onClick={() => setAlign("left")}
    >
      ⟸
    </button>
    <button
      className="format-btn"
      title="Align Center"
      onClick={() => setAlign("center")}
    >
      ≡
    </button>
    <button
      className="format-btn"
      title="Align Right"
      onClick={() => setAlign("right")}
    >
      ⟹
    </button>
  </div>

  {/* Color Pickers (unchanged) */}
  <div className="flex items-center gap-2">
    <label className="text-xs flex items-center gap-1.5">
      <span>Fill</span>
      <input
        type="color"
        className="h-8 w-10 rounded-md border border-slate-300 dark:border-slate-700"
        onChange={(e) => setBg(e.target.value)}
      />
    </label>

    <label className="text-xs flex items-center gap-1.5">
      <span>Text</span>
      <input
        type="color"
        className="h-8 w-10 rounded-md border border-slate-300 dark:border-slate-700"
        onChange={(e) => setColor(e.target.value)}
      />
    </label>
  </div>
</div>

<span className="toolbar-sep" />


        {/* E) Number format (General/Number/Currency/Percent/Date) (unchanged) */}
        <div className="flex items-center gap-2">
          <select
            title="Number Format"
            className="toolbar-input"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            value={currentFmt}
            onChange={(e) => setNumFmt(e.target.value as any)}
          >
            <option value="general">General</option>
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
            <option value="date">Date</option>
          </select>

          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} title="Increase Decimals" onClick={() => incDecimals(1)}>+.0</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} title="Decrease Decimals" onClick={() => incDecimals(-1)}>-.0</button>

          <input
            className="toolbar-input w-14"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            title="Currency Symbol"
            placeholder="₹ $ €"
            onChange={(e) => setCurrencySymbol(e.target.value.trim())}
          />
        </div>

        <span className="toolbar-sep" />

        {/* F) Find / Replace (unchanged) */}
        <div className="flex items-center gap-2" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}`, padding: 4, borderRadius: 6 }}>
          <input
            className="toolbar-input w-40"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Find…"
          />
          <input
            className="toolbar-input w-40"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Replace…"
          />
          <label className="text-xs flex items-center gap-2 px-2 py-1">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            Match case
          </label>
          <div className="toolbar-btn-group">
  <button className="toolbar-btn" onClick={prevHit} title="Previous">Prev</button>
  <button className="toolbar-btn" onClick={nextHit} title="Next">Next</button>
  <button className="toolbar-btn" onClick={replaceCurrent} title="Replace current">Replace</button>
  <button className="toolbar-btn" onClick={replaceAll} title="Replace all">Replace All</button>
  <button className="toolbar-btn" onClick={clearFind} title="Clear search">Clear</button>
</div>

          <span className="text-xs" style={{ color: pal.text }}>
            {findHits.length ? `${hitIndex + 1}/${findHits.length}` : "0 results"}
          </span>
        </div>
      </div>
    </div>
  ) : (
    /* Non-Home tabs: simple placeholder without changing logic */
    <div className="px-3 py-3" style={{ background: pal.surfaceAlt, color: pal.text }}>
   {/* ===== Insert Tab (replace your current insert tab block) ===== */}
{/* ===== Insert Tab (Improved with sheet name + formula bar) ===== */}
{ribbonTab === "insert" && (
  <div
    style={{
      display: "flex",
      gap: 16,
      alignItems: "center",
      flexWrap: "wrap",
      padding: 8,
      background: pal.surface,
      borderRadius: 8,
      border: `1px solid ${pal.border}`,
    }}
  >
    {/* 🧾 Name chip + Formula Bar (same as Home tab) */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flex: 1,
        minWidth: "650px",
        justifyContent: "center",
      }}
    >
      {/* Sheet name + cell indicator */}
      <span
        className="toolbar-chip"
        style={{
          background: pal.surface,
          color: pal.text,
          border: `1px solid ${pal.border}`,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {`${sheetName}${selectedRef.current ? ` • ${selectedRef.current}` : ""}`}
      </span>

      {/* Formula Bar */}
      <input
        className="formula-bar w-full max-w-[950px]"
        style={{
          flex: 1,
          border: `1px solid ${pal.border}`,
          borderRadius: 6,
          padding: "6px 10px",
          background: pal.surfaceAlt,
          color: pal.text,
          transition: "all 0.2s ease",
        }}
        value={formulaBar}
        onChange={(e) => setFormulaBar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && selectedRef.current) {
            commitEdit(selectedRef.current, formulaBar);
          }
        }}
        placeholder="Type value or =formula"
      />
    </div>

    {/* 🕒 Time Group: Insert Date / DateTime */}
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: pal.surfaceAlt,
        borderRadius: 6,
        padding: "8px 10px",
        border: `1px solid ${pal.border}`,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
        Time
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => {
            const sel = selectedRef.current;
            if (!sel) return alert("Select a cell first");
            insertCurrentDateTime(false);
          }}
        >
          📅 Insert Date
        </button>

        <button
          type="button"
          className="toolbar-btn"
          onClick={() => {
            const sel = selectedRef.current;
            if (!sel) return alert("Select a cell first");
            insertCurrentDateTime(true);
          }}
        >
          ⏰ Insert DateTime
        </button>
        <button
  type="button"
  className="toolbar-btn"
  onClick={() => setShowShapesModal(true)}
>
  ➕ Insert Shapes
</button>

        <button
          type="button"
          className="toolbar-btn"
          onClick={() => {
            if (!range) return alert("Select a data range first");
            setShowPivotModal(true);
          }}
        >
          

          📊 Pivot Table
        </button>
        <button
  type="button"
  className="toolbar-btn"
  onClick={() => setShowTableModal(true)}
>
  📋 Insert Table
</button>


      </div>
    </div>
    {/* 🎨 Font Selector (opens modal) */}
<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: pal.surfaceAlt,
    borderRadius: 8,
    padding: 10,
    border: `1px solid ${pal.border}`,
    minWidth: 260,
  }}
>
  <div style={{ fontSize: 12, fontWeight: 700, color: pal.text }}>Text Fonts</div>

  <button
    onClick={() => setShowFontModal(true)}
    style={{
      padding: "8px 12px",
      borderRadius: 8,
      border: `1px solid ${pal.border}`,
      background: pal.surface,
      color: pal.text,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s ease",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = "translateY(-1px)";
      e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "none";
    }}
  >
    🖋️ Choose Font
  </button>
</div>

  </div>
)}



    </div>
  )}
</div>
{/* ===== View Tab ===== */}
{ribbonTab === "view" && (
  <div
    style={{
      display: "flex",
      gap: 16,
      alignItems: "center",
      flexWrap: "wrap",
      padding: 8,
      background: pal.surface,
      borderRadius: 8,
      border: `1px solid ${pal.border}`,
    }}
  >
    {/* 🧾 Sheet name + Cell Indicator + Formula Bar */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flex: 1,
        minWidth: "650px",
        justifyContent: "center",
      }}
    >
      {/* Sheet name + cell indicator */}
      <span
        className="toolbar-chip"
        style={{
          background: pal.surface,
          color: pal.text,
          border: `1px solid ${pal.border}`,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {`${sheetName}${selectedRef.current ? ` • ${selectedRef.current}` : ""}`}
      </span>

      {/* Formula Bar */}
      <input
        className="formula-bar w-full max-w-[950px]"
        style={{
          flex: 1,
          border: `1px solid ${pal.border}`,
          borderRadius: 6,
          padding: "6px 10px",
          background: pal.surfaceAlt,
          color: pal.text,
          transition: "all 0.2s ease",
        }}
        value={formulaBar}
        onChange={(e) => setFormulaBar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && selectedRef.current) {
            commitEdit(selectedRef.current, formulaBar);
          }
        }}
        placeholder="Type value or =formula"
      />
    </div>

      {/* 👁 View Options (with working zoom) */}

{/* 👁 View Options (Zoom in dialog) */}
<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: pal.surfaceAlt,
    borderRadius: 6,
    padding: "10px 12px",
    border: `1px solid ${pal.border}`,
    minWidth: 240,
  }}
>
  <div style={{ fontSize: 12, fontWeight: 700, color: pal.text }}>
    View Options
  </div>

  {/* Single Zoom Options Button */}
  <button
    className="toolbar-btn"
    style={{
      background: pal.surface,
      color: pal.text,
      border: `1px solid ${pal.border}`,
      padding: "6px 12px",
      borderRadius: 6,
      cursor: "pointer",
      transition: "all 0.2s ease",
    }}
    onClick={() => setShowZoomModal(true)}
  >
    🔍 Zoom Options
  </button>
  {/* Formula Functions Button */}
<button
  className="toolbar-btn"
  style={{
    background: pal.surface,
    color: pal.text,
    border: `1px solid ${pal.border}`,
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 0.2s ease",
  }}
  onClick={() => setShowFormulaModal(true)}
>
  🧮 Formula Functions
</button>

</div>


    
  </div>
)}






  {/* Body (fills the rest) */}
  <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
    {/* Row header rail (left) */}
   <div style={{ width: 50, borderRight: `1px solid ${pal.border}`, background: pal.surfaceAlt }}>
  <div style={{ height: COL_HEADER_HEIGHT, borderBottom: `1px solid ${pal.border}`, background: pal.surfaceAlt }} />
  <div style={{ height: "100%", overflow: "hidden", position: "relative" }}>
    <div style={{ transform: `translateY(-${scrollTop}px)` }}>
      {allRows.map(r => (
        <div key={r} style={{
          border: `1px solid ${pal.border}`,
          boxSizing: "border-box",
          height: ROW_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 500,
          background: pal.surfaceAlt,
          color: pal.text
        }}>
          {r + 1}
        </div>
      ))}
    </div>
  </div>
</div>


    {/* Grid scroller (the ONLY scrollable area) */}
    <div
      ref={gridRef}
      onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "auto",
         background: pal.surface,
        position: "relative"
      }}
    >
      <div style={{ width: totalWidth }}>
        {/* Column headers (sticky only inside scroller) */}
       <div
  style={{
    display: "flex",
    borderBottom: `1px solid ${pal.border}`,
    height: COL_HEADER_HEIGHT,
    background: pal.surfaceAlt,   // ← white in light, slate in dark
    position: "sticky",
    top: 0,
    zIndex: 9
  }}
>

          {allCols.map(c => (
            <div
              key={c}
              style={{
                border: `1px solid ${pal.border}`,
background: pal.surfaceAlt,
color: pal.text,

                boxSizing: "border-box",
                height: 28,
                width: colWidths[c],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                userSelect: "none",
                
                position: "relative",
                transform: `scale(${zoom})`,
transformOrigin: "top left",

              }}
            >
              {colIndexToName(c)}
              <div
                onMouseDown={(e) => startColDrag(c, e.clientX)}
                onDoubleClick={() => autoFitColumn(c)}
                title="Drag to resize • Double-click to Auto-fit"
                style={{ position: "absolute", top: 0, right: 0, width: 6, height: "100%", cursor: "col-resize" }}
              />
              <div style={{ position: "absolute", top: 4, right: 0, width: 1, height: 20, background: "#ddd", pointerEvents: "none" }} />
            </div>
          ))}
        </div>

        {/* Grid rows */}
        <div>
          {allRows.map(r => {
            const isTopRow = freezeTopRow && r === 0;
            return (
              <div
                key={r}
                style={{
                  display: "flex",
                  position: isTopRow ? "sticky" as const : undefined,
                  top: isTopRow ? 28 : undefined,
                  zIndex: isTopRow ? 8 : undefined,
                  background: isTopRow ? pal.surface : undefined,
                  boxShadow: isTopRow ? `inset 0 -1px ${pal.border}` : undefined,
                }}
              >
                {allCols.map(c => renderCell(r, c))}
              </div>
              
            );
            
          })}
        </div>
        {/* === SHAPES LAYER === */}
{/* === SHAPES LAYER (with dragging) === */}
{/* === SHAPES LAYER (drag + resize + select) === */}
{shapes.map((s) => {
  const isSelected = s.id === selectedShapeId;

  return (
    <div
      key={s.id}
       
  data-shape
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).dataset.handle) return;
        e.stopPropagation();
        setSelectedShapeId(s.id);

        // drag logic
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = s.x;
        const origY = s.y;

        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          setShapes((prev) =>
            prev.map((sh) =>
              sh.id === s.id ? { ...sh, x: origX + dx, y: origY + dy } : sh
            )
          );
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      style={{
        position: "absolute",
        left: s.x,
        top: s.y,
        width: s.width,
        height: s.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "move",
        pointerEvents: "auto",
        zIndex: isSelected ? 60 : 50,
        userSelect: "none",
        boxShadow: isSelected ? "0 0 0 2px #3b82f6" : "none",
        borderRadius: 4,
        transition: "box-shadow 0.15s ease",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 60"
        style={{ fill: s.color, opacity: 0.85, pointerEvents: "none" }}
      >
        {s.type === "rect" && <rect x="0" y="0" width="100" height="60" rx="6" />}
        {s.type === "circle" && <circle cx="50" cy="30" r="25" />}
        {s.type === "triangle" && <path d="M10 55 L50 5 L90 55 Z" />}
        {s.type === "arrow" && (
          <path
            d="M10 30 H70 L60 20 M70 30 L60 40"
            stroke="#fff"
            strokeWidth="4"
            fill="none"
          />
        )}
        {s.type === "line" && (
          <line x1="10" y1="30" x2="90" y2="30" stroke="#fff" strokeWidth="4" />
        )}
        {s.type === "diamond" && <path d="M50 5 L95 30 L50 55 L5 30 Z" />}
        {s.type === "star" && (
          <path d="M50 5 L60 25 L85 25 L65 40 L75 55 L50 45 L25 55 L35 40 L15 25 L40 25 Z" />
        )}
        {s.type === "heart" && (
          <path d="M50 55 C20 25, 20 5, 50 25 C80 5, 80 25, 50 55 Z" />
        )}
        {s.type === "cloud" && (
          <path d="M20 40 a20,20 0 1,0 10,-30 a15,15 0 1,0 10,30 Z" />
        )}
        {s.type === "textbox" && (
          <>
            <rect x="0" y="0" width="100" height="60" rx="6" />
            <text
              x="50%"
              y="55%"
              textAnchor="middle"
              fontSize="12"
              fill="#fff"
            >
              Text
            </text>
          </>
        )}
      </svg>

      {/* Show resize handles only if selected */}
      {isSelected &&
        [
          { pos: "tl", x: 0, y: 0, cursor: "nwse-resize" },
          { pos: "tr", x: "100%", y: 0, cursor: "nesw-resize" },
          { pos: "bl", x: 0, y: "100%", cursor: "nesw-resize" },
          { pos: "br", x: "100%", y: "100%", cursor: "nwse-resize" },
          { pos: "tm", x: "50%", y: 0, cursor: "ns-resize" },
          { pos: "bm", x: "50%", y: "100%", cursor: "ns-resize" },
          { pos: "ml", x: 0, y: "50%", cursor: "ew-resize" },
          { pos: "mr", x: "100%", y: "50%", cursor: "ew-resize" },
        ].map((h) => (
          <div
            key={h.pos}
            data-handle
            onMouseDown={(e) => {
              e.stopPropagation();
              const startX = e.clientX;
              const startY = e.clientY;
              const orig = { ...s };

              const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                setShapes((prev) =>
                  prev.map((sh) => {
                    if (sh.id !== s.id) return sh;
                    let { x, y, width, height } = orig;
                    switch (h.pos) {
                      case "tl": x += dx; y += dy; width -= dx; height -= dy; break;
                      case "tr": y += dy; width += dx; height -= dy; break;
                      case "bl": x += dx; width -= dx; height += dy; break;
                      case "br": width += dx; height += dy; break;
                      case "tm": y += dy; height -= dy; break;
                      case "bm": height += dy; break;
                      case "ml": x += dx; width -= dx; break;
                      case "mr": width += dx; break;
                    }
                    width = Math.max(30, width);
                    height = Math.max(20, height);
                    return { ...sh, x, y, width, height };
                  })
                );
              };
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            style={{
              position: "absolute",
              left: h.x,
              top: h.y,
              transform: "translate(-50%, -50%)",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#3b82f6",
              cursor: h.cursor,
              zIndex: 70,
            }}
          />
        ))}
    </div>
  );
})}

{/* Clear selection when clicking empty space */}
{/* Clear selection when clicking empty area (below shapes, above grid) */}
{/* Clear selection only when a shape is selected */}
{selectedShapeId && (
  <div
    onMouseDown={(e) => {
      // Only clear if not clicking a shape or handle
      if (!(e.target as HTMLElement).closest("[data-shape]")) {
        setSelectedShapeId(null);
      }
    }}
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 1,
      cursor: "default",
      background: "transparent",
    }}
  />
)}






{/* ===== Table Insert Dialog ===== */}
{showTableModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1200,
    }}
    onClick={() => setShowTableModal(false)}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: pal.surface,
        color: pal.text,
        padding: 24,
        borderRadius: 12,
        width: 320,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        border: `1px solid ${pal.border}`,
        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
      }}
    >
      <h3 style={{ margin: 0, fontSize: 16 }}>Insert Table</h3>

      <label style={{ fontSize: 13 }}>
        Rows:
        <input
          type="number"
          min={1}
          max={50}
          value={tableSize.rows}
          onChange={(e) =>
            setTableSize((prev) => ({
              ...prev,
              rows: Math.max(1, Math.min(50, +e.target.value || 1)),
            }))
          }
          style={{
            marginLeft: 8,
            padding: 6,
            width: 60,
            borderRadius: 6,
            border: `1px solid ${pal.border}`,
            background: pal.surfaceAlt,
            color: pal.text,
          }}
        />
      </label>

      <label style={{ fontSize: 13 }}>
        Columns:
        <input
          type="number"
          min={1}
          max={50}
          value={tableSize.cols}
          onChange={(e) =>
            setTableSize((prev) => ({
              ...prev,
              cols: Math.max(1, Math.min(50, +e.target.value || 1)),
            }))
          }
          style={{
            marginLeft: 8,
            padding: 6,
            width: 60,
            borderRadius: 6,
            border: `1px solid ${pal.border}`,
            background: pal.surfaceAlt,
            color: pal.text,
          }}
        />
      </label>

      <button
        className="toolbar-btn"
        onClick={() => {
          insertTable(tableSize.rows, tableSize.cols);
          setShowTableModal(false);
        }}
      >
        ✅ Insert
      </button>

      <button
        className="toolbar-btn danger"
        onClick={() => setShowTableModal(false)}
      >
        ✖ Close
      </button>
    </div>
  </div>
)}

        {showCondModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
    onClick={() => setShowCondModal(false)}
  >
    <div
      style={{
        background: pal.surface,
        color: pal.text,
        padding: 20,
        borderRadius: 10,
        width: 320,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        border: `1px solid ${pal.border}`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 style={{ margin: 0, color: pal.text }}>Add Conditional Rule</h3>

      <label style={{ fontSize: 12, color: pal.text, opacity: 0.95 }}>Condition</label>
      <select
        id="condition"
        style={{
          padding: 8,
          borderRadius: 6,
          background: pal.surface,
          color: pal.text,
          border: `1px solid ${pal.border}`,
        }}
      >
        <option value="greater">Greater than</option>
        <option value="less">Less than</option>
        <option value="equal">Equal to</option>
        <option value="contains">Contains text</option>
      </select>

      <label style={{ fontSize: 12, color: pal.text, opacity: 0.95 }}>Value / text</label>
      <input
        id="condValue"
        placeholder="Value or text"
        style={{
          padding: 8,
          borderRadius: 6,
          background: pal.surface,
          color: pal.text,
          border: `1px solid ${pal.border}`,
        }}
      />

      <label style={{ fontSize: 12, color: pal.text, opacity: 0.95 }}>Color</label>
      <input
        id="condColor"
        type="color"
        defaultValue="#fff7cc"
        style={{
          height: 40,
          width: "100%",
          borderRadius: 6,
          border: `1px solid ${pal.border}`,
          background: pal.surface,
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          onClick={() => {
            const cond = (document.getElementById("condition") as HTMLSelectElement).value;
            const val = (document.getElementById("condValue") as HTMLInputElement).value;
            const color = (document.getElementById("condColor") as HTMLInputElement).value;
            setRules((prev) => [...prev, { condition: cond, value: val, color }]);
            setCondEnabled(true);
            setShowCondModal(false);
          }}
          style={{
            padding: 8,
            background: "#2563eb",
            color: "#fff",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            flex: 1,
          }}
        >
          Add Rule
        </button>
        <button
          onClick={() => setShowCondModal(false)}
          style={{
            padding: 8,
            background: pal.surfaceAlt,
            color: pal.text,
            borderRadius: 6,
            border: `1px solid ${pal.border}`,
            cursor: "pointer",
            flex: 1,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
{/* ===== Formula Modal ===== */}
{showFormulaModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
    onClick={() => setShowFormulaModal(false)}
  >
    <div
      style={{
        background: pal.surface,
        color: pal.text,
        padding: 20,
        borderRadius: 10,
        width: 380,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        border: `1px solid ${pal.border}`,
        transition: "transform 0.2s ease",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 style={{ margin: 0, textAlign: "center" }}>🧮 Insert Formula</h3>

      <p style={{ fontSize: 13, color: pal.textMuted, textAlign: "center" }}>
        Choose a formula to insert into the selected cell:
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { name: "SUM", desc: "Total of values" },
          { name: "AVERAGE", desc: "Mean of values" },
          { name: "COUNT", desc: "Number of items" },
          { name: "MAX", desc: "Highest value" },
          { name: "MIN", desc: "Lowest value" },
        ].map((f) => (
          <button
            key={f.name}
            className="toolbar-btn"
            style={{
              background: pal.surfaceAlt,
              color: pal.text,
              border: `1px solid ${pal.border}`,
              borderRadius: 8,
              padding: "10px 8px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 12px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
            onClick={() => {
              const sel = selectedRef.current;
              if (!sel) return alert("Select a cell first");

              // Default to summing a nearby range if possible
              const formula = `=${f.name}(A1:A10)`;
              commitEdit(sel, formula);
              setShowFormulaModal(false);
            }}
          >
            {f.name}
            <div style={{ fontSize: 11, opacity: 0.7 }}>{f.desc}</div>
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowFormulaModal(false)}
        style={{
          alignSelf: "center",
          marginTop: 10,
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 6,
          padding: "6px 14px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Close
      </button>
    </div>
  </div>
)}


{/* ===== Zoom Modal ===== */}
{showZoomModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      transition: "opacity 0.2s ease",
    }}
    onClick={() => setShowZoomModal(false)}
  >
    <div
      style={{
        background: pal.surface,
        color: pal.text,
        padding: 20,
        borderRadius: 10,
        width: 360,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        border: `1px solid ${pal.border}`,
        transform: "scale(1)",
        transition: "transform 0.2s ease",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 style={{ margin: 0, color: pal.text, textAlign: "center" }}>
        🔍 Zoom Settings
      </h3>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12 }}>Zoom:</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          style={{ flex: 1, cursor: "pointer" }}
        />
        <span style={{ fontSize: 12 }}>{Math.round(zoom * 100)}%</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button
          className="toolbar-btn"
          style={{
            flex: 1,
            background: pal.surfaceAlt,
            color: pal.text,
            border: `1px solid ${pal.border}`,
          }}
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
        >
          ➕ Zoom In
        </button>
        <button
          className="toolbar-btn"
          style={{
            flex: 1,
            background: pal.surfaceAlt,
            color: pal.text,
            border: `1px solid ${pal.border}`,
          }}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
        >
          ➖ Zoom Out
        </button>
        <button
          className="toolbar-btn"
          style={{
            flex: 1,
            background: pal.surfaceAlt,
            color: pal.text,
            border: `1px solid ${pal.border}`,
          }}
          onClick={() => setZoom(1)}
        >
          🔄 Reset
        </button>
      </div>

      <button
        onClick={() => setShowZoomModal(false)}
        style={{
          alignSelf: "center",
          marginTop: 10,
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 6,
          padding: "6px 14px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Close
      </button>
    </div>
  </div>
)}

{showFontModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
    onClick={() => setShowFontModal(false)}
  >
    <div
  style={{
    background: pal.surface,
    color: pal.text,
    padding: 20,
    borderRadius: 10,
    width: 360,
    height: 420, // ✅ fixed height to prevent vertical jitter
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${pal.border}`,
    overflow: "hidden", // ✅ contain internal scroll only
  }}
  onClick={(e) => e.stopPropagation()}
>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Select Font</h3>
        <button
          style={{
            background: "transparent",
            border: "none",
            color: pal.text,
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
          onClick={() => setShowFontModal(false)}
        >
          ✕
        </button>
      </div>

      {/* ✅ Scrollable font list */}
      <div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "scroll", // ✅ always show scrollbar to prevent width shift
    paddingRight: 4,
    flex: 1,
  }}
>

        {[
          { label: "Arial", value: "Arial, Helvetica, sans-serif" },
          { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
          { label: "Segoe UI", value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
          { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
          { label: "Georgia", value: "Georgia, 'Times New Roman', Times, serif" },
          { label: "Monaco", value: "Monaco, 'Courier New', monospace" },
        ].map((f) => (
          <button
            key={f.label}
            onClick={() => {
              setFontFamily(f.value);
              setShowFontModal(false);
            }}
            style={{
              fontFamily: f.value,
              fontSize: 15,
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${pal.border}`,
              background: pal.surfaceAlt,
              color: pal.text,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = pal.selection;
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = pal.surfaceAlt;
              e.currentTarget.style.color = pal.text;
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ✅ Close button stays fixed below */}
      <button
        onClick={() => setShowFontModal(false)}
        style={{
          marginTop: 10,
          alignSelf: "flex-end",
          padding: "6px 14px",
          borderRadius: 6,
          background: pal.surfaceAlt,
          color: pal.text,
          border: `1px solid ${pal.border}`,
          cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  </div>
)}
{showShapesModal && (
  <div
    onClick={() => setShowShapesModal(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1400,
      // prevent page reflow “shake”
      willChange: "transform",
      backfaceVisibility: "hidden",
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      style={{
        width: 560,
        maxWidth: "96vw",
        maxHeight: "80vh",
        background: pal.surface,
        color: pal.text,
        border: `1px solid ${pal.border}`,
        borderRadius: 12,
        boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        // no layout jitter:
        overflow: "hidden",
        transform: "translateZ(0)", // stabilize GPU layer
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: `1px solid ${pal.border}`,
        }}
      >
        <div style={{ fontWeight: 800 }}>Select Shape</div>
        <button
          className="toolbar-btn"
          onClick={() => setShowShapesModal(false)}
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Body (scrolls) */}
      <div
        style={{
          padding: 12,
          overflow: "auto",
          // fixed inner height keeps outer box stable
          maxHeight: "calc(80vh - 58px - 60px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {[
            { label: "Rectangle", type: "rect" as const },
            { label: "Circle", type: "circle" as const },
            { label: "Triangle", type: "triangle" as const },
            { label: "Arrow", type: "arrow" as const },
            { label: "Line", type: "line" as const },
            { label: "Diamond", type: "diamond" as const },
            { label: "Star", type: "star" as const },
            { label: "Heart", type: "heart" as const },
            { label: "Cloud", type: "cloud" as const },
            { label: "Text Box", type: "textbox" as const },
          ].map((s) => (
            <button
              key={s.type}
              onClick={() => startShapeInsert(s.type)}
              title={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
                padding: 10,
                borderRadius: 10,
                background: pal.surfaceAlt,
                color: pal.text,
                border: `1px solid ${pal.border}`,
                cursor: "pointer",
                transition: "transform .15s ease, box-shadow .2s ease, background .2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 10px 22px rgba(0,0,0,0.18)";
                e.currentTarget.style.background = pal.surface;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.background = pal.surfaceAlt;
              }}
            >
              <div
                style={{
                  width: 84,
                  height: 56,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: theme === "dark" ? "#0f172a" : "#f8fafc",
                  border: `1px dashed ${pal.border}`,
                }}
              >
                <ShapeIcon type={s.type} stroke={pal.text} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: 12,
          borderTop: `1px solid ${pal.border}`,
        }}
      >
        <button className="toolbar-btn" onClick={() => setShowShapesModal(false)}>
          Close
        </button>
      </div>
    </div>
  </div>
)}


{showPivotModal && range && (
  <div
    onClick={() => setShowPivotModal(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1200,
      padding: 12,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 720,
        maxWidth: "96vw",
        background: pal.surface,
        color: pal.text,
        border: `1px solid ${pal.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Create Pivot Table</div>
        <button type="button" onClick={() => setShowPivotModal(false)} style={{ border: `1px solid ${pal.border}`, background: pal.surface, color: pal.text }}>✕</button>
      </div>

      {/* read headers from the selected range */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, color: pal.textMuted }}>Selected range will be used as source. First row in range is treated as headers.</div>

        {/* extract headers */}
        {(() => {
          const mat = rangeToMatrix(range);
          const headers = mat[0] ?? [];
          return (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 12, color: pal.textMuted }}>Row field</div>
                <select
                  value={pivotOpts.rowIndex}
                  onChange={(e) => setPivotOpts(p => ({ ...p, rowIndex: Number(e.target.value) }))}
                >
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i+1}`}</option>)}
                </select>
              </div>

              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 12, color: pal.textMuted }}>Column field (optional)</div>
                <select
                  value={pivotOpts.colIndex == null ? -1 : pivotOpts.colIndex}
                  onChange={(e) => setPivotOpts(p => ({ ...p, colIndex: Number(e.target.value) === -1 ? null : Number(e.target.value) }))}
                >
                  <option value={-1}>— none —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i+1}`}</option>)}
                </select>
              </div>

              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 12, color: pal.textMuted }}>Value field</div>
                <select
                  value={pivotOpts.valueIndex}
                  onChange={(e) => setPivotOpts(p => ({ ...p, valueIndex: Number(e.target.value) }))}
                >
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i+1}`}</option>)}
                </select>
              </div>

              <div style={{ minWidth: 140 }}>
                <div style={{ fontSize: 12, color: pal.textMuted }}>Aggregation</div>
                <select value={pivotOpts.agg} onChange={(e) => setPivotOpts(p => ({ ...p, agg: e.target.value as any }))}>
                  <option value="sum">Sum</option>
                  <option value="count">Count</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                </select>
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            // build matrix from current selection (treat first row as headers)
            const mat = rangeToMatrix(range);
            // use data rows (include header in matrix for computePivotMatrix caller)
            const pivotMat = computePivotMatrix(mat.slice(1), pivotOpts.rowIndex, pivotOpts.colIndex, pivotOpts.valueIndex, pivotOpts.agg);
            setPivotPreview(pivotMat);
          }}
          style={{ padding: 10, borderRadius: 8, background: pal.selection, color: "#fff", border: "none", cursor: "pointer" }}
        >
          Preview
        </button>

        <button
          type="button"
          onClick={() => {
            if (!pivotPreview) return alert("Preview first");
            // paste into currently selected cell (pasteMatrix uses selectedRef.current)
            pasteMatrix(pivotPreview);
            setShowPivotModal(false);
            setPivotPreview(null);
          }}
          style={{ padding: 10, borderRadius: 8, background: pal.surfaceAlt, color: pal.text, border: `1px solid ${pal.border}` }}
        >
          Insert Pivot (paste at selected cell)
        </button>

        <button
          type="button"
          onClick={() => {
            // copy pivot to clipboard as TSV (quick alternative if user wants to paste in a new sheet)
            if (!pivotPreview) return alert("Preview first");
            const tsv = pivotPreview.map(r => r.join("\t")).join("\r\n");
            navigator.clipboard?.writeText(tsv).then(() => {
              alert("Pivot copied as TSV. You can create a new sheet and paste into A1.");
            }).catch(() => alert("Copy to clipboard failed."));
          }}
          style={{ padding: 10, borderRadius: 8, background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
        >
          Copy as TSV
        </button>
      </div>

      {/* preview table */}
      {pivotPreview && (
        <div style={{ marginTop: 12, maxHeight: 280, overflow: "auto", borderTop: `1px solid ${pal.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Preview</div>
          <div style={{ display: "inline-block", background: pal.surface }}>
            {pivotPreview.map((r, ri) => (
              <div key={ri} style={{ display: "flex" }}>
                {r.map((c, ci) => (
                  <div key={ci} style={{ padding: "6px 10px", border: `1px solid ${pal.border}`, minWidth: 80, boxSizing: "border-box" }}>
                    {c}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
)}

      </div>
    </div>
  </div>
</div>
);
}
// 🔹 Global animated toolbar button styles (only added once)
if (typeof document !== "undefined" && !document.getElementById("toolbar-animated-style")) {
  const style = document.createElement("style");
  style.id = "toolbar-animated-style";
  style.textContent = `
    .toolbar-btn {
      position: relative;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid var(--toolbar-border, #cbd5e1);
      background: var(--toolbar-bg, #ffffff);
      color: var(--toolbar-text, #0f172a);
      cursor: pointer;
      transition: all 0.25s ease, box-shadow 0.3s ease;
      overflow: hidden;
      isolation: isolate;
    }

    /* subtle gradient glow animation on hover */
    .toolbar-btn::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(120deg, transparent, rgba(255,255,255,0.2), transparent);
      transform: translateX(-100%);
      transition: transform 0.5s ease;
      z-index: 1;
    }

    .toolbar-btn:hover::after {
      transform: translateX(100%);
    }

    .toolbar-btn:hover {
      transform: translateY(-2px) scale(1.04);
      box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      filter: brightness(1.07);
      z-index: 2;
    }

    .toolbar-btn:active {
      transform: scale(0.96);
      box-shadow: 0 1px 4px rgba(0,0,0,0.25);
      filter: brightness(0.95);
    }

    .toolbar-btn:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    /* Dark theme overrides */
    body.dark .toolbar-btn {
      --toolbar-bg: #1e293b;
      --toolbar-text: #e2e8f0;
      --toolbar-border: #334155;
    }

    body.dark .toolbar-btn:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }

    /* Red destructive buttons */
    .toolbar-btn.danger {
      background: #fee2e2;
      color: #b91c1c;
      border-color: #fecaca;
    }
    body.dark .toolbar-btn.danger {
      background: #7f1d1d;
      color: #fca5a5;
      border-color: #b91c1c;
    }

    /* Emerald active state (like Freeze toggles) */
    .toolbar-btn.active {
      background: #d1fae5;
      color: #065f46;
      border-color: #34d399;
    }
    body.dark .toolbar-btn.active {
      background: #064e3b;
      color: #6ee7b7;
      border-color: #10b981;
    }
  `;
  document.head.appendChild(style);
}
// 🌟 Long, animated, theme-aware Formula Bar styling
if (typeof document !== "undefined" && !document.getElementById("formula-bar-style")) {
  const style = document.createElement("style");
  style.id = "formula-bar-style";
  style.textContent = `
    .formula-bar {
      font-size: 15px;
      padding: 10px 14px;
      height: 44px;
      border-radius: 10px;
      border: 1px solid var(--formula-border, #cbd5e1);
      background: var(--formula-bg, #ffffff);
      color: var(--formula-text, #0f172a);
      outline: none;
      width: 100%;
      max-width: 950px;     /* ✅ extra long formula bar */
      min-width: 650px;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.08);
      transition: all 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }

    .formula-bar::placeholder {
      color: var(--formula-placeholder, #94a3b8);
      opacity: 0.75;
      transition: opacity 0.3s ease;
    }

    .formula-bar:hover {
      box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
      transform: translateY(-1px);
    }

    .formula-bar:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.25);
      background: var(--formula-bg-focus, #ffffff);
      transform: scale(1.02);
    }

    body.dark .formula-bar {
      --formula-bg: #1e293b;
      --formula-bg-focus: #334155;
      --formula-text: #f1f5f9;
      --formula-border: #334155;
      --formula-placeholder: #64748b;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
    }

    body.dark .formula-bar:focus {
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96,165,250,0.3);
      transform: scale(1.02);
    }
  `;
  document.head.appendChild(style);
}
