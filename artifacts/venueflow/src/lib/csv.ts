/**
 * Tiny RFC-4180-ish CSV parser. Handles:
 *   - quoted fields with commas / newlines / "" escapes
 *   - Windows \r\n line endings
 *   - leading UTF-8 BOM (typical for Excel exports)
 * Doesn't handle pathological cases (mismatched quotes, very weird
 * separators) — the import dialog surfaces a "couldn't parse CSV" error
 * if the row count or header count looks wrong.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\r") { /* swallow */ }
      else if (ch === "\n") { row.push(cell); lines.push(row); row = []; cell = ""; }
      else { cell += ch; }
    }
  }
  if (cell !== "" || row.length > 0) { row.push(cell); lines.push(row); }

  // Strip UTF-8 BOM (U+FEFF) from the very first cell if present — Excel
  // exports prepend it and downstream code shouldn't have to know.
  if (lines[0]?.[0]) lines[0][0] = lines[0][0].replace(/^﻿/, "");

  const headers = (lines.shift() ?? []).map((h) => h.trim());
  const rows = lines.filter((r) => r.some((c) => c.trim() !== ""));
  return { headers, rows };
}

/**
 * Date parsers — accept the common formats spreadsheets export and
 * normalize to YYYY-MM-DD. Returns null on failure so the import
 * dialog can flag the row.
 */
export function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // M/D/YYYY or MM/DD/YYYY
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mo = m[1].padStart(2, "0");
    const d = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  // M-D-YYYY
  const m2 = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  // Fall back to Date.parse (handles "April 25, 2026", ISO datetimes, etc.)
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/** "7:30 PM" / "19:30" / "7pm" → "19:30". null if unparseable. */
export function normalizeTime(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  // 24-hour HH:MM
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]); const min = Number(m[2]);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }
  // h:mm am/pm
  m = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (m) {
    let h = Number(m[1]); const min = Number(m[2]);
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }
  // h am/pm (no minutes)
  m = t.match(/^(\d{1,2})\s*(am|pm)$/);
  if (m) {
    let h = Number(m[1]);
    if (m[2] === "pm" && h !== 12) h += 12;
    if (m[2] === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24) return `${String(h).padStart(2, "0")}:00`;
  }
  return null;
}

/** Header alias resolution — case + whitespace + punctuation insensitive. */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, "").replace(/[^a-z0-9]/g, "");
}
