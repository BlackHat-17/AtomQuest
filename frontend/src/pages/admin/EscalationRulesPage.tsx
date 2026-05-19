import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerType = 'GOAL_NOT_SUBMITTED' | 'GOAL_NOT_APPROVED' | 'CHECKIN_NOT_COMPLETED';
type ChainLevel = 'EMPLOYEE' | 'MANAGER' | 'SKIP_LEVEL' | 'HR';

interface EscalationRule {
  id: string;
  name: string;
  triggerType: TriggerType;
  thresholdDays: number;
  intervalDays: number;
  chain: ChainLevel[];
  isActive: boolean;
  createdAt: string;
}

interface RuleFormData {
  name: string;
  triggerType: TriggerType;
  thresholdDays: number;
  intervalDays: number;
  chain: ChainLevel[];
  isActive: boolean;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  GOAL_NOT_SUBMITTED: 'Goal Not Submitted',
  GOAL_NOT_APPROVED: 'Goal Not Approved',
  CHECKIN_NOT_COMPLETED: 'Check-In Not Completed',
};

const TRIGGER_COLORS: Record<TriggerType, string> = {
  GOAL_NOT_SUBMITTED: 'bg-amber-100 text-amber-700 border-amber-300',
  GOAL_NOT_APPROVED: 'bg-red-100 text-red-700 border-red-300',
  CHECKIN_NOT_COMPLETED: 'bg-blue-100 text-blue-700 border-blue-300',
};

const CHAIN_OPTIONS: ChainLevel[] = ['EMPLOYEE', 'MANAGER', 'SKIP_LEVEL', 'HR'];

const DEFAULT_FORM: RuleFormData = {
  name: '',
  triggerType: 'GOAL_NOT_SUBMITTED',
  thresholdDays: 7,
  intervalDays: 1,
  chain: ['EMPLOYEE'],
  isActive: true,
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface RuleModalProps { initial: RuleFormData | null; onClose: () => void; onSave: (data: RuleFormData) => Promise<void>; }

function RuleModal({ initial, onClose, onSave }: RuleModalProps) {
  const [form, setForm] = useState<RuleFormData>(initial ?? DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChain = (level: ChainLevel) => {
    setForm((prev) => ({
      ...prev,
      chain: prev.chain.includes(level) ? prev.chain.filter((c) => c !== level) : [...prev.chain, level],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.chain.length === 0) { setError('Select at least one chain level.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save rule';
      setError(message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 motion-safe:animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl motion-safe:animate-scale-in">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{initial ? 'Edit Escalation Rule' : 'Create Escalation Rule'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="rule-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input id="rule-name" type="text" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="trigger-type" className="block text-sm font-medium text-gray-700">Trigger Type</label>
            <select id="trigger-type" value={form.triggerType} onChange={(e) => setForm((p) => ({ ...p, triggerType: e.target.value as TriggerType }))} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="GOAL_NOT_SUBMITTED">Goal Not Submitted</option>
              <option value="GOAL_NOT_APPROVED">Goal Not Approved</option>
              <option value="CHECKIN_NOT_COMPLETED">Check-In Not Completed</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="threshold-days" className="block text-sm font-medium text-gray-700">Threshold Days</label>
              <input id="threshold-days" type="number" min={1} required value={form.thresholdDays} onChange={(e) => setForm((p) => ({ ...p, thresholdDays: parseInt(e.target.value, 10) || 1 }))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label htmlFor="interval-days" className="block text-sm font-medium text-gray-700">Interval Days</label>
              <input id="interval-days" type="number" min={1} required value={form.intervalDays} onChange={(e) => setForm((p) => ({ ...p, intervalDays: parseInt(e.target.value, 10) || 1 }))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700">Escalation Chain</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {CHAIN_OPTIONS.map((level) => (
                <label key={level} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.chain.includes(level)} onChange={() => toggleChain(level)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  {level.replace('_', ' ')}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            Active
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EscalationRulesPage() {
  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<EscalationRule | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<EscalationRule[]>('/admin/escalation-rules');
      setRules(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load escalation rules';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleCreate = async (data: RuleFormData) => {
    await api.post('/admin/escalation-rules', data);
    showSuccess('Rule created successfully.');
    await fetchRules();
  };

  const handleEdit = async (data: RuleFormData) => {
    if (!editingRule) return;
    await api.put(`/admin/escalation-rules/${editingRule.id}`, data);
    showSuccess('Rule updated successfully.');
    await fetchRules();
  };

  const handleToggleActive = async (rule: EscalationRule) => {
    try {
      await api.put(`/admin/escalation-rules/${rule.id}`, { isActive: !rule.isActive });
      showSuccess(`Rule ${rule.isActive ? 'deactivated' : 'activated'}.`);
      await fetchRules();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update rule';
      setError(message);
    }
  };

  const openCreate = () => { setEditingRule(null); setModalOpen(true); };
  const openEdit = (rule: EscalationRule) => { setEditingRule(rule); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingRule(null); };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Escalation Rules</h1>
          <p className="mt-1 text-sm text-gray-500">Configure automated escalation rules for goal lifecycle events.</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
          + Create Rule
        </button>
      </div>

      {success && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No escalation rules configured yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Trigger Type', 'Threshold', 'Interval', 'Chain', 'Status', 'Actions'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{rule.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TRIGGER_COLORS[rule.triggerType]}`}>
                        {TRIGGER_LABELS[rule.triggerType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{rule.thresholdDays}d</td>
                    <td className="px-4 py-3 text-gray-700">{rule.intervalDays}d</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rule.chain.map((level) => (
                          <span key={level} className="inline-flex rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            {level.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${rule.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {rule.isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(rule)} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">Edit</button>
                        <button onClick={() => handleToggleActive(rule)} className={`rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${rule.isActive ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                          {rule.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <RuleModal
          initial={editingRule ? { name: editingRule.name, triggerType: editingRule.triggerType, thresholdDays: editingRule.thresholdDays, intervalDays: editingRule.intervalDays, chain: editingRule.chain, isActive: editingRule.isActive } : null}
          onClose={closeModal}
          onSave={editingRule ? handleEdit : handleCreate}
        />
      )}
    </div>
  );
}

export default EscalationRulesPage;
