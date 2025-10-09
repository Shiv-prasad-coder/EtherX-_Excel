// src/components/Sheet.tsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { evaluateAndUpdate, setCellRaw } from "../utils/formulaEngine";
import type { CellValue } from "../utils/formulaEngine";

  


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

  /** Core data state */
  const [cells, setCells] = useState<Record<string, CellValue>>({});
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

  /** Conditional formatting toggle */
  const [condEnabled, setCondEnabled] = useState(false);
  const [showCondModal, setShowCondModal] = useState(false);


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
}, []);



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

  function cellsToCSV(): string {
    const esc = (s: string) => /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const lines: string[] = [];
    for (let r = 0; r < rowCount; r++) {
      const rowVals: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const v = cells[cellId(r, c)]?.value;
        rowVals.push(esc(v == null ? "" : String(v)));
      }
      lines.push(rowVals.join(","));
    }
    return lines.join("\r\n");
  }
  function downloadCSV(filename: string, csvText: string) {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function importCSV(text: string) {
    pushHistory();
    const data = parseTable(text);
    const next: Record<string, CellValue> = { ...cells };
    const maxR = Math.min(rowCount, data.length);
    for (let r = 0; r < maxR; r++) {
      const line = data[r] ?? [];
      const maxC = Math.min(colCount, line.length);
      for (let c = 0; c < maxC; c++) {
        setCellRaw(next, cellId(r, c), String(line[c] ?? ""));
        evaluateAndUpdate(next, cellId(r, c));
      }
    }
    setCells(next);
    selectedRef.current = "A1";
    setFormulaBar(next["A1"]?.raw ?? "");
    setRange({ r1: 0, c1: 0, r2: 0, c2: 0 });
  }
  function clearSheet() {
    if (!confirm("Clear all cells? This cannot be undone.")) return;
    pushHistory();
    setCells({});
    try { localStorage.removeItem(effectiveKey); } catch {}
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
  useEffect(() => {
    try {
      const raw = localStorage.getItem(effectiveKey);
    // inside useEffect(() => { ... }, [effectiveKey])
if (raw) {
  const saved = JSON.parse(raw) as {
    cells: Record<string, CellValue>;
    selected?: string;
    colWidths?: number[];
    freezeTopRow?: boolean;
    freezeFirstCol?: boolean;
    formats?: Record<string, CellFmt>;
    rowCount?: number;
    colCount?: number;
    condEnabled?: boolean;
  };

  // 🔧 NEW: hydrate values and evaluate formulas once
  const nextCells: Record<string, CellValue> = { ...(saved.cells || {}) };
  for (const [id, cell] of Object.entries(nextCells)) {
    if (!cell) continue;
    const raw = cell.raw ?? "";

    if (typeof raw === "string" && raw.startsWith("=")) {
      // let the formula engine compute .value
      evaluateAndUpdate(nextCells, id);
    } else {
      // plain literal: make sure .value is present so the grid can render it
      if (typeof cell.value === "undefined") {
        nextCells[id] = { ...cell, value: raw };
      }
    }
  }

  setCells(nextCells);
  if (saved.colWidths?.length) setColWidths(saved.colWidths);
  if (typeof saved.freezeTopRow === "boolean") setFreezeTopRow(saved.freezeTopRow);
  if (typeof saved.freezeFirstCol === "boolean") setFreezeFirstCol(saved.freezeFirstCol);
  if (saved.formats) setFormats(saved.formats);
  if (typeof saved.rowCount === "number") setRowCount(saved.rowCount);
  if (typeof saved.colCount === "number") setColCount(saved.colCount);
  if (typeof saved.condEnabled === "boolean") setCondEnabled(saved.condEnabled);

  selectedRef.current = saved.selected ?? "A1";
  const id = selectedRef.current;
  setFormulaBar(
    nextCells[id]?.raw ?? (nextCells[id]?.value?.toString() ?? "")
  );
  setRange({ r1: 0, c1: 0, r2: 0, c2: 0 });
} else {
  selectedRef.current = "A1";
  setRange({ r1: 0, c1: 0, r2: 0, c2: 0 });
}

    } catch {
      selectedRef.current = "A1";
      setRange({ r1: 0, c1: 0, r2: 0, c2: 0 });
    }
    historyRef.current = [takeSnapshot()];
    futureRef.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey]);

  /** Autosave */
  useEffect(() => {
    const payload = {
      cells,
      selected: selectedRef.current ?? undefined,
      colWidths,
      freezeTopRow,
      freezeFirstCol,
      formats,
      rowCount,
      colCount,
      condEnabled,
    };
    try {
      localStorage.setItem(effectiveKey, JSON.stringify(payload));
    } catch (e) {
      console.warn("Failed saving sheet to localStorage:", e);
    }
  }, [cells, colWidths, freezeTopRow, freezeFirstCol, formats, rowCount, colCount, condEnabled, effectiveKey]);

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
}}

      >
        {editing === id ? (
          <input
            autoFocus
            style={{ width: "100%", height: "100%", border: "none", outline: "none", fontSize: 13, textAlign }}
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

        <input
          className="toolbar-input flex-1 min-w-[260px]"
          style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
          value={formulaBar}
          onChange={(e) => setFormulaBar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && selectedRef.current) {
              commitEdit(selectedRef.current, formulaBar);
            }
          }}
          placeholder="Type value or =formula"
        />

        {/* B) Import / Export / Clear (unchanged) */}
        <div className="flex items-center gap-2">
          <button
            className="toolbar-btn"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file"; input.accept = ".csv,text/csv";
              input.onchange = async () => {
                const f = input.files?.[0]; if (!f) return;
                importCSV(await f.text());
              };
              input.click();
            }}
          >
            Import CSV
          </button>

          <button
            className="toolbar-btn"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            onClick={() => {
              const csv = cellsToCSV();
              const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
              downloadCSV(`sheet-${ts}.csv`, csv);
            }}
          >
            Download CSV
          </button>

          <button
            className="toolbar-btn"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            onClick={clearSheet}
          >
            Clear Sheet
          </button>
        </div>

        <span className="toolbar-sep" />

        {/* C) Freeze + Insert/Delete + Conditional Format (unchanged) */}
        <div className="flex items-center gap-2">
          <button
            className={`toolbar-btn ${freezeTopRow ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : ""}`}
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            onClick={() => { pushHistory(); setFreezeTopRow(v => !v); }}
          >
            {freezeTopRow ? "Unfreeze Top Row" : "Freeze Top Row"}
          </button>

          <button
            onClick={() => setShowCondModal(true)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: `1px solid ${pal.border}`,
              background: pal.surface,
              color: pal.text,
            }}
          >
            Conditional Format
          </button>

          <button
            className={`toolbar-btn ${freezeFirstCol ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : ""}`}
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            onClick={() => { pushHistory(); setFreezeFirstCol(v => !v); }}
          >
            {freezeFirstCol ? "Unfreeze First Column" : "Freeze First Column"}
          </button>

          <button
            className="toolbar-btn"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            title="+ Row"
            onClick={() => { const p = anchorRC(); if (!p) return; insertRowAt(p.row); }}
          >
            + Row
          </button>

          <button
            className="toolbar-btn bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            title="− Row"
            onClick={() => { const p = anchorRC(); if (!p) return; deleteRowAt(p.row); }}
          >
            − Row
          </button>

          <button
            className="toolbar-btn"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            title="+ Col"
            onClick={() => { const p = anchorRC(); if (!p) return; insertColAt(p.col); }}
          >
            + Col
          </button>

          <button
            className="toolbar-btn bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300"
            style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }}
            title="− Col"
            onClick={() => { const p = anchorRC(); if (!p) return; deleteColAt(p.col); }}
          >
            − Col
          </button>
        </div>

        <span className="toolbar-sep" />

        {/* D) Text formatting (unchanged) */}
        <div className="flex items-center gap-2">
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} title="Bold" onClick={toggleBold}>B</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} title="Italic" onClick={toggleItalic}><i>I</i></button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} title="Align Left"   onClick={() => setAlign("left")}>⟸</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} title="Align Center" onClick={() => setAlign("center")}>≡</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} title="Align Right"  onClick={() => setAlign("right")}>⟹</button>

          <label className="text-xs flex items-center gap-1.5">
            <span>Fill</span>
            <input type="color" className="h-8 w-10 rounded-md border border-slate-300 dark:border-slate-700"
              onChange={(e) => setBg(e.target.value)} />
          </label>

          <label className="text-xs flex items-center gap-1.5">
            <span>Text</span>
            <input type="color" className="h-8 w-10 rounded-md border border-slate-300 dark:border-slate-700"
              onChange={(e) => setColor(e.target.value)} />
          </label>
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
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} onClick={prevHit} title="Previous">Prev</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} onClick={nextHit} title="Next">Next</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} onClick={replaceCurrent} title="Replace current">Replace</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} onClick={replaceAll} title="Replace all">Replace All</button>
          <button className="toolbar-btn" style={{ background: pal.surface, color: pal.text, border: `1px solid ${pal.border}` }} onClick={clearFind} title="Clear search">Clear</button>
          <span className="text-xs" style={{ color: pal.text }}>
            {findHits.length ? `${hitIndex + 1}/${findHits.length}` : "0 results"}
          </span>
        </div>
      </div>
    </div>
  ) : (
    /* Non-Home tabs: simple placeholder without changing logic */
    <div className="px-3 py-3" style={{ background: pal.surfaceAlt, color: pal.text }}>
      {ribbonTab === "insert" && "Insert tab (coming soon)"}
      {ribbonTab === "view" && "View tab (coming soon)"}
    </div>
  )}
</div>





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
                
                position: "relative"
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

      </div>
    </div>
  </div>
</div>
);
}
