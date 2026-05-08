import { requireAdmin } from "@/lib/auth";
import { createLeagueAction } from "./actions";

export default async function NewLeague() {
  await requireAdmin();
  const year = new Date().getFullYear();
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">New league</h1>
      <p className="text-slate-400 text-sm mb-5">
        Create a league. You can add players, configure the draft, and import data after creation.
      </p>
      <form action={createLeagueAction} className="panel space-y-4">
        <div>
          <label className="label" htmlFor="name">League name</label>
          <input id="name" name="name" required className="input" placeholder="The Group Chat 2025" />
        </div>
        <div>
          <label className="label" htmlFor="seasonYear">Season year</label>
          <input id="seasonYear" name="seasonYear" type="number" required defaultValue={year} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="maxPlayers">Max players</label>
          <input id="maxPlayers" name="maxPlayers" type="number" min={2} max={12} defaultValue={6} className="input" />
          <p className="text-xs text-slate-500 mt-1">3–6 recommended.</p>
        </div>
        <button className="btn-primary w-full">Create league</button>
      </form>
    </div>
  );
}
