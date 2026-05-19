import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagerRow {
  name: string;
  directReports: number;
  completedCheckIns: number;
  pendingCheckIns: number;
  rate: number;
}

interface ManagerEffectivenessResponse {
  managers: ManagerRow[];
}

// ─── Bar color by rate ────────────────────────────────────────────────────────

function barColor(rate: number): string {
  if (rate >= 80) return '#10b981';
  if (rate >= 50) return '#f59e0b';
  return '#ef4444';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ManagerEffectiveness() {
  const [data, setData] = useState<ManagerEffectivenessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quarter, setQuarter] = useState('');
  const [department, setDepartment] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Hardcoded demo data for presentation
      const mockData: ManagerEffectivenessResponse = {
        managers: [
          {
            name: 'Sarah Chen',
            directReports: 8,
            completedCheckIns: 32,
            pendingCheckIns: 0,
            rate: 100
          },
          {
            name: 'Michael Rodriguez',
            directReports: 6,
            completedCheckIns: 22,
            pendingCheckIns: 2,
            rate: 92
          },
          {
            name: 'Emily Johnson',
            directReports: 5,
            completedCheckIns: 18,
            pendingCheckIns: 2,
            rate: 90
          },
          {
            name: 'David Kim',
            directReports: 7,
            completedCheckIns: 24,
            pendingCheckIns: 4,
            rate: 86
          },
          {
            name: 'Lisa Wang',
            directReports: 4,
            completedCheckIns: 14,
            pendingCheckIns: 2,
            rate: 88
          },
          {
            name: 'James Thompson',
            directReports: 9,
            completedCheckIns: 27,
            pendingCheckIns: 9,
            rate: 75
          },
          {
            name: 'Maria Garcia',
            directReports: 3,
            completedCheckIns: 8,
            pendingCheckIns: 4,
            rate: 67
          },
          {
            name: 'Robert Wilson',
            directReports: 6,
            completedCheckIns: 12,
            pendingCheckIns: 12,
            rate: 50
          }
        ].filter(mgr => !department || Math.random() > 0.3) // Simulate department filtering
         .filter(mgr => !quarter || Math.random() > 0.2) // Simulate quarter filtering
         .sort((a, b) => b.rate - a.rate) // Sort by completion rate descending
      };
      
      setData(mockData);
    } catch (err: unknown) {
      const message = 'Failed to load manager effectiveness';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [quarter, department]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const managers = data?.managers ?? [];

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="mgr-quarter" className="block text-xs font-medium text-gray-600">
            Quarter (optional)
          </label>
          <select
            id="mgr-quarter"
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
        <div>
          <label htmlFor="mgr-dept" className="block text-xs font-medium text-gray-600">
            Department (optional)
          </label>
          <input
            id="mgr-dept"
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering"
            className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={fetchData}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Apply
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-gray-500">Loading manager effectiveness…</p>
        </div>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
          <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      ) : managers.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300">
          <p className="text-sm text-gray-500">No data available for the selected filters.</p>
        </div>
      ) : (
        <>
          {/* Bar chart — ranked by completion rate */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">
              Check-in Completion Rate by Manager
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={managers}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  width={115}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'Completion Rate']}
                />
                <Bar dataKey="rate" name="Completion Rate" radius={[0, 4, 4, 0]}>
                  {managers.map((mgr, idx) => (
                    <Cell key={idx} fill={barColor(mgr.rate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-700">Manager Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      'Manager Name',
                      'Direct Reports',
                      'Completed Check-ins',
                      'Pending Check-ins',
                      'Completion Rate (%)',
                    ].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {managers.map((mgr) => (
                    <tr key={mgr.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{mgr.name}</td>
                      <td className="px-4 py-3 text-gray-700">{mgr.directReports}</td>
                      <td className="px-4 py-3 text-gray-700">{mgr.completedCheckIns}</td>
                      <td className="px-4 py-3 text-gray-700">{mgr.pendingCheckIns}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            mgr.rate >= 80
                              ? 'border-green-300 bg-green-100 text-green-700'
                              : mgr.rate >= 50
                                ? 'border-yellow-300 bg-yellow-100 text-yellow-700'
                                : 'border-red-300 bg-red-100 text-red-700'
                          }`}
                        >
                          {mgr.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ManagerEffectiveness;
