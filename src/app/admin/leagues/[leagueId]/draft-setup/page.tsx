import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS, Category } from "@/lib/categories";
import { readLeagueSettings } from "@/lib/leagueSettings";
import {
  updateSegmentAction,
  updateScoringAction,
  updateLeagueSettingsAction,
} from "./actions";
import { StatusBadge } from "@/components/StatusBadge";

export default async function DraftSetup({ params }: { params: Promise<{ leagueId: string }> }) {
  await requireAdmin();
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { draftSegments: { orderBy: { segmentOrder: "asc" } } },
  });
  if (!league) notFound();
  const settings = readLeagueSettings(league);
  const scoringConfigs = await prisma.scoringConfig.findMany({ where: { leagueId } });
  const draftStarted = league.status === "drafting" || league.status === "drafted";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/leagues/${leagueId}`} className="text-amber-400 text-sm hover:underline">← Back to league</Link>
        <h1 className="text-2xl font-bold mt-1">Draft setup</h1>
        <p className="text-slate-400 text-sm">Configure segments, pick counts, scoring multipliers, and league rules.</p>
        <div className="mt-2"><StatusBadge status={league.status} /></div>
      </div>

      <section className="panel">
        <h2 className="text-lg font-bold mb-3">Draft segments</h2>
        <p className="text-sm text-slate-400 mb-3">Order and pick counts. Snake order is computed from these values + your draft order.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {league.draftSegments.map((s) => (
            <form key={s.id} action={updateSegmentAction.bind(null, leagueId, s.id)} className="panel-tight space-y-2">
              <div className="text-xs uppercase text-slate-400">Segment</div>
              <div className="font-bold">{CATEGORY_LABELS[s.category as Category]}</div>
              <label className="label text-xs">Segment order</label>
              <input
                name="segmentOrder"
                type="number"
                defaultValue={s.segmentOrder}
                min={1}
                className="input"
                disabled={draftStarted}
              />
              <label className="label text-xs">Picks per player</label>
              <input
                name="pickCountPerPlayer"
                type="number"
                defaultValue={s.pickCountPerPlayer}
                min={0}
                className="input"
                disabled={draftStarted}
              />
              {!draftStarted ? <button className="btn-primary w-full">Save</button> : null}
            </form>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-bold mb-3">Scoring config</h2>
        <p className="text-sm text-slate-400 mb-3">
          Multipliers/points by category. Locked when draft pool locks. Edit values to balance categories.
        </p>
        <div className="grid lg:grid-cols-2 gap-4">
          {CATEGORIES.map((cat) => {
            const cfg = scoringConfigs.find((c) => c.category === cat);
            if (!cfg) return null;
            const parsed = JSON.parse(cfg.configJson);
            const multipliers: Record<string, number> = parsed.multipliers ?? {};
            return (
              <form key={cat} action={updateScoringAction.bind(null, leagueId, cat)} className="panel-tight space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold">{CATEGORY_LABELS[cat]}</div>
                  {cfg.locked ? <span className="badge-amber">Locked</span> : <span className="badge-slate">Editable</span>}
                </div>
                <div className="text-xs text-slate-500">Formula: {parsed.formula}</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(multipliers).map((k) => (
                    <label key={k} className="text-xs">
                      <span className="block text-slate-400 mb-0.5">{k}</span>
                      <input
                        name={`m_${k}`}
                        type="number"
                        step="any"
                        defaultValue={multipliers[k]}
                        className="input"
                        disabled={cfg.locked}
                      />
                    </label>
                  ))}
                </div>
                {!cfg.locked ? <button className="btn-primary w-full">Save scoring</button> : null}
              </form>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-bold mb-3">League rules</h2>
        <form action={updateLeagueSettingsAction.bind(null, leagueId)} className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="label">Pick exclusivity</span>
            <select name="exclusivity" defaultValue={settings.exclusivity} className="input" disabled={draftStarted}>
              <option value="global_across_all_categories">Global across all categories</option>
              <option value="exclusive_within_category_only">Exclusive within category only</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Cinderella eligibility</span>
            <select
              name="cinderellaEligibilityType"
              defaultValue={settings.cinderellaEligibility.type}
              className="input"
              disabled={draftStarted}
            >
              <option value="outside_top_25">Outside AP Top 25</option>
              <option value="min_preseason_rank">Min preseason rank N or higher (≥)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Min preseason rank for Cinderella</span>
            <input
              name="cinderellaMinRank"
              type="number"
              defaultValue={settings.cinderellaEligibility.minPreseasonRank}
              className="input"
              disabled={draftStarted}
            />
          </label>
          <label className="text-sm">
            <span className="label">Conferences (comma-separated)</span>
            <input
              name="conferences"
              defaultValue={settings.conferences.join(", ")}
              className="input"
              disabled={draftStarted}
            />
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" name="trashTalkEnabled" defaultChecked={settings.trashTalkEnabled} />
            <span>Trash talk enabled</span>
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" name="trashTalkAllowSelfDelete" defaultChecked={settings.trashTalkAllowSelfDelete} />
            <span>Allow players to delete own trash talk</span>
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" name="publishProvisionalStandings" defaultChecked={settings.publishProvisionalStandings} />
            <span>Show provisional standings to players</span>
          </label>
          <label className="text-sm">
            <span className="label">Draft timer (seconds, 0 = none)</span>
            <input
              name="draftTimerSeconds"
              type="number"
              defaultValue={settings.draftTimerSeconds}
              className="input"
              disabled={draftStarted}
            />
          </label>
          <div className="md:col-span-2">
            <button className="btn-primary">Save league rules</button>
          </div>
        </form>
      </section>
    </div>
  );
}
