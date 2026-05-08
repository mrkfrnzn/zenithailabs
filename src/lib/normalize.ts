// Name normalization for matching draftable entities and result rows.

export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse American odds from various formats: "+850", "850", "-110", " 1200 "
export function parseAmericanOdds(raw: unknown): { value: number; original: string } | null {
  if (raw === null || raw === undefined) return null;
  const original = String(raw).trim();
  if (original === "") return null;
  const cleaned = original.replace(/[+\s,]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return null;
  return { value: Math.trunc(n), original };
}

export function parseInteger(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
