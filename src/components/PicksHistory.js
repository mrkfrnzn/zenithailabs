import React from 'react';

export default function PicksHistory({ lineups, scores = [] }) {
  const scoreByWeek = {};
  for (const s of scores) scoreByWeek[s.week_id] = s;

  if (!lineups || lineups.length === 0) {
    return <p className="text-slate-400 text-sm">No picks submitted yet.</p>;
  }

  return (
    <div className="space-y-4">
      {lineups.map(lineup => {
        const weekScore = scoreByWeek[lineup.week_id];
        return (
          <div key={lineup.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-750 border-b border-slate-700">
              <div>
                <span className="font-semibold">{lineup.week_label}</span>
                {lineup.admin_override ? (
                  <span className="ml-2 text-xs bg-yellow-700 text-yellow-100 px-2 py-0.5 rounded">Admin Override</span>
                ) : null}
              </div>
              {weekScore ? (
                <span className="text-blue-300 font-bold">{weekScore.total_points.toFixed(1)} pts</span>
              ) : (
                <span className="text-slate-500 text-sm">Scoring pending</span>
              )}
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-700">
              {['QB', 'RB', 'FLEX'].map(slotType => {
                const slot = lineup.slots?.find(s => s.slot_type === slotType);
                const pts  = weekScore
                  ? (slotType === 'QB'   ? weekScore.qb_points
                  :  slotType === 'RB'   ? weekScore.rb_points
                  :                       weekScore.flex_points)
                  : null;
                return (
                  <div key={slotType} className="p-3 text-center">
                    <div className="text-xs text-slate-400 mb-1">{slotType}</div>
                    {slot ? (
                      <>
                        <div className="text-sm font-medium">{slot.full_name}</div>
                        <div className="text-xs text-slate-500">{slot.nfl_team}</div>
                        {pts !== null && (
                          <div className={`text-xs mt-1 font-semibold ${pts >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pts.toFixed(1)} pts
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-slate-500 text-sm">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
