import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLogUser {
  id: string;
  name: string;
  email: string;
}

interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  user: AuditLogUser;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  timestamp: string;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// ─── JSON preview helper ──────────────────────────────────────────────────────

function JsonCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400">—</span>;
  }
  const str = JSON.stringify(value, null, 2);
  // Truncate long values
  const truncated = str.length > 120 ? str.slice(0, 120) + '…' : str;
  return (
    <pre
      className="max-w-xs overflow-hidden text-ellipsis whitespace-pre-wrap break-all rounded bg-gray-50 p-1 text-xs text-gray-700"
      title={str}
    >
      {truncated}
    </pre>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AuditLogPage() {
  const [data, setData] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [entityType, setEntityType] = useState('');

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (userSearch.trim()) params.userId = userSearch.trim();
      if (entityType.trim()) params.entityType = entityType.trim();

      const { data: response } = await api.get<AuditLogResponse>('/reports/audit', {
        params,
      });
      setData(response.data);
      setTotal(response.total);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load audit log';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, startDate, endDate, userSearch, entityType]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  const totalPages = Math.ceil(total / limit);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1); // Reset to first page on new filter
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Read-only log of all post-lock changes to goals and achievements.
        </p>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleFilterSubmit}
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Filters</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Start date */}
          <div>
            <label htmlFor="startDate" className="block text-xs font-medium text-gray-600">
              Start Date
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* End date */}
          <div>
            <label htmlFor="endDate" className="block text-xs font-medium text-gray-600">
              End Date
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* User ID search */}
          <div>
            <label htmlFor="userSearch" className="block text-xs font-medium text-gray-600">
              User ID
            </label>
            <input
              id="userSearch"
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="User UUID"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Entity type selector */}
          <div>
            <label htmlFor="entityType" className="block text-xs font-medium text-gray-600">
              Entity Type
            </label>
            <select
              id="entityType"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All types</option>
              <option value="goal">Goal</option>
              <option value="achievement">Achievement</option>
              <option value="goalSheet">GoalSheet</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Apply Filters
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No audit log entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    'Entity Type',
                    'Entity ID',
                    'Changed By',
                    'Action',
                    'Old Value',
                    'New Value',
                    'Timestamp',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="inline-flex rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {entry.entityType}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-600">
                      {entry.entityId.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-900">{entry.user.name}</p>
                      <p className="text-xs text-gray-500">{entry.user.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          entry.action === 'DELETE'
                            ? 'border-red-300 bg-red-100 text-red-700'
                            : entry.action === 'PUT' || entry.action === 'PATCH'
                              ? 'border-yellow-300 bg-yellow-100 text-yellow-700'
                              : 'border-blue-300 bg-blue-100 text-blue-700'
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <JsonCell value={entry.oldValue} />
                    </td>
                    <td className="px-3 py-3">
                      <JsonCell value={entry.newValue} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-600">
                      {new Date(entry.timestamp).toLocaleString()}
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
          <p>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLogPage;
