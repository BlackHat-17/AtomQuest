import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';
import type { GoalCycle, Quarter } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AchievementGoal {
  id: string;
  title: string;
  thrustArea: string;
  uomType: string;
  target: string;
  weightage: number;
  achievements: {
    Q1: string | null;
    Q2: string | null;
    Q3: string | null;
    Q4: string | null;
  };
}

interface AchievementRow {
  employee: string;
  department: string;
  employeeId: string;
  goals: AchievementGoal[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const [cycles, setCycles] = useState<GoalCycle[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [department, setDepartment] = useState('');
  const [managerId, setManagerId] = useState('');
  const [previewData, setPreviewData] = useState<AchievementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'excel' | 'csv' | null>(null);

  // Fetch available cycles for the selector
  useEffect(() => {
    api
      .get<GoalCycle[]>('/admin/cycles')
      .then(({ data }) => setCycles(data))
      .catch(() => {
        // Cycles endpoint may not be implemented yet — silently ignore
      });
  }, []);

  // Build query params from current filters
  const buildParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (cycleId) params.cycleId = cycleId;
    if (department.trim()) params.department = department.trim();
    if (managerId.trim()) params.managerId = managerId.trim();
    return params;
  }, [cycleId, department, managerId]);

  // Fetch preview data (first 20 rows flattened)
  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AchievementRow[]>('/reports/achievement', {
        params: buildParams(),
      });
      setPreviewData(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load report data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Trigger file download for excel or csv
  const handleExport = useCallback(
    async (format: 'excel' | 'csv') => {
      setExporting(format);
      try {
        const params = { ...buildParams(), format };
        const response = await api.get('/reports/achievement', {
          params,
          responseType: 'blob',
        });

        const mimeType =
          format === 'excel'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv';
        const extension = format === 'excel' ? 'xlsx' : 'csv';

        const blob = new Blob([response.data as BlobPart], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `achievement-report-${Date.now()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        setError(`Failed to export ${format.toUpperCase()} report`);
      } finally {
        setExporting(null);
      }
    },
    [buildParams]
  );

  // Flatten goals for preview table (max 20 rows)
  const previewRows = previewData
    .flatMap((sheet) =>
      sheet.goals.map((goal) => ({
        employee: sheet.employee,
        department: sheet.department,
        ...goal,
      }))
    )
    .slice(0, 20);

  const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Achievement Report</h1>
        <p className="mt-1 text-sm text-gray-500">
          Export or preview goal achievement data across all employees.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Filters</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Cycle selector */}
          <div>
            <label
              htmlFor="cycleId"
              className="block text-xs font-medium text-gray-600"
            >
              Cycle
            </label>
            <select
              id="cycleId"
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All cycles</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.year} — {c.phase.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Department input */}
          <div>
            <label
              htmlFor="department"
              className="block text-xs font-medium text-gray-600"
            >
              Department
            </label>
            <input
              id="department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Engineering"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Manager ID input */}
          <div>
            <label
              htmlFor="managerId"
              className="block text-xs font-medium text-gray-600"
            >
              Manager ID
            </label>
            <input
              id="managerId"
              type="text"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              placeholder="Manager UUID"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={fetchPreview}
            disabled={loading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Preview'}
          </button>

          <button
            onClick={() => handleExport('excel')}
            disabled={exporting !== null}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
          </button>

          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <p className="text-sm font-medium text-gray-700">
              Preview — first {previewRows.length} rows
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    'Employee',
                    'Department',
                    'Goal Title',
                    'Thrust Area',
                    'UoM',
                    'Target',
                    'Weightage',
                    ...quarters,
                  ].map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {previewRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                      {row.employee}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {row.department}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.title}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {row.thrustArea}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {row.uomType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {row.target}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {row.weightage}%
                    </td>
                    {quarters.map((q) => (
                      <td
                        key={q}
                        className="whitespace-nowrap px-3 py-2 text-gray-700"
                      >
                        {row.achievements[q] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && previewRows.length === 0 && previewData.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500 shadow-sm">
          Click "Preview" to load achievement data.
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
