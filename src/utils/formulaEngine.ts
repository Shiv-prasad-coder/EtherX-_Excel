// src/utils/formulaEngine.ts
// Simple formula engine for the Excel clone.
// Not a full Excel parser — small, practical evaluator for prototypes.

export type CellValue = {
  raw?: string;           // what user typed (e.g. "123", "=A1+B2", "hello")
  value?: string | number; // computed value for display (number or string)
};

const CELL_REF_RE = /\b([A-Z]+[1-9][0-9]*)\b/g;
const RANGE_RE = /([A-Z]+[1-9][0-9]*):([A-Z]+[1-9][0-9]*)/g;
const SUM_FN_RE = /SUM\s*\(/i;

/** Convert column letters (A, B, ..., Z, AA, AB...) to 0-based index */
function colNameToIndex(name: string) {
  let col = 0;
  for (let i = 0; i < name.length; i++) col = col * 26 + (name.charCodeAt(i) - 64);
  return col - 1;
}
/** Parse A1 style id -> {row, col} 0-based */
function parseId(id: string) {
  const m = id.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { col: colNameToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}
/** Generate id from r,c */
function cellId(r: number, c: number) {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `${s}${r + 1}`;
}

/** Expand A1:B3 into array of ids */
function expandRange(a: string, b: string) {
  const pa = parseId(a);
  const pb = parseId(b);
  if (!pa || !pb) return [];
  const r1 = Math.min(pa.row, pb.row), r2 = Math.max(pa.row, pb.row);
  const c1 = Math.min(pa.col, pb.col), c2 = Math.max(pa.col, pb.col);
  const out: string[] = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(cellId(r, c));
  return out;
}

/**
 * setCellRaw(cells, id, raw)
 * - sets the raw value in the map
 * - does NOT perform full dependency evaluation itself (call evaluateAndUpdate afterwards)
 */
export function setCellRaw(cells: Record<string, CellValue>, id: string, raw: string) {
  if (!cells[id]) cells[id] = {};
  cells[id].raw = raw;
  // immediate quick set for non-formulas:
  if (!raw || raw[0] !== "=") {
    // plain number or text
    const n = Number(raw);
    if (!Number.isNaN(n) && String(raw).trim() !== "") cells[id].value = n;
    else cells[id].value = raw ?? "";
  } else {
    // formula placeholder — we will compute in evaluateAndUpdate
    cells[id].value = "";
  }
}

/**
 * evaluateAndUpdate(cells, changedId?)
 *
 * Basic algorithm:
 * - Recalculate formulas repeatedly until no changes or until max iterations (to handle simple dependencies).
 * - Formula handling:
 *    - Replace SUM(range) with computed numeric sum.
 *    - Replace cell refs like A1 with their numeric value (or 0 if not numeric)
 *    - Evaluate final arithmetic expression using Function (a controlled eval)
 * - Non-numeric results are returned as strings.
 *
 * Note: This is intentionally small — it's not a full Excel engine. Use with care.
 */
export function evaluateAndUpdate(cells: Record<string, CellValue>, _changedId?: string) {
  // helper to get numeric value for a cell (used in expressions)
  const getNumeric = (id: string) => {
    const v = cells[id]?.value;
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  };

  // Preprocess: replace SUM(range) occurrences and handle simple SUM calls.
  // But we'll do dynamic per-formula processing below.

  const keys = Object.keys(cells);
  const maxIters = Math.max(10, keys.length * 2);

  for (let iter = 0; iter < maxIters; iter++) {
    let anyChange = false;

    for (const id of keys) {
      const raw = cells[id]?.raw ?? "";
      if (!raw || raw[0] !== "=") continue; // only formulas

      let expr = raw.slice(1).trim(); // remove leading '='

      // Handle SUM(range1,range2, A1, 1, ...) style by scanning for SUM( ... )
      // We'll replace SUM(...) with a numeric literal of the sum.
      expr = expr.replace(SUM_FN_RE, (_m) => "SUM("); // normalize case but keep same text
      // Evaluate SUM(...) by extracting inner until matching ) - simple approach:
      // We'll repeatedly find RANGE_RE inside expr and expand them for any SUM or direct references.

      // Replace ranges like A1:B3 inside the expression with an array-like sum expression:
      expr = expr.replace(RANGE_RE, (_m, a, b) => {
        const ids = expandRange(a, b);
        // convert to a paren-wrapped sum of numeric values, e.g. (val(A1)+val(A2)+...)
        return "(" + ids.map(i => `__VAL("${i}")`).join("+") + ")";
      });

      // Replace single cell refs with __VAL("A1")
      expr = expr.replace(CELL_REF_RE, (_m, ref) => `__VAL("${ref}")`);

      // Replace SUM(...) function calls now by evaluating inner which may contain __VAL tokens
      // We'll use a small evaluator that handles __VAL and arithmetic.
      // Implement helper __VAL inside the Function scope.

      // Build safe function body:
      const fnBody = `
        const __VAL = (id) => {
          const v = getNumeric(id);
          return (typeof v === "number") ? v : 0;
        };
        try {
          return (${expr});
        } catch (e) {
          return "";
        }
      `;

      // Inject getNumeric via closure and run code using Function constructor:
      let newValue: string | number = "";
      try {
        // Create Function with getNumeric captured (we pass it as argument)
        const f = new Function("getNumeric", fnBody);
        const result = f(getNumeric);
        if (typeof result === "number" && Number.isFinite(result)) newValue = result;
        else if (typeof result === "string") newValue = result;
        else newValue = String(result ?? "");
      } catch (e) {
        newValue = "";
      }

      // store if changed
      const prev = cells[id].value;
      // numeric normalization: if newValue is number but prev is string equivalent, still count change.
      const changed = (typeof prev !== typeof newValue) || (String(prev) !== String(newValue));
      if (changed) {
        cells[id].value = newValue;
        anyChange = true;
      }
    }

    if (!anyChange) break;
  }

  // After formula pass, also update any non-formula cells to keep values normalized
  for (const id of Object.keys(cells)) {
    const raw = cells[id]?.raw ?? "";
    if (!raw || raw[0] !== "=") {
      const n = Number(raw);
      if (!Number.isNaN(n) && String(raw).trim() !== "") {
        cells[id].value = n;
      } else {
        cells[id].value = raw ?? "";
      }
    }
  }
}
