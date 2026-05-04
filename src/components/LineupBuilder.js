import React, { useState, useEffect } from 'react';
import { getPlayers, getUsedPlayers, submitLineup } from '../api/client';

export default function LineupBuilder({ week, entry, onSaved }) {
  const [players,   setPlayers]   = useState([]);
  const [usedIds,   setUsedIds]   = useState(new Set());
  const [slots,     setSlots]     = useState({ QB: '', RB: '', FLEX: '' });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [all, used] = await Promise.all([
          getPlayers(),
          getUsedPlayers(entry.id),
        ]);
        setPlayers(all);
        setUsedIds(new Set(used.map(u => u.playerId)));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [entry.id]);

  const byPosition = pos => players.filter(p => p.position === pos && !usedIds.has(p.id));
  const flexPlayers = players.filter(p => ['WR', 'TE'].includes(p.position) && !usedIds.has(p.id));

  // Also exclude players already picked in THIS current lineup (across slots)
  const pickedIds = new Set(Object.values(slots).filter(Boolean));
  const available = (list, currentSlot) =>
    list.filter(p => !pickedIds.has(p.id) || slots[currentSlot] === p.id);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!slots.QB || !slots.RB || !slots.FLEX) {
      setError('All 3 slots must be filled.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await submitLineup(week.id, entry.id, slots);
      setSuccess('Lineup saved!');
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading players…</p>;

  const isLocked = week.lock_time && new Date() >= new Date(new Date(week.lock_time).getTime() - 5 * 60 * 1000);

  if (isLocked) {
    return (
      <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-yellow-300 text-sm">
        Picks are locked for this week.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 text-sm rounded-lg px-4 py-3">
          {success}
        </div>
      )}

      <SlotSelect
        label="Quarterback (QB)"
        slot="QB"
        value={slots.QB}
        options={available(byPosition('QB'), 'QB')}
        onChange={v => setSlots(s => ({ ...s, QB: v }))}
      />
      <SlotSelect
        label="Running Back (RB)"
        slot="RB"
        value={slots.RB}
        options={available(byPosition('RB'), 'RB')}
        onChange={v => setSlots(s => ({ ...s, RB: v }))}
      />
      <SlotSelect
        label="Flex — Wide Receiver or Tight End"
        slot="FLEX"
        value={slots.FLEX}
        options={available(flexPlayers, 'FLEX')}
        onChange={v => setSlots(s => ({ ...s, FLEX: v }))}
      />

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
      >
        {saving ? 'Saving…' : 'Save Lineup'}
      </button>

      <p className="text-slate-500 text-xs text-center">
        Players grayed out = already used in a prior week.
        Picks lock 5 min before first kickoff.
      </p>
    </form>
  );
}

function SlotSelect({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-slate-300">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— Select player —</option>
        {options.map(p => (
          <option key={p.id} value={p.id}>
            {p.fullName} ({p.nflTeam})
          </option>
        ))}
      </select>
      {options.length === 0 && (
        <p className="text-yellow-500 text-xs mt-1">No available players for this slot.</p>
      )}
    </div>
  );
}
