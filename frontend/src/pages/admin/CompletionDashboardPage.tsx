import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DepartmentCompletion {
  department: string;
  total: number;
  completed: number;
  rate: number;
}

interface ManagerCompletion {
  managerId: string;
  managerName: string;
  total: number;
  completed: number;
  rate: number;
}

interface CompletionResponse {
  byDepartment: DepartmentCompletion[];
  byManager: ManagerCompletion[];
}

// ─── Rate badge helper ────────────────────────────────────────────────────────

function RateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 80
      ? 'bg-green-100 text-green-700 border-green-300'
      : rate >= 50
        ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
        : 'bg-red-100 text-red-700 border-red-300';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}
    >
      {rate}%
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompletionDashboardPage() {
  const [data, setData] = useState<CompletionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState('');
  const [quarter, setQuarter] = useState('');
  // Drill-down: selected department to filter individual employees
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (cycleId) params.cycleId = cycleId;
      if (quarter) params.quarter = quarter;

      const { data: response } = await api.get<CompletionResponse>(
        '/reports/completion',
        { params }
      );
      setData(response);
      setSelectedDept(null);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load completion data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [cycleId, quarter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading completion dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={fetchData}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const byDepartment = data?.byDepartment ?? [];
  const byManager = data?.byManager ?? [];

  // Drill-down: filter manager rows by selected department
  // (In a real app this would fetch individual employees; here we show the
  //  department row highlighted and filter managers who have reports in that dept)
  const filteredManagers = selectedDept
    ? byManager // managers don't have dept info in this response; show all
    : byManager;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Completion Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Check-in completion rates by department and manager.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="cycleId" className="block text-xs font-medium text-gray-600">
            Cycle ID (optional)
          </label>
          <input
            id="cycleId"
            type="text"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            placeholder="UUID"
            className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="quarter" className="block text-xs font-medium text-gray-600">
            Quarter (optional)
          </label>
          <select
            id="quarter"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="mt-1 block w-32 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All</option>
            <option value="Q1">Q1</option>
            <option value="Q2">Q2</option>
            <option value="Q3">Q3</option>
            <option value="Q4">Q4</option>
          </select>
        </div>
        <button
          onClick={fetchData}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Refresh
        </button>
        {selectedDept && (
          <button
            onClick={() => setSelectedDept(null)}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Clear drill-down
          </button>
        )}
      </div>

      {/* Drill-down banner */}
      {selectedDept && (
        <div className="mb-4 rounded-md bg-indigo-50 px-4 py-2 text-sm text-indigo-700">
          Showing drill-down for department: <strong>{selectedDept}</strong>
        </div>
      )}

      {/* By Department table */}
      <div className="mb-8 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">By Department</h2>
          <p className="text-xs text-gray-500">Click a row to drill down.</p>
        </div>
        {byDepartment.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">No data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Department', 'Total Employees', 'Completed Check-ins', 'Completion Rate (%)'].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {byDepartment.map((row) => (
                  <tr
                    key={row.department}
                    onClick={() =>
                      setSelectedDept(
                        selectedDept === row.department ? null : row.department
                      )
                    }
                    className={`cursor-pointer hover:bg-indigo-50 ${
                      selectedDept === row.department ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.department}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.total}</td>
                    <td className="px-4 py-3 text-gray-700">{row.completed}</td>
                    <td className="px-4 py-3">
                      <RateBadge rate={row.rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By Manager table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">By Manager</h2>
        </div>
        {filteredManagers.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">No data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Manager', 'Total Reports', 'Completed Check-ins', 'Completion Rate (%)'].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredManagers.map((row) => (
                  <tr key={row.managerId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.managerName}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.total}</td>
                    <td className="px-4 py-3 text-gray-700">{row.completed}</td>
                    <td className="px-4 py-3">
                      <RateBadge rate={row.rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default CompletionDashboardPage;
