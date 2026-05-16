import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';

interface LockedGoal {
  id: string; title: string; thrustArea: string; uomType: string; target: string; weightage: number; isLocked: boolean;
  goalSheet: { id: string; employee: { id: string; name: string; email: string; department: string; }; cycle: { id: string; year: number; phase: string; }; };
}

interface GoalUnlockModalProps { open: boolean; onClose: () => void; onSuccess: () => void; }

export function GoalUnlockModal({ open, onClose, onSuccess }: GoalUnlockModalProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LockedGoal[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<LockedGoal | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!open) { setQuery(''); setSearchResults([]); setSearchError(null); setSelectedGoal(null); setReason(''); setSubmitError(null); setSubmitSuccess(false); }
  }, [open]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true); setSearchError(null); setSearchResults([]); setSelectedGoal(null);
    try {
      const { data } = await api.get<LockedGoal[]>('/goals/search', { params: { q: query.trim() } });
      setSearchResults(data);
      if (data.length === 0) setSearchError('No locked goals found matching your search.');
    } catch (err: unknown) {
      setSearchError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Search failed.');
    } finally { setSearching(false); }
  }, [query]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal) return;
    setSubmitting(true); setSubmitError(null);
    try {
      await api.post(`/goals/${selectedGoal.id}/unlock`, { reason });
      setSubmitSuccess(true);
      onSuccess();
    } catch (err: unknown) {
      setSubmitError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to unlock goal.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Unlock a Goal</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">✕</button>
        </div>

        {submitSuccess ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 p-4 text-sm text-green-700">Goal "{selectedGoal?.title}" has been unlocked successfully.</div>
            <div className="flex justify-end"><button onClick={onClose} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Close</button></div>
          </div>
        ) : selectedGoal ? (
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
              <p className="font-semibold text-gray-900">{selectedGoal.title}</p>
              <p className="mt-1 text-gray-600">Employee: <span className="font-medium">{selectedGoal.goalSheet.employee.name}</span> ({selectedGoal.goalSheet.employee.email})</p>
              <p className="text-gray-600">Department: {selectedGoal.goalSheet.employee.department}</p>
              <p className="text-gray-600">Cycle: {selectedGoal.goalSheet.cycle.year} — {selectedGoal.goalSheet.cycle.phase}</p>
              <p className="mt-2"><span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">🔒 Locked</span></p>
            </div>
            <div>
              <label htmlFor="unlock-reason" className="block text-sm font-medium text-gray-700">Reason for unlock <span className="text-red-500">*</span></label>
              <textarea id="unlock-reason" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} placeholder="Provide a mandatory reason…" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            {submitError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
            <div className="flex justify-between gap-3 pt-1">
              <button type="button" onClick={() => setSelectedGoal(null)} disabled={submitting} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">← Back</button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={submitting || !reason.trim()} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{submitting ? 'Unlocking…' : 'Unlock Goal'}</button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Search for a locked goal by title or employee name.</p>
            <div className="flex gap-2">
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Goal title or employee name…" className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <button type="button" onClick={handleSearch} disabled={searching || !query.trim()} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{searching ? 'Searching…' : 'Search'}</button>
            </div>
            {searchError && <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">{searchError}</div>}
            {searchResults.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200">
                <ul className="divide-y divide-gray-100">
                  {searchResults.map(goal => (
                    <li key={goal.id}>
                      <button type="button" onClick={() => setSelectedGoal(goal)} className="w-full px-4 py-3 text-left hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none">
                        <p className="font-medium text-gray-900">{goal.title}</p>
                        <p className="text-xs text-gray-500">{goal.goalSheet.employee.name} · {goal.goalSheet.employee.department} · {goal.goalSheet.cycle.year} {goal.goalSheet.cycle.phase}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GoalUnlockModal;
