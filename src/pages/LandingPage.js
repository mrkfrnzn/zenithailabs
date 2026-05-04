import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SCORING_RULES = [
  { label: 'Yards (all types)',    value: '1 pt / yard' },
  { label: 'Touchdowns',           value: '+25 pts each' },
  { label: 'Interceptions (QB)',   value: '-25 pts each' },
  { label: 'QB Rushing Yards',     value: 'Always positive' },
];

const WEEKS = [
  { num: 1, label: 'Wild Card Week',          icon: '🏈' },
  { num: 2, label: 'Divisional Round',         icon: '⚔️' },
  { num: 3, label: 'Conference Championships', icon: '🏆' },
  { num: 4, label: 'Super Bowl',               icon: '⭐' },
];

const LINEUP_SLOTS = [
  { slot: 'QB',   desc: '1 Quarterback' },
  { slot: 'RB',   desc: '1 Running Back' },
  { slot: 'FLEX', desc: '1 Wide Receiver or Tight End' },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Nav */}
      <nav className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-blue-400">NFL Survivor League</span>
        <div className="flex gap-3">
          {user ? (
            <Link
              to={user.role === 'admin' ? '/admin' : '/dashboard'}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Join / Log In
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-20 px-6">
        <h1 className="text-5xl font-extrabold mb-4">
          NFL Fantasy Playoff <span className="text-blue-400">Survivor League</span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
          Pick a QB, RB, and WR/TE each playoff week. Never reuse a player.
          The highest scorer after the Super Bowl takes the pot.
        </p>
        {!user && (
          <Link
            to="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-3 rounded-xl font-semibold transition"
          >
            Join the League →
          </Link>
        )}
      </section>

      {/* How It Works */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card title="1. Join & Pay" icon="💳">
            Pay your entry fee before Wild Card Week. Unpaid entries are flagged.
          </Card>
          <Card title="2. Submit Weekly Picks" icon="📋">
            Each playoff week, pick one QB, one RB, and one WR or TE. You cannot reuse
            any player you've already picked.
          </Card>
          <Card title="3. Score & Win" icon="🏆">
            Yards = 1 pt. TDs = 25 pts. INTs = -25 pts. Highest total after
            the Super Bowl wins the pot.
          </Card>
        </div>

        {/* Playoff Weeks */}
        <h2 className="text-2xl font-bold mb-6 text-center">The 4 Playoff Weeks</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {WEEKS.map(w => (
            <div key={w.num} className="bg-slate-800 rounded-xl p-5 text-center border border-slate-700">
              <div className="text-3xl mb-2">{w.icon}</div>
              <div className="text-sm text-slate-400 mb-1">Week {w.num}</div>
              <div className="font-semibold text-sm">{w.label}</div>
            </div>
          ))}
        </div>

        {/* Weekly Lineup */}
        <h2 className="text-2xl font-bold mb-6 text-center">Weekly Lineup</h2>
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-12">
          <div className="grid md:grid-cols-3 gap-4">
            {LINEUP_SLOTS.map(s => (
              <div key={s.slot} className="bg-slate-700 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-400 mb-1">{s.slot}</div>
                <div className="text-sm text-slate-300">{s.desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-400 text-sm mt-4">
            Picks lock 5 minutes before the first kickoff each week. After lock, all lineups are visible.
          </p>
        </div>

        {/* Scoring */}
        <h2 className="text-2xl font-bold mb-6 text-center">Scoring Rules</h2>
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-12">
          <div className="grid md:grid-cols-2 gap-3">
            {SCORING_RULES.map(r => (
              <div key={r.label} className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0">
                <span className="text-slate-300">{r.label}</span>
                <span className="font-semibold text-blue-300">{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment */}
        <h2 className="text-2xl font-bold mb-6 text-center">Payment</h2>
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-12 text-center">
          <p className="text-slate-300 mb-2">
            Entry fee is due <strong>before Wild Card Week games begin.</strong>
          </p>
          <p className="text-slate-400 text-sm">
            Contact the league admin for payment instructions (Venmo, Zelle, Cash, etc.).
            Unpaid participants are visible to the admin and flagged on the dashboard.
          </p>
        </div>

        {/* Payouts preview */}
        <h2 className="text-2xl font-bold mb-6 text-center">Prize Pool</h2>
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden mb-12">
          <table className="w-full text-sm">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Players</th>
                <th className="px-4 py-3 text-right">1st</th>
                <th className="px-4 py-3 text-right">2nd</th>
                <th className="px-4 py-3 text-right">3rd</th>
                <th className="px-4 py-3 text-right">4th</th>
                <th className="px-4 py-3 text-right">House</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['1 – 5',   '90%', '—',  '—',  '—',  '10%'],
                ['6 – 10',  '70%', '20%','—',  '—',  '10%'],
                ['11 – 15', '60%', '25%','5%', '—',  '10%'],
                ['16 – 20', '55%', '25%','10%','—',  '10%'],
                ['21 – 30', '50%', '25%','15%','—',  '10%'],
                ['31 – 50', '50%', '20%','15%','5%', '10%'],
              ].map(([players, ...cols], i) => (
                <tr key={i} className="border-t border-slate-700 hover:bg-slate-750">
                  <td className="px-4 py-2 font-medium">{players}</td>
                  {cols.map((c, j) => (
                    <td key={j} className={`px-4 py-2 text-right ${c !== '—' ? 'text-blue-300' : 'text-slate-500'}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-center">
          {!user ? (
            <Link
              to="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-3 rounded-xl font-semibold transition"
            >
              Join the League →
            </Link>
          ) : (
            <Link
              to={user.role === 'admin' ? '/admin' : '/dashboard'}
              className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-3 rounded-xl font-semibold transition"
            >
              Go to Dashboard →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({ title, icon, children }) {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-slate-400 text-sm">{children}</p>
    </div>
  );
}
