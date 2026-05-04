import React from 'react';

export default function Standings({ standings, currentUserId }) {
  if (!standings || standings.length === 0) {
    return <p className="text-slate-400 text-sm">Standings are not yet available.</p>;
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-700">
          <tr>
            <th className="px-4 py-3 text-left w-12">#</th>
            <th className="px-4 py-3 text-left">Player</th>
            <th className="px-4 py-3 text-right">Points</th>
            <th className="px-4 py-3 text-center">Paid</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(row => {
            const isMe = row.userId === currentUserId;
            return (
              <tr
                key={row.entryId}
                className={`border-t border-slate-700 ${isMe ? 'bg-blue-900/30' : 'hover:bg-slate-750'}`}
              >
                <td className="px-4 py-3">
                  {row.rank <= 3 ? (
                    <span>{['🥇','🥈','🥉'][row.rank - 1]}</span>
                  ) : (
                    <span className="text-slate-400">{row.rank}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">{row.displayName}</span>
                  {isMe && <span className="ml-2 text-xs text-blue-400">(you)</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-blue-300">
                  {(row.totalPoints || 0).toFixed(1)}
                </td>
                <td className="px-4 py-3 text-center">
                  {row.paid
                    ? <span className="text-green-400 text-xs">✓ Paid</span>
                    : <span className="text-red-400 text-xs">Unpaid</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
