import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import LineupBuilder from '../components/LineupBuilder';
import PicksHistory  from '../components/PicksHistory';
import Standings     from '../components/Standings';
import PayoutTable   from '../components/PayoutTable';
import { useAuth } from '../contexts/AuthContext';
import {
  getSeasons, getWeeks, getMyEntry, getMyLineups,
  getEntryScores, getStandings, getPayouts,
  getWeekLineups,
} from '../api/client';

const TABS = ['My Picks', 'Standings', 'Payouts', 'All Lineups'];

export default function PlayerDashboard() {
  const { user } = useAuth();
  const [seasons,    setSeasons]   = useState([]);
  const [seasonId,   setSeasonId]  = useState('');
  const [weeks,      setWeeks]     = useState([]);
  const [entry,      setEntry]     = useState(null);
  const [myLineups,  setMyLineups] = useState([]);
  const [myScores,   setMyScores]  = useState({ scores: [], totalPoints: 0 });
  const [standings,  setStandings] = useState([]);
  const [payout,     setPayout]    = useState(null);
  const [allLineups, setAllLineups] = useState([]);
  const [activeTab,  setActiveTab] = useState('My Picks');
  const [activeWeek, setActiveWeek] = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState('');

  // ── Load seasons on mount ──────────────────────────────────────────────────
  useEffect(() => {
    getSeasons()
      .then(s => {
        setSeasons(s);
        if (s.length) setSeasonId(s[0].id);
      })
      .catch(e => setError(e.message));
  }, []);

  // ── Load everything when season changes ───────────────────────────────────
  const reload = useCallback(async () => {
    if (!seasonId) return;
    setLoading(true);
    setError('');
    try {
      const [wks, ent] = await Promise.all([
        getWeeks(seasonId),
        getMyEntry(seasonId),
      ]);
      setWeeks(wks);
      setEntry(ent);

      const currentOrLast = wks.filter(w => {
        const locked = w.lock_time && new Date() >= new Date(new Date(w.lock_time).getTime() - 5 * 60 * 1000);
        return locked || !w.lock_time;
      });
      const current = currentOrLast[currentOrLast.length - 1] || wks[0];
      setActiveWeek(current);

      if (ent) {
        const [lineups, scores, standing, payoutData] = await Promise.all([
          getMyLineups(seasonId),
          getEntryScores(ent.id),
          getStandings(seasonId),
          getPayouts(seasonId),
        ]);
        setMyLineups(lineups);
        setMyScores(scores);
        setStandings(standing);
        setPayout(payoutData);
      } else {
        const [standing, payoutData] = await Promise.all([
          getStandings(seasonId),
          getPayouts(seasonId),
        ]);
        setStandings(standing);
        setPayout(payoutData);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => { reload(); }, [reload]);

  // ── Load all lineups when tab changes ──────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'All Lineups' && activeWeek) {
      getWeekLineups(activeWeek.id)
        .then(setAllLineups)
        .catch(() => setAllLineups([]));
    }
  }, [activeTab, activeWeek]);

  // ── Current week info ──────────────────────────────────────────────────────
  const isLocked = activeWeek?.lock_time &&
    new Date() >= new Date(new Date(activeWeek.lock_time).getTime() - 5 * 60 * 1000);

  const myCurrentLineup = myLineups.find(l => l.week_id === activeWeek?.id);

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">{user?.displayName || user?.email}</p>
          </div>
          {seasons.length > 1 && (
            <select
              value={seasonId}
              onChange={e => setSeasonId(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            >
              {seasons.map(s => <option key={s.id} value={s.id}>{s.league_name} — {s.nfl_season}</option>)}
            </select>
          )}
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-400 py-20">Loading your league data…</div>
        ) : (
          <>
            {/* Entry status banner */}
            {!entry && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 mb-6 text-yellow-300 text-sm">
                You are not enrolled as a participant in this season. Contact the admin to be added.
              </div>
            )}
            {entry && !entry.paid && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6 text-red-300 text-sm">
                <strong>Payment Required:</strong> Your entry fee is due before Week 1 games begin. Contact the admin.
              </div>
            )}

            {/* Week status cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {weeks.map(w => {
                const locked = w.lock_time && new Date() >= new Date(new Date(w.lock_time).getTime() - 5 * 60 * 1000);
                const isActive = w.id === activeWeek?.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setActiveWeek(w)}
                    className={`rounded-xl p-3 border text-left transition ${
                      isActive
                        ? 'border-blue-500 bg-blue-900/30'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-xs text-slate-400 mb-1">Week {w.week_number}</div>
                    <div className="text-sm font-semibold">{w.label}</div>
                    <div className={`text-xs mt-1 ${locked ? 'text-yellow-400' : 'text-green-400'}`}>
                      {locked ? '🔒 Locked' : '🔓 Open'}
                    </div>
                    {w.scoring_complete ? (
                      <div className="text-xs text-blue-400 mt-0.5">✓ Scored</div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Score summary */}
            {entry && (
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-400">Total Postseason Score</div>
                    <div className="text-4xl font-extrabold text-blue-400">
                      {(myScores.totalPoints || 0).toFixed(1)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">points</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">
                      Current Week: <strong className="text-white">{activeWeek?.label}</strong>
                    </div>
                    <div className="text-sm text-slate-400 mt-1">
                      Deadline: {activeWeek?.lock_time
                        ? new Date(activeWeek.lock_time).toLocaleString()
                        : 'TBD'}
                    </div>
                    <div className={`text-sm mt-1 font-semibold ${isLocked ? 'text-yellow-400' : 'text-green-400'}`}>
                      {isLocked ? '🔒 Picks Locked' : '🔓 Picks Open'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-slate-800 rounded-xl p-1 border border-slate-700">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 text-sm py-2 rounded-lg transition font-medium ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'My Picks' && (
              <div className="space-y-6">
                {entry && !isLocked && activeWeek && (
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                    <h2 className="font-bold mb-4">
                      {myCurrentLineup ? 'Update Your Lineup' : 'Submit Lineup'} — {activeWeek.label}
                    </h2>
                    <LineupBuilder week={activeWeek} entry={entry} onSaved={reload} />
                  </div>
                )}
                <div>
                  <h2 className="font-bold mb-3">Your Picks History</h2>
                  <PicksHistory lineups={myLineups} scores={myScores.scores} />
                </div>
              </div>
            )}

            {activeTab === 'Standings' && (
              <div>
                <h2 className="font-bold mb-3">League Standings</h2>
                <Standings standings={standings} currentUserId={user?.id} />
              </div>
            )}

            {activeTab === 'Payouts' && (
              <div>
                <h2 className="font-bold mb-3">Payout Projections</h2>
                <PayoutTable payout={payout} />
              </div>
            )}

            {activeTab === 'All Lineups' && (
              <div>
                <h2 className="font-bold mb-3">
                  All Lineups — {activeWeek?.label}
                  {!isLocked && (
                    <span className="ml-2 text-xs text-yellow-400 font-normal">(visible after picks lock)</span>
                  )}
                </h2>
                {allLineups.length === 0 ? (
                  <p className="text-slate-400 text-sm">
                    {isLocked ? 'No lineups submitted this week.' : 'Lineups will be visible after picks lock.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {allLineups.map(lineup => (
                      <div key={lineup.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                        <div className="font-medium mb-3">{lineup.display_name || lineup.email}</div>
                        <div className="grid grid-cols-3 gap-3">
                          {['QB','RB','FLEX'].map(slotType => {
                            const slot = lineup.slots?.find(s => s.slot_type === slotType);
                            return (
                              <div key={slotType} className="bg-slate-700 rounded-lg p-3 text-center">
                                <div className="text-xs text-slate-400 mb-1">{slotType}</div>
                                {slot ? (
                                  <>
                                    <div className="text-sm font-medium">{slot.full_name}</div>
                                    <div className="text-xs text-slate-500">{slot.nfl_team}</div>
                                  </>
                                ) : <div className="text-slate-500">—</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
