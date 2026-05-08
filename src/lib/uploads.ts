import * as XLSX from "xlsx";
import { parseCsv, CsvRow } from "./csv";

export type ParsedUpload = {
  fileName: string;
  rows: CsvRow[];
};

export async function parseUploadedFile(file: File): Promise<ParsedUpload> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = await file.text();
    return { fileName: file.name, rows: parseCsv(text) };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as CsvRow[];
    return {
      fileName: file.name,
      rows: rows.map((r) => {
        const out: CsvRow = {};
        for (const k of Object.keys(r)) out[k.trim()] = String(r[k] ?? "").trim();
        return out;
      }),
    };
  }
  throw new Error("Unsupported file type. Please upload .csv or .xlsx.");
}
