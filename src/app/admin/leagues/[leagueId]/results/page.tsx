import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS, Category } from "@/lib/categories";
import { categoryToResultType, resultTypeToCategory } from "@/lib/resultsParser";
import {
  uploadResultsAction,
  applyImportAction,
  deleteImportAction,
  updateRowMatchAction,
  updateRowOutcomeAction,
  ignoreRowAction,
} from "./actions";

const RESULT_TYPES = ["heisman", "cfp", "cinderella", "conference"] as const;

const RESULT_TYPE_LABELS: Record<string, string> = {
  heisman: "Heisman",
  cfp: "College Football Playoff",
  cinderella: "Cinderella (final AP poll)",
  conference: "Conference Championships",
};

const ALLOWED_OUTCOMES: Record<string, string[]> = {
  heisman: ["winner", "finalist_non_winner"],
  cfp: ["wins_national_title", "loses_final", "loses_semifinal", "makes_playoff_no_semifinal", "misses_playoff"],
  conference: ["wins_conference_title_game", "loses_conference_title_game", "fails_to_qualify"],
  cinderella: ["final_ap_top_10", "final_ap_11_to_20", "final_ap_21_to_25", "unranked"],
};

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ msg?: string; err?: string; importId?: string }>;
}) {
  await requireAdmin();
  const { leagueId } = await params;
  const sp = await searchParams;
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) notFound();

  const imports = await prisma.resultImport.findMany({
    where: { leagueId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { rows: true } } },
  });

  const focusedImport = sp.importId
    ? await prisma.resultImport.findUnique({
        where: { id: sp.importId },
        include: {
          rows: {
            include: { matchedEntity: true },
            orderBy: { id: "asc" },
          },
        },
      })
    : null;

  // Build candidate entity list for the focused import (matches its category)
  let candidates: Awaited<ReturnType<typeof prisma.draftableEntity.findMany>> = [];
  if (focusedImport) {
    const cat = resultTypeToCategory(focusedImport.resultType);
    candidates = await prisma.draftableEntity.findMany({
      where: { leagueId },
      orderBy: [{ schoolName: "asc" }],
    });
    candidates = candidates.filter((c) => {
      try {
        return (JSON.parse(c.eligibleCategoriesJson) as string[]).includes(cat);
      } catch {
        return false;
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/leagues/${leagueId}`} className="text-amber-400 text-sm hover:underline">
          ← Back to league
        </Link>
        <h1 className="text-2xl font-bold mt-1">Results import</h1>
        <p className="text-slate-400 text-sm">
          Upload result files per category. Review the matched rows, fix any unmatched entries, then apply.
        </p>
      </div>

      {sp.msg ? (
        <div className="px-3 py-2 rounded bg-green-500/15 border border-green-500/30 text-green-300 text-sm">{sp.msg}</div>
      ) : null}
      {sp.err ? (
        <div className="px-3 py-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{sp.err}</div>
      ) : null}

      <section className="panel">
        <h2 className="text-lg font-bold mb-2">Upload new results file</h2>
        <p className="text-sm text-slate-400 mb-3">
          Required columns by type:{" "}
          <code>heisman</code> → athlete_name, school_name, outcome.{" "}
          <code>cfp</code> → school_name, outcome.{" "}
          <code>cinderella</code> → school_name, final_ap_rank.{" "}
          <code>conference</code> → school_name, conference, outcome.
        </p>
        <form action={uploadResultsAction.bind(null, leagueId)} encType="multipart/form-data" className="grid md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="label">Result type</span>
            <select name="resultType" required className="input">
              {RESULT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RESULT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="label">File (.csv or .xlsx)</span>
            <input name="file" type="file" accept=".csv,.xlsx,.xls" required className="text-sm w-full" />
          </label>
          <div className="md:col-span-3">
            <button className="btn-primary">Upload &amp; preview</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="text-lg font-bold mb-3">All imports</h2>
        {imports.length === 0 ? (
          <div className="text-slate-400 text-sm">No imports yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>File</th>
                <th>Status</th>
                <th className="text-right">Rows</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className={focusedImport?.id === imp.id ? "bg-slate-800/40" : ""}>
                  <td className="capitalize">{imp.resultType}</td>
                  <td>{imp.fileName ?? "—"}</td>
                  <td>
                    <span className={imp.status === "applied" ? "badge-green" : imp.status === "reviewed" ? "badge-amber" : "badge-slate"}>
                      {imp.status}
                    </span>
                  </td>
                  <td className="text-right">{imp._count.rows}</td>
                  <td className="text-slate-400">{imp.createdAt.toLocaleString()}</td>
                  <td className="text-right space-x-2">
                    <Link className="text-amber-400 text-sm hover:underline" href={`/admin/leagues/${leagueId}/results?importId=${imp.id}`}>
                      Review
                    </Link>
                    <form action={deleteImportAction.bind(null, leagueId, imp.id)} className="inline">
                      <button className="text-red-400 text-sm hover:underline">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {focusedImport ? (
        <section className="panel">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold">Review import: {focusedImport.fileName ?? focusedImport.id}</h2>
              <div className="text-xs text-slate-400">
                Type: <span className="capitalize">{focusedImport.resultType}</span> · Status:{" "}
                <span className="capitalize">{focusedImport.status}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <UnmatchedSummary
                rows={focusedImport.rows.map((r) => ({ matchStatus: r.matchStatus }))}
              />
              <form action={applyImportAction.bind(null, leagueId, focusedImport.id)}>
                <button className="btn-primary">Apply &amp; recalculate</button>
              </form>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Raw row</th>
                  <th>Matched entity</th>
                  <th>Outcome</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {focusedImport.rows.map((r) => {
                  const raw = (() => {
                    try {
                      return JSON.parse(r.rawRowJson);
                    } catch {
                      return {};
                    }
                  })();
                  const norm = (() => {
                    try {
                      return JSON.parse(r.normalizedValuesJson);
                    } catch {
                      return {};
                    }
                  })();
                  const allowedOutcomes = ALLOWED_OUTCOMES[focusedImport.resultType] ?? [];
                  return (
                    <tr key={r.id}>
                      <td>
                        <span
                          className={
                            r.matchStatus === "matched" || r.matchStatus === "manual"
                              ? "badge-green"
                              : r.matchStatus === "ignored"
                              ? "badge-slate"
                              : "badge-red"
                          }
                        >
                          {r.matchStatus}
                        </span>
                      </td>
                      <td className="text-xs">
                        <div className="font-medium">
                          {raw.athlete_name ? `${raw.athlete_name} (${raw.school_name ?? ""})` : raw.school_name ?? "—"}
                        </div>
                        <div className="text-slate-500">
                          {raw.conference ?? ""}
                          {raw.final_ap_rank ? ` · AP rank ${raw.final_ap_rank}` : ""}
                        </div>
                      </td>
                      <td className="min-w-[260px]">
                        <form action={updateRowMatchAction.bind(null, leagueId, r.id)}>
                          <select name="entityId" defaultValue={r.matchedEntityId ?? ""} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                            <option value="">— unmatched —</option>
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.athleteName ? `${c.athleteName} - ${c.schoolName}` : c.schoolName}
                                {c.conference ? ` (${c.conference})` : ""}
                              </option>
                            ))}
                          </select>
                        </form>
                      </td>
                      <td className="min-w-[200px]">
                        <form action={updateRowOutcomeAction.bind(null, leagueId, r.id)}>
                          <select name="outcome" defaultValue={r.outcome ?? ""} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                            <option value="">—</option>
                            {allowedOutcomes.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </form>
                        {focusedImport.resultType === "cinderella" ? (
                          <div className="text-xs text-slate-500 mt-1">AP rank {norm.finalApRank ?? raw.final_ap_rank ?? "—"}</div>
                        ) : null}
                      </td>
                      <td className="text-right">
                        <form action={ignoreRowAction.bind(null, leagueId, r.id)}>
                          <button className="text-red-400 text-xs hover:underline">Ignore</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel-tight">
        <h3 className="font-bold mb-2 text-sm">Categories status</h3>
        <div className="grid sm:grid-cols-4 gap-3 text-sm">
          {CATEGORIES.map((c) => {
            const rt = categoryToResultType(c);
            const applied = imports.filter((i) => i.resultType === rt && i.status === "applied").length;
            return (
              <div key={c} className="panel-tight">
                <div className="text-xs uppercase text-slate-400">{CATEGORY_LABELS[c as Category]}</div>
                <div className="text-lg font-bold">{applied} applied</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function UnmatchedSummary({ rows }: { rows: { matchStatus: string }[] }) {
  const unmatched = rows.filter((r) => r.matchStatus === "unmatched").length;
  const matched = rows.filter((r) => r.matchStatus === "matched" || r.matchStatus === "manual").length;
  const ignored = rows.filter((r) => r.matchStatus === "ignored").length;
  return (
    <div className="text-xs text-slate-400">
      <span className="badge-green mr-1">{matched} matched</span>
      <span className="badge-red mr-1">{unmatched} unmatched</span>
      <span className="badge-slate">{ignored} ignored</span>
    </div>
  );
}
