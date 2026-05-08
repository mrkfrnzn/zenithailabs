import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/categories";
import {
  uploadPreseasonAction,
  updateEntityAction,
  deleteEntityAction,
  toggleCategoryAction,
  lockDraftPoolAction,
  unlockDraftPoolAction,
} from "./actions";
import { StatusBadge } from "@/components/StatusBadge";
import { readLeagueSettings } from "@/lib/leagueSettings";

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireAdmin();
  const { leagueId } = await params;
  const sp = await searchParams;
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) notFound();
  const settings = readLeagueSettings(league);
  const entities = await prisma.draftableEntity.findMany({
    where: { leagueId },
    orderBy: [{ entityType: "asc" }, { schoolName: "asc" }],
  });

  // Counts per category
  const counts: Record<string, number> = {};
  for (const c of CATEGORIES) counts[c] = 0;
  for (const e of entities) {
    const cats = JSON.parse(e.eligibleCategoriesJson) as string[];
    for (const c of cats) counts[c] = (counts[c] ?? 0) + 1;
  }

  // Validation issues
  const issues: { id: string; message: string }[] = [];
  const seen = new Map<string, string>();
  for (const e of entities) {
    const key = `${e.entityType}|${e.normalizedName}`;
    if (seen.has(key)) issues.push({ id: e.id, message: `Duplicate: ${e.schoolName}${e.athleteName ? ` (${e.athleteName})` : ""}` });
    else seen.set(key, e.id);
    if (!Number.isFinite(e.oddsAmerican) || e.oddsAmerican === 0)
      issues.push({ id: e.id, message: `Invalid odds for ${e.schoolName}` });
    const cats = JSON.parse(e.eligibleCategoriesJson) as string[];
    if (cats.length === 0)
      issues.push({ id: e.id, message: `No category assigned to ${e.schoolName}` });
    if (cats.includes("cinderella")) {
      const eligibleByRule =
        settings.cinderellaEligibility.type === "min_preseason_rank"
          ? (e.preseasonRank ?? 999) >= settings.cinderellaEligibility.minPreseasonRank
          : (e.preseasonRank ?? 999) > 25;
      if (!eligibleByRule)
        issues.push({ id: e.id, message: `Cinderella conflict: ${e.schoolName} preseason rank ${e.preseasonRank}` });
    }
  }

  const draftStarted = league.status === "drafting" || league.status === "drafted";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/admin/leagues/${leagueId}`} className="text-amber-400 text-sm hover:underline">← Back to league</Link>
          <h1 className="text-2xl font-bold mt-1">Preseason data import</h1>
          <p className="text-slate-400 text-sm">
            Upload CSV/XLSX, review parsed rows, edit, and lock the draft pool before drafting.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <StatusBadge status={league.status} />
          {league.status !== "draft_ready" && league.status !== "drafting" && league.status !== "drafted" ? (
            <form action={lockDraftPoolAction.bind(null, leagueId)}>
              <button className="btn-primary" disabled={issues.length > 0 || entities.length === 0}>Lock draft pool</button>
            </form>
          ) : !draftStarted ? (
            <form action={unlockDraftPoolAction.bind(null, leagueId)}>
              <button className="btn-ghost">Unlock</button>
            </form>
          ) : null}
        </div>
      </div>

      {sp.msg ? <div className="px-3 py-2 rounded bg-green-500/15 border border-green-500/30 text-green-300 text-sm">{sp.msg}</div> : null}
      {sp.err ? <div className="px-3 py-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{sp.err}</div> : null}

      {!draftStarted ? (
        <section className="panel">
          <h2 className="text-lg font-bold mb-2">Upload file</h2>
          <p className="text-sm text-slate-400 mb-3">
            Required columns:{" "}
            <code>entity_type</code>, <code>school_name</code>, <code>athlete_name</code> (athletes only),{" "}
            <code>conference</code>, <code>position</code> (athletes), <code>preseason_rank</code>,{" "}
            <code>odds</code>, <code>source</code>, <code>eligible_categories</code> (semicolon-separated).
          </p>
          <form action={uploadPreseasonAction.bind(null, leagueId)} encType="multipart/form-data" className="flex flex-wrap items-center gap-3">
            <input name="file" type="file" accept=".csv,.xlsx,.xls" required className="text-sm" />
            <label className="text-sm text-slate-300 flex items-center gap-2">
              <input type="checkbox" name="replace" value="1" /> Replace existing entities
            </label>
            <button className="btn-primary">Upload &amp; parse</button>
          </form>
        </section>
      ) : null}

      <section className="grid sm:grid-cols-4 gap-3">
        {CATEGORIES.map((c) => (
          <div key={c} className="panel-tight">
            <div className="text-xs uppercase text-slate-400">{CATEGORY_LABELS[c]}</div>
            <div className="text-2xl font-extrabold">{counts[c]}</div>
            <div className="text-xs text-slate-500">eligible entities</div>
          </div>
        ))}
      </section>

      {issues.length > 0 ? (
        <section className="panel border-red-500/30">
          <h3 className="font-bold text-red-300 mb-2">Issues to resolve before locking ({issues.length})</h3>
          <ul className="text-sm list-disc pl-5 space-y-1 text-red-200">
            {issues.slice(0, 50).map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h2 className="text-lg font-bold mb-3">Draftable entities ({entities.length})</h2>
        {entities.length === 0 ? (
          <div className="text-slate-400 text-sm">No entities yet. Upload a file above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>School</th>
                  <th>Athlete</th>
                  <th>Conf</th>
                  <th>Pos</th>
                  <th className="text-right">Pre Rank</th>
                  <th className="text-right">Odds</th>
                  <th>Categories</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entities.map((e) => {
                  const cats = JSON.parse(e.eligibleCategoriesJson) as string[];
                  return (
                    <tr key={e.id}>
                      <td className="text-slate-400">{e.entityType}</td>
                      <td className="font-medium">{e.schoolName}</td>
                      <td>{e.athleteName ?? ""}</td>
                      <td>{e.conference ?? ""}</td>
                      <td>{e.position ?? ""}</td>
                      <td className="text-right">{e.preseasonRank ?? ""}</td>
                      <td className="text-right tabular-nums">
                        <form action={updateEntityAction.bind(null, leagueId, e.id)}>
                          <input
                            name="oddsAmerican"
                            defaultValue={e.oddsAmerican}
                            type="number"
                            disabled={draftStarted}
                            className="input w-24 text-right"
                            onBlur={(ev) => ev.currentTarget.form?.requestSubmit()}
                          />
                        </form>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {CATEGORIES.map((c) => (
                            <form key={c} action={toggleCategoryAction.bind(null, leagueId, e.id, c)}>
                              <button
                                disabled={draftStarted}
                                className={cats.includes(c) ? "badge-amber" : "badge-slate"}
                                type="submit"
                              >
                                {CATEGORY_LABELS[c]}
                              </button>
                            </form>
                          ))}
                        </div>
                      </td>
                      <td className="text-right">
                        {!draftStarted ? (
                          <form action={deleteEntityAction.bind(null, leagueId, e.id)}>
                            <button className="text-red-400 hover:underline text-xs">Delete</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
