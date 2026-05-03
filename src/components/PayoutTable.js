import React from 'react';

export default function PayoutTable({ payout }) {
  if (!payout) return null;
  const { entryFee, paidCount, totalPot, prizePool, payouts } = payout;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Entry Fee"   value={`$${entryFee}`} />
        <StatCard label="Players Paid" value={paidCount} />
        <StatCard label="Total Pot"   value={`$${totalPot}`} />
        <StatCard label="Prize Pool"  value={`$${prizePool}`} />
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">Prize</th>
              <th className="px-4 py-3 text-left">Winner</th>
              <th className="px-4 py-3 text-right">%</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((row, i) => (
              <tr key={i} className="border-t border-slate-700">
                <td className="px-4 py-2 font-medium">{row.label}</td>
                <td className="px-4 py-2 text-slate-400">
                  {row.rank ? (row.displayName || '—') : 'League'}
                </td>
                <td className="px-4 py-2 text-right text-blue-300">{row.pct}%</td>
                <td className="px-4 py-2 text-right font-semibold text-green-400">
                  ${row.amount.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 text-center">
        House retains 10% of the total pot. Projections update as more players pay.
      </p>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 text-center">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}
