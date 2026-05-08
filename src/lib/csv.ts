// Lightweight CSV parser. Handles quoted fields, escaped quotes, and CRLF.

export type CsvRow = Record<string, string>;

export function parseCsv(input: string): CsvRow[] {
  const rows = parseCsvRaw(input);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: CsvRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 1 && row[0] === "") continue; // skip blank trailing lines
    const obj: CsvRow = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = (row[j] ?? "").trim();
    }
    out.push(obj);
  }
  return out;
}

function parseCsvRaw(input: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = input.replace(/^﻿/, "");
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        cur.push(field);
        field = "";
        i++;
      } else if (ch === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
        i++;
      } else if (ch === "\r") {
        // ignore; \n will close
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}
