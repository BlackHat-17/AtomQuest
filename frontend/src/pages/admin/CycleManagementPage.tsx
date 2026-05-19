import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';
import type { GoalCycle, Phase } from '../../types';

const PHASES: Phase[] = ['GOAL_SETTING', 'Q1', 'Q2', 'Q3', 'Q4'];
const PHASE_LABELS: Record<Phase, string> = { GOAL_SETTING: 'Goal Setting', Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4' };

interface CycleFormData { year: number; phase: Phase; windowOpen: string; windowClose: string; isActive: boolean; }
const DEFAULT_FORM: CycleFormData = { year: new Date().getFullYear(), phase: 'GOAL_SETTING', windowOpen: '', windowClose: '', isActive: false };

function toDateInput(iso: string) { return iso ? iso.slice(0, 10) : ''; }
function formatDate(iso: string) { return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; }

interface CycleModalProps { open: boolean; onClose: () => void; onSuccess: () => void; editingCycle: GoalCycle | null; }

function CycleModal({ open, onClose, onSuccess, editingCycle }: CycleModalProps) {
  const [form, setForm] = useState<CycleFormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingCycle) {
      setForm({ year: editingCycle.year, phase: editingCycle.phase, windowOpen: toDateInput(editingCycle.windowOpen), windowClose: toDateInput(editingCycle.windowClose), isActive: editingCycle.isActive });
    } else { setForm(DEFAULT_FORM); }
    setError(null);
  }, [editingCycle, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingCycle) { await api.put(`/admin/cycles/${editingCycle.id}`, form); }
      else { await api.post('/admin/cycles', form); }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save cycle');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{editingCycle ? 'Edit Cycle' : 'Create Cycle'}</h2>
        {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Year</label>
            <input type="number" min={2000} max={2100} value={form.year} onChange={(e) => setForm(f => ({ ...f, year: parseInt(e.target.value, 10) || f.year }))} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phase</label>
            <select value={form.phase} onChange={(e) => setForm(f => ({ ...f, phase: e.target.value as Phase }))} required className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Window Open</label>
            <input type="date" value={form.windowOpen} onChange={(e) => setForm(f => ({ ...f, windowOpen: e.target.value }))} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Window Close</label>
            <input type="date" value={form.windowClose} onChange={(e) => setForm(f => ({ ...f, windowClose: e.target.value }))} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="flex items-center gap-2">
            <input id="cycle-active" type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
            <label htmlFor="cycle-active" className="text-sm font-medium text-gray-700">Active</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Saving…' : editingCycle ? 'Save Changes' : 'Create Cycle'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CycleManagementPage() {
  const [cycles, setCycles] = useState<GoalCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<GoalCycle | null>(null);
  const [switching, setSwitching] = useState(false);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<GoalCycle[]>('/admin/cycles');
      setCycles(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load cycles');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  const handleToggleActive = async (cycle: GoalCycle) => {
    setError(null); setSuccess(null);
    try {
      await api.put(`/admin/cycles/${cycle.id}`, { isActive: !cycle.isActive });
      setSuccess(`Cycle ${cycle.isActive ? 'deactivated' : 'activated'} successfully.`);
      await fetchCycles();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update cycle');
    }
  };

  // Quick switch to a specific phase
  const handleQuickSwitch = async (targetPhase: Phase) => {
    setError(null);
    setSuccess(null);
    setSwitching(true);
    
    try {
      // Find the cycle for the target phase in the current year
      const currentYear = new Date().getFullYear();
      const targetCycle = cycles.find(c => c.phase === targetPhase && c.year === currentYear);
      
      if (!targetCycle) {
        setError(`No ${PHASE_LABELS[targetPhase]} cycle found for ${currentYear}. Please create it first.`);
        setSwitching(false);
        return;
      }

      // Activate the target cycle (backend will deactivate others with same phase)
      await api.put(`/admin/cycles/${targetCycle.id}`, { isActive: true });
      setSuccess(`Switched to ${PHASE_LABELS[targetPhase]} successfully!`);
      await fetchCycles();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to switch cycle');
    } finally {
      setSwitching(false);
    }
  };

  // Get current active cycle
  const activeCycle = cycles.find(c => c.isActive);
  const currentYear = new Date().getFullYear();
  const currentYearCycles = cycles.filter(c => c.year === currentYear);

  // Phase progression order
  const phaseOrder: Phase[] = ['GOAL_SETTING', 'Q1', 'Q2', 'Q3', 'Q4'];
  const getNextPhase = (current: Phase): Phase | null => {
    const idx = phaseOrder.indexOf(current);
    return idx >= 0 && idx < phaseOrder.length - 1 ? phaseOrder[idx + 1] : null;
  };

  const nextPhase = activeCycle ? getNextPhase(activeCycle.phase) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cycle Management</h1>
          <p className="mt-1 text-sm text-gray-500">Configure goal cycles, phases, and active windows.</p>
        </div>
        <button onClick={() => { setEditingCycle(null); setModalOpen(true); }} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">+ Create Cycle</button>
      </div>

      {/* Quick Cycle Switcher */}
      <div className="mb-6 rounded-xl border border-[#1f0c25]/20 bg-gradient-to-r from-[#1f0c25]/5 to-[#2d1238]/5 p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Active Cycle</h2>
            {activeCycle ? (
              <p className="mt-1 text-2xl font-bold text-indigo-700">
                {activeCycle.year} — {PHASE_LABELS[activeCycle.phase]}
              </p>
            ) : (
              <p className="mt-1 text-lg text-gray-500">No active cycle</p>
            )}
          </div>
          {nextPhase && (
            <button
              onClick={() => handleQuickSwitch(nextPhase)}
              disabled={switching}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {switching ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Switching...
                </>
              ) : (
                <>
                  Switch to {PHASE_LABELS[nextPhase]}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          )}
        </div>

        {/* Quick Phase Buttons */}
        <div className="flex flex-wrap gap-2">
          {phaseOrder.map((phase) => {
            const cycle = currentYearCycles.find(c => c.phase === phase);
            const isActive = cycle?.isActive ?? false;
            const exists = !!cycle;

            return (
              <button
                key={phase}
                onClick={() => exists && handleQuickSwitch(phase)}
                disabled={!exists || isActive || switching}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-green-300 bg-green-100 text-green-800 cursor-default'
                    : exists
                    ? 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300'
                    : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                }`}
              >
                {PHASE_LABELS[phase]}
                {isActive && ' ✓'}
                {!exists && ' (Not Created)'}
              </button>
            );
          })}
        </div>

        {currentYearCycles.length < 5 && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            ⚠️ Some cycles for {currentYear} are missing. Create them to enable quick switching.
          </p>
        )}
      </div>

      {success && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>}
      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-sm text-gray-500">Loading…</div> : cycles.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">No cycles found.</div> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>{['Year', 'Phase', 'Window Open', 'Window Close', 'Active', 'Actions'].map(col => <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{col}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {cycles.map(cycle => (
                  <tr key={cycle.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{cycle.year}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{PHASE_LABELS[cycle.phase]}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(cycle.windowOpen)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(cycle.windowClose)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {cycle.isActive ? <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Active</span> : <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Inactive</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditingCycle(cycle); setModalOpen(true); }} className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                        <button onClick={() => handleToggleActive(cycle)} className={`rounded border px-2.5 py-1 text-xs font-medium ${cycle.isActive ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'}`}>{cycle.isActive ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CycleModal open={modalOpen} onClose={() => setModalOpen(false)} onSuccess={async () => { setSuccess(editingCycle ? 'Cycle updated.' : 'Cycle created.'); await fetchCycles(); }} editingCycle={editingCycle} />
    </div>
  );
}

export default CycleManagementPage;
