import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type EscalationStatus = 'PENDING' | 'RESOLVED' | 'IGNORED';
type TriggerType = 'GOAL_NOT_SUBMITTED' | 'GOAL_NOT_APPROVED' | 'CHECKIN_NOT_COMPLETED';

interface EscalationLogEntry {
  id: string;
  rule: { id: string; name: string; triggerType: TriggerType };
  targetUser: { id: string; name: string; email: string };
  notifiedUser: { id: string; name: string; email: string };
  level: number;
  triggeredAt: string;
  resolvedAt: string | null;
  status: EscalationStatus;
}

interface EscalationLogResponse {
  data: EscalationLogEntry[];
  total: number;
  page: number;
  limit: number;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  GOAL_NOT_SUBMITTED: 'Goal Not Submitted',
  GOAL_NOT_APPROVED: 'Goal Not Approved',
  CHECKIN_NOT_COMPLETED: 'Check-In Not Completed',
};

const STATUS_STYLES: Record<EscalationStatus, string> = {
  PENDING: 'border-amber-300 bg-amber-50 text-amber-700',
  RESOLVED: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  IGNORED: 'border-gray-300 bg-gray-100 text-gray-500',
};

const STATUS_DOTS: Record<EscalationStatus, string> = {
  PENDING: 'bg-amber-500',
  RESOLVED: 'bg-emerald-500',
  IGNORED: 'bg-gray-400',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EscalationLogPage() {
  const [data, setData] = useState<EscalationLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (ruleTypeFilter) params.ruleType = ruleTypeFilter;
      const { data: response } = await api.get<EscalationLogResponse>('/admin/escalation-logs', { params });
      setData(response.data);
      setTotal(response.total);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load escalation logs';
      setError(message);
    } finally { setLoading(false); }
  }, [page, limit, statusFilter, ruleTypeFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleResolve = async (id: string) => {
    try {
      await api.put(`/admin/escalation-logs/${id}/resolve`);
      showSuccess('Log entry resolved.');
      await fetchLogs();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to resolve log entry';
      setError(message);
    }
  };

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Escalation Logs</h1>
        <p className="mt-1 text-sm text-gray-500">View and manage escalation notifications sent by the system.</p>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilterSubmit} className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Filters</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="status-filter" className="block text-xs font-medium text-gray-600">Status</label>
            <select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="RESOLVED">Resolved</option>
              <option value="IGNORED">Ignored</option>
            </select>
          </div>
          <div>
            <label htmlFor="rule-type-filter" className="block text-xs font-medium text-gray-600">Rule Type</label>
            <select id="rule-type-filter" value={ruleTypeFilter} onChange={(e) => setRuleTypeFilter(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">All types</option>
              <option value="GOAL_NOT_SUBMITTED">Goal Not Submitted</option>
              <option value="GOAL_NOT_APPROVED">Goal Not Approved</option>
              <option value="CHECKIN_NOT_COMPLETED">Check-In Not Completed</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            Apply Filters
          </button>
        </div>
      </form>

      {success && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No escalation log entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Rule Name', 'Target Employee', 'Notified User', 'Level', 'Triggered At', 'Status', 'Actions'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{entry.rule.name}</p>
                      <p className="text-xs text-gray-500">{TRIGGER_LABELS[entry.rule.triggerType]}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{entry.targetUser.name}</p>
                      <p className="text-xs text-gray-500">{entry.targetUser.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{entry.notifiedUser.name}</p>
                      <p className="text-xs text-gray-500">{entry.notifiedUser.email}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {entry.level + 1}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                      {new Date(entry.triggeredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[entry.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[entry.status]}`} />
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.status === 'PENDING' && (
                        <button onClick={() => handleResolve(entry.id)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <p>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} entries</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
              ← Prev
            </button>
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EscalationLogPage;
