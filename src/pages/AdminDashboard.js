import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import PayoutTable from '../components/PayoutTable';
import {
  adminGetSeasons, adminCreateSeason, adminUpdateSeason,
  adminGetWeeks, adminCreateWeek, adminUpdateWeek,
  adminGetParticipants, adminAddParticipant, adminSetPaid,
  adminGetLineups, adminOverrideLineup,
  adminGetStats, adminPutStats,
  triggerScoring,
  adminGetPayoutRules, adminUpdatePayoutRule,
  adminGetUsers, adminUpdateUserRole,
  adminGetAuditLogs,
  adminGetLeagues, adminCreateLeague,
  getPayouts,
} from '../api/client';

const ADMIN_TABS = ['Overview', 'Seasons', 'Participants', 'Lineups', 'Stats & Scoring', 'Payouts', 'Audit Log', 'Users'];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [seasons,   setSeasons]   = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);

  useEffect(() => {
    adminGetSeasons().then(s => {
      setSeasons(s);
      if (s.length) setSelectedSeason(s[0]);
    }).catch(() => {});
  }, []);

  const reloadSeasons = () =>
    adminGetSeasons().then(s => { setSeasons(s); if (s.length && !selectedSeason) setSelectedSeason(s[0]); });

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          {seasons.length > 0 && (
            <select
              value={selectedSeason?.id || ''}
              onChange={e => setSelectedSeason(seasons.find(s => s.id === e.target.value))}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            >
              {seasons.map(s => <option key={s.id} value={s.id}>{s.league_name} — {s.nfl_season}</option>)}
            </select>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 bg-slate-800 rounded-xl p-1 border border-slate-700">
          {ADMIN_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs px-3 py-2 rounded-lg transition font-medium whitespace-nowrap ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview'    && <OverviewTab   season={selectedSeason} />}
        {activeTab === 'Seasons'     && <SeasonsTab    seasons={seasons} onChanged={reloadSeasons} setSelected={setSelectedSeason} />}
        {activeTab === 'Participants'&& <ParticipantsTab season={selectedSeason} />}
        {activeTab === 'Lineups'     && <LineupsTab    season={selectedSeason} />}
        {activeTab === 'Stats & Scoring' && <StatsTab  season={selectedSeason} />}
        {activeTab === 'Payouts'     && <PayoutsAdminTab season={selectedSeason} />}
        {activeTab === 'Audit Log'   && <AuditTab />}
        {activeTab === 'Users'       && <UsersTab />}
      </div>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ season }) {
  const [participants, setParticipants] = useState([]);
  const [weeks, setWeeks] = useState([]);

  useEffect(() => {
    if (!season) return;
    Promise.all([
      adminGetParticipants(season.id),
      adminGetWeeks(season.id),
    ]).then(([p, w]) => { setParticipants(p); setWeeks(w); });
  }, [season]);

  if (!season) return <p className="text-slate-400">No season selected.</p>;

  const paid   = participants.filter(p => p.paid).length;
  const unpaid = participants.length - paid;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Players"  value={participants.length} />
        <StatCard label="Paid"           value={paid}   color="green" />
        <StatCard label="Unpaid"         value={unpaid} color={unpaid > 0 ? 'red' : 'green'} />
        <StatCard label="Total Pot"      value={`$${(paid * (season.entry_fee || 0)).toFixed(0)}`} />
      </div>
      <div>
        <h2 className="font-bold mb-3">Playoff Weeks</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {weeks.map(w => {
            const locked = w.lock_time && new Date() >= new Date(new Date(w.lock_time).getTime() - 5 * 60 * 1000);
            return (
              <div key={w.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <div className="text-xs text-slate-400">Week {w.week_number}</div>
                <div className="font-semibold text-sm mt-1">{w.label}</div>
                <div className={`text-xs mt-2 ${locked ? 'text-yellow-400' : 'text-green-400'}`}>
                  {locked ? '🔒 Locked' : '🔓 Open'}
                </div>
                {w.scoring_complete ? <div className="text-xs text-blue-400 mt-0.5">✓ Scored</div> : null}
                {w.lock_time && (
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(w.lock_time).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Seasons ───────────────────────────────────────────────────────────────────
function SeasonsTab({ seasons, onChanged, setSelected }) {
  const [leagues, setLeagues]   = useState([]);
  const [form,    setForm]      = useState({ leagueId: '', nflSeason: '' });
  const [wkForm,  setWkForm]    = useState({ seasonId: '', weekNumber: '', label: '', lockTime: '' });
  const [newLeague, setNewLeague] = useState({ name: '', entryFee: '' });
  const [msg, setMsg]           = useState('');
  const [weeks, setWeeks]       = useState({});

  useEffect(() => { adminGetLeagues().then(setLeagues); }, []);

  async function createLeague(e) {
    e.preventDefault();
    try {
      await adminCreateLeague({ name: newLeague.name, entryFee: parseFloat(newLeague.entryFee) });
      const l = await adminGetLeagues();
      setLeagues(l);
      setNewLeague({ name: '', entryFee: '' });
      setMsg('League created.');
    } catch (err) { setMsg(err.message); }
  }

  async function createSeason(e) {
    e.preventDefault();
    try {
      await adminCreateSeason(form);
      await onChanged();
      setMsg('Season created.');
    } catch (err) { setMsg(err.message); }
  }

  async function createWeek(e) {
    e.preventDefault();
    try {
      await adminCreateWeek(wkForm);
      setMsg('Week created.');
    } catch (err) { setMsg(err.message); }
  }

  async function loadWeeks(seasonId) {
    const w = await adminGetWeeks(seasonId);
    setWeeks(prev => ({ ...prev, [seasonId]: w }));
  }

  async function updateLockTime(weekId, lockTime) {
    try {
      await adminUpdateWeek(weekId, { lockTime });
      setMsg('Lock time updated.');
      for (const sid of Object.keys(weeks)) loadWeeks(sid);
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="space-y-8">
      {msg && <p className="text-green-400 text-sm">{msg}</p>}

      {/* Create League */}
      <Section title="Create League">
        <form onSubmit={createLeague} className="flex flex-wrap gap-3">
          <input placeholder="League name" value={newLeague.name} onChange={e => setNewLeague(p => ({ ...p, name: e.target.value }))} required className={input} />
          <input placeholder="Entry fee $" type="number" value={newLeague.entryFee} onChange={e => setNewLeague(p => ({ ...p, entryFee: e.target.value }))} required className={`${input} w-32`} />
          <button type="submit" className={btnPrimary}>Create League</button>
        </form>
      </Section>

      {/* Leagues list */}
      {leagues.length > 0 && (
        <Section title="Existing Leagues">
          <div className="space-y-2">
            {leagues.map(l => (
              <div key={l.id} className="flex items-center justify-between bg-slate-700 rounded-lg px-4 py-2">
                <span className="font-medium">{l.name}</span>
                <span className="text-slate-400 text-sm">Entry fee: ${l.entry_fee}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Create Season */}
      <Section title="Create Season">
        <form onSubmit={createSeason} className="flex flex-wrap gap-3">
          <select value={form.leagueId} onChange={e => setForm(p => ({ ...p, leagueId: e.target.value }))} required className={input}>
            <option value="">Select league</option>
            {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input placeholder="NFL Season year e.g. 2024" type="number" value={form.nflSeason} onChange={e => setForm(p => ({ ...p, nflSeason: e.target.value }))} required className={`${input} w-48`} />
          <button type="submit" className={btnPrimary}>Create Season</button>
        </form>
      </Section>

      {/* Season list with weeks */}
      <Section title="Seasons & Playoff Weeks">
        {seasons.map(s => (
          <div key={s.id} className="mb-4 border border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-700">
              <span className="font-semibold">{s.league_name} — {s.nfl_season}</span>
              <div className="flex items-center gap-3">
                <select
                  value={s.status}
                  onChange={async e => { await adminUpdateSeason(s.id, { status: e.target.value }); await onChanged(); }}
                  className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="complete">Complete</option>
                </select>
                <button onClick={() => loadWeeks(s.id)} className="text-xs text-blue-400 hover:underline">
                  {weeks[s.id] ? 'Refresh weeks' : 'Show weeks'}
                </button>
              </div>
            </div>
            {weeks[s.id] && (
              <div className="p-4 space-y-2">
                {weeks[s.id].map(w => (
                  <div key={w.id} className="flex flex-wrap items-center gap-3 bg-slate-750 py-2">
                    <span className="text-sm font-medium w-40">{w.label}</span>
                    <input
                      type="datetime-local"
                      defaultValue={w.lock_time ? w.lock_time.slice(0, 16) : ''}
                      onBlur={e => updateLockTime(w.id, e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                    />
                    <span className={`text-xs ${w.scoring_complete ? 'text-blue-400' : 'text-slate-400'}`}>
                      {w.scoring_complete ? '✓ Scored' : 'Not scored'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Section>

      {/* Create Week */}
      <Section title="Add Playoff Week">
        <form onSubmit={createWeek} className="flex flex-wrap gap-3">
          <select value={wkForm.seasonId} onChange={e => setWkForm(p => ({ ...p, seasonId: e.target.value }))} required className={input}>
            <option value="">Select season</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.league_name} — {s.nfl_season}</option>)}
          </select>
          <input placeholder="Week # (1-4)" type="number" min="1" max="4" value={wkForm.weekNumber} onChange={e => setWkForm(p => ({ ...p, weekNumber: e.target.value }))} required className={`${input} w-24`} />
          <input placeholder="Label e.g. Wild Card Week" value={wkForm.label} onChange={e => setWkForm(p => ({ ...p, label: e.target.value }))} required className={input} />
          <input type="datetime-local" value={wkForm.lockTime} onChange={e => setWkForm(p => ({ ...p, lockTime: e.target.value }))} className={input} />
          <button type="submit" className={btnPrimary}>Add Week</button>
        </form>
      </Section>
    </div>
  );
}

// ── Participants ──────────────────────────────────────────────────────────────
function ParticipantsTab({ season }) {
  const [participants, setParticipants] = useState([]);
  const [newEmail, setNewEmail]         = useState('');
  const [msg, setMsg]                   = useState('');

  const reload = useCallback(() => {
    if (season) adminGetParticipants(season.id).then(setParticipants);
  }, [season]);
  useEffect(() => { reload(); }, [reload]);

  async function addParticipant(e) {
    e.preventDefault();
    try {
      await adminAddParticipant({ seasonId: season.id, email: newEmail });
      setNewEmail('');
      setMsg(`${newEmail} added.`);
      reload();
    } catch (err) { setMsg(err.message); }
  }

  async function togglePaid(p) {
    await adminSetPaid(p.id, !p.paid);
    reload();
  }

  if (!season) return <p className="text-slate-400">Select a season.</p>;

  return (
    <div className="space-y-6">
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      <Section title="Add Participant">
        <form onSubmit={addParticipant} className="flex gap-3">
          <input
            type="email"
            placeholder="player@example.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            required
            className={input}
          />
          <button type="submit" className={btnPrimary}>Add</button>
        </form>
      </Section>
      <Section title={`Participants (${participants.length})`}>
        <div className="space-y-2">
          {participants.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-slate-700 rounded-lg px-4 py-3">
              <div>
                <span className="font-medium">{p.display_name || p.email}</span>
                {p.display_name && <span className="text-slate-400 text-xs ml-2">{p.email}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded ${p.paid ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                  {p.paid ? 'Paid' : 'Unpaid'}
                </span>
                <button
                  onClick={() => togglePaid(p)}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Mark {p.paid ? 'Unpaid' : 'Paid'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Lineups ───────────────────────────────────────────────────────────────────
function LineupsTab({ season }) {
  const [weeks,   setWeeks]   = useState([]);
  const [weekId,  setWeekId]  = useState('');
  const [lineups, setLineups] = useState([]);
  const [msg,     setMsg]     = useState('');

  useEffect(() => {
    if (season) adminGetWeeks(season.id).then(w => { setWeeks(w); if (w.length) setWeekId(w[0].id); });
  }, [season]);

  useEffect(() => {
    if (weekId) adminGetLineups(weekId).then(setLineups);
  }, [weekId]);

  async function handleOverride(lineupId, newSlots) {
    try {
      await adminOverrideLineup(lineupId, newSlots);
      setMsg('Lineup overridden and audit logged.');
      adminGetLineups(weekId).then(setLineups);
    } catch (err) { setMsg(err.message); }
  }

  if (!season) return <p className="text-slate-400">Select a season.</p>;

  return (
    <div className="space-y-4">
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-slate-400">Week:</label>
        <select value={weekId} onChange={e => setWeekId(e.target.value)} className={`${input} w-auto`}>
          {weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </div>
      {lineups.length === 0 ? (
        <p className="text-slate-400 text-sm">No lineups submitted for this week.</p>
      ) : (
        <div className="space-y-3">
          {lineups.map(lineup => (
            <LineupAdminCard key={lineup.id} lineup={lineup} onOverride={slots => handleOverride(lineup.id, slots)} />
          ))}
        </div>
      )}
    </div>
  );
}

function LineupAdminCard({ lineup, onOverride }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium">{lineup.display_name || lineup.email}</span>
        <div className="flex items-center gap-2">
          {lineup.admin_override ? <span className="text-xs text-yellow-400">Admin Override</span> : null}
          <button onClick={() => setEditing(!editing)} className="text-xs text-blue-400 hover:underline">
            {editing ? 'Cancel' : 'Override'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        {['QB','RB','FLEX'].map(slotType => {
          const slot = lineup.slots?.find(s => s.slot_type === slotType);
          return (
            <div key={slotType} className="bg-slate-700 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">{slotType}</div>
              <div>{slot ? `${slot.full_name} (${slot.nfl_team})` : '—'}</div>
            </div>
          );
        })}
      </div>
      {editing && (
        <div className="mt-3 text-sm text-slate-400 italic">
          Override not implemented in this UI panel — use the API endpoint directly.
          <br /><code>PATCH /api/admin/lineups/{lineup.id}</code>
        </div>
      )}
    </div>
  );
}

// ── Stats & Scoring ───────────────────────────────────────────────────────────
function StatsTab({ season }) {
  const [weeks,    setWeeks]    = useState([]);
  const [weekId,   setWeekId]   = useState('');
  const [stats,    setStats]    = useState([]);
  const [players,  setPlayers]  = useState([]);
  const [form,     setForm]     = useState({ playerId: '', passingYards: 0, rushingYards: 0, receivingYards: 0, passingTds: 0, rushingTds: 0, receivingTds: 0, interceptions: 0 });
  const [msg,      setMsg]      = useState('');
  const [scoring,  setScoring]  = useState(false);

  useEffect(() => {
    if (!season) return;
    adminGetWeeks(season.id).then(w => { setWeeks(w); if (w.length) setWeekId(w[0].id); });
    // Load all players from API
    import('../api/client').then(({ getPlayers }) => getPlayers().then(setPlayers));
  }, [season]);

  useEffect(() => {
    if (weekId) adminGetStats(weekId).then(setStats);
  }, [weekId]);

  async function saveStats(e) {
    e.preventDefault();
    try {
      await adminPutStats({ ...form, weekId });
      setMsg('Stats saved.');
      adminGetStats(weekId).then(setStats);
    } catch (err) { setMsg(err.message); }
  }

  async function calcScores() {
    setScoring(true);
    try {
      const r = await triggerScoring(weekId);
      setMsg(`Scored ${r.results?.length || 0} lineups.`);
    } catch (err) { setMsg(err.message); }
    setScoring(false);
  }

  if (!season) return <p className="text-slate-400">Select a season.</p>;

  return (
    <div className="space-y-6">
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      <div className="flex gap-3 items-center flex-wrap">
        <label className="text-sm text-slate-400">Week:</label>
        <select value={weekId} onChange={e => setWeekId(e.target.value)} className={`${input} w-auto`}>
          {weeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
        <button onClick={calcScores} disabled={scoring} className={btnPrimary}>
          {scoring ? 'Calculating…' : 'Trigger Score Calculation'}
        </button>
      </div>

      <Section title="Enter / Update Player Stats">
        <form onSubmit={saveStats} className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Player</label>
            <select value={form.playerId} onChange={e => setForm(p => ({ ...p, playerId: e.target.value }))} required className={input}>
              <option value="">— Select player —</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.fullName} ({p.nflTeam} — {p.position})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['passingYards',  'Pass Yds'],
              ['rushingYards',  'Rush Yds'],
              ['receivingYards','Rec Yds'],
              ['passingTds',   'Pass TDs'],
              ['rushingTds',   'Rush TDs'],
              ['receivingTds', 'Rec TDs'],
              ['interceptions','INTs'],
            ].map(([field, label]) => (
              <div key={field}>
                <label className="text-xs text-slate-400 block mb-1">{label}</label>
                <input
                  type="number"
                  min="0"
                  value={form[field]}
                  onChange={e => setForm(p => ({ ...p, [field]: Number(e.target.value) }))}
                  className={`${input} w-full`}
                />
              </div>
            ))}
          </div>
          <button type="submit" className={btnPrimary}>Save Stats</button>
        </form>
      </Section>

      <Section title={`Current Stats — ${weeks.find(w => w.id === weekId)?.label || ''}`}>
        {stats.length === 0 ? (
          <p className="text-slate-400 text-sm">No stats entered for this week.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-700">
                <tr>
                  {['Player','Pos','Team','Pass Yds','Rush Yds','Rec Yds','Pass TD','Rush TD','Rec TD','INT'].map(h => (
                    <th key={h} className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.id} className="border-t border-slate-700">
                    <td className="px-3 py-2">{s.full_name}</td>
                    <td className="px-3 py-2">{s.position}</td>
                    <td className="px-3 py-2">{s.nfl_team}</td>
                    <td className="px-3 py-2">{s.passing_yards}</td>
                    <td className="px-3 py-2">{s.rushing_yards}</td>
                    <td className="px-3 py-2">{s.receiving_yards}</td>
                    <td className="px-3 py-2">{s.passing_tds}</td>
                    <td className="px-3 py-2">{s.rushing_tds}</td>
                    <td className="px-3 py-2">{s.receiving_tds}</td>
                    <td className="px-3 py-2 text-red-400">{s.interceptions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Payouts Admin ─────────────────────────────────────────────────────────────
function PayoutsAdminTab({ season }) {
  const [payout, setPayout] = useState(null);
  const [rules,  setRules]  = useState([]);
  const [msg,    setMsg]    = useState('');

  const reload = useCallback(() => {
    if (!season) return;
    Promise.all([
      getPayouts(season.id),
      adminGetPayoutRules(season.id),
    ]).then(([p, r]) => { setPayout(p); setRules(r); });
  }, [season]);

  useEffect(() => { reload(); }, [reload]);

  async function updateRule(rule, field, val) {
    const updated = { ...rule, [field]: parseFloat(val) };
    try {
      await adminUpdatePayoutRule(rule.id, {
        firstPct:  updated.first_pct,
        secondPct: updated.second_pct,
        thirdPct:  updated.third_pct,
        fourthPct: updated.fourth_pct,
        housePct:  updated.house_pct,
      });
      setMsg('Rule updated.');
      reload();
    } catch (err) { setMsg(err.message); }
  }

  if (!season) return <p className="text-slate-400">Select a season.</p>;

  return (
    <div className="space-y-6">
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      <PayoutTable payout={payout} />
      <Section title="Payout Rules (edit percentages)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700">
              <tr>
                {['Players','1st %','2nd %','3rd %','4th %','House %'].map(h => (
                  <th key={h} className="px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-t border-slate-700">
                  <td className="px-3 py-2">{r.min_players}–{r.max_players}</td>
                  {['first_pct','second_pct','third_pct','fourth_pct','house_pct'].map(field => (
                    <td key={field} className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={r[field]}
                        onBlur={e => updateRule(r, field, e.target.value)}
                        className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
function AuditTab() {
  const [logs,   setLogs]   = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    adminGetAuditLogs({ limit: 200 }).then(setLogs);
  }, []);

  const filtered = filter
    ? logs.filter(l => l.action.includes(filter) || l.target_type?.includes(filter))
    : logs;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          placeholder="Filter by action…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className={`${input} w-64`}
        />
      </div>
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-700">
            <tr>
              {['Time','Action','Actor','Target','Details'].map(h => (
                <th key={h} className="px-3 py-2 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map(log => (
              <tr key={log.id} className="border-t border-slate-700 hover:bg-slate-750">
                <td className="px-3 py-2 whitespace-nowrap text-slate-400">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-medium text-blue-300">{log.action}</td>
                <td className="px-3 py-2 text-slate-400">{log.actor_id?.slice(0, 8) || '—'}</td>
                <td className="px-3 py-2 text-slate-400">{log.target_type || '—'}</td>
                <td className="px-3 py-2 text-slate-500 max-w-xs truncate">
                  {log.details ? JSON.stringify(log.details) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [msg,   setMsg]   = useState('');

  useEffect(() => { adminGetUsers().then(setUsers); }, []);

  async function toggleRole(user) {
    const newRole = user.role === 'admin' ? 'player' : 'admin';
    try {
      await adminUpdateUserRole(user.id, newRole);
      setMsg(`${user.email} is now ${newRole}.`);
      adminGetUsers().then(setUsers);
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
            <div>
              <span className="font-medium">{u.display_name || u.email}</span>
              {u.display_name && <span className="text-slate-400 text-xs ml-2">{u.email}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded ${u.role === 'admin' ? 'bg-blue-900 text-blue-200' : 'bg-slate-700 text-slate-300'}`}>
                {u.role}
              </span>
              <button onClick={() => toggleRole(u)} className="text-xs text-blue-400 hover:underline">
                Make {u.role === 'admin' ? 'Player' : 'Admin'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <h3 className="font-semibold mb-3 text-slate-200">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ label, value, color = 'default' }) {
  const colors = {
    green:   'text-green-400',
    red:     'text-red-400',
    default: 'text-white',
  };
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 text-center">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
    </div>
  );
}

const input = 'bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const btnPrimary = 'bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition';
