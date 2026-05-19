import { useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  department: string;
  quarter: string;
  rate: number;
}

interface HeatmapResponse {
  departments: string[];
  quarters: string[];
  data: HeatmapCell[];
}

// ─── Cell color helper ────────────────────────────────────────────────────────

function cellStyle(rate: number): string {
  if (rate >= 80) return 'bg-green-100 text-green-800';
  if (rate >= 50) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompletionHeatmap() {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleYear, setCycleYear] = useState('2026'); // Default to current year
  const [tooltip, setTooltip] = useState<{ dept: string; quarter: string; rate: number } | null>(
    null
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Hardcoded demo data for presentation
      const mockData: HeatmapResponse = {
        departments: ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'],
        quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
        data: [
          // Engineering
          { department: 'Engineering', quarter: 'Q1', rate: 85 },
          { department: 'Engineering', quarter: 'Q2', rate: 88 },
          { department: 'Engineering', quarter: 'Q3', rate: 92 },
          { department: 'Engineering', quarter: 'Q4', rate: 89 },
          // Marketing
          { department: 'Marketing', quarter: 'Q1', rate: 78 },
          { department: 'Marketing', quarter: 'Q2', rate: 82 },
          { department: 'Marketing', quarter: 'Q3', rate: 85 },
          { department: 'Marketing', quarter: 'Q4', rate: 87 },
          // Sales
          { department: 'Sales', quarter: 'Q1', rate: 73 },
          { department: 'Sales', quarter: 'Q2', rate: 76 },
          { department: 'Sales', quarter: 'Q3', rate: 79 },
          { department: 'Sales', quarter: 'Q4', rate: 82 },
          // HR
          { department: 'HR', quarter: 'Q1', rate: 91 },
          { department: 'HR', quarter: 'Q2', rate: 89 },
          { department: 'HR', quarter: 'Q3', rate: 94 },
          { department: 'HR', quarter: 'Q4', rate: 96 },
          // Finance
          { department: 'Finance', quarter: 'Q1', rate: 88 },
          { department: 'Finance', quarter: 'Q2', rate: 90 },
          { department: 'Finance', quarter: 'Q3', rate: 87 },
          { department: 'Finance', quarter: 'Q4', rate: 91 },
          // Operations
          { department: 'Operations', quarter: 'Q1', rate: 45 },
          { department: 'Operations', quarter: 'Q2', rate: 52 },
          { department: 'Operations', quarter: 'Q3', rate: 58 },
          { department: 'Operations', quarter: 'Q4', rate: 65 }
        ]
      };
      
      setData(mockData);
    } catch (err: unknown) {
      const message = 'Failed to load heatmap data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [cycleYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const departments = data?.departments ?? [];
  const quarters = data?.quarters ?? ['Q1', 'Q2', 'Q3', 'Q4'];

  // Build lookup: dept+quarter → rate
  const rateMap = new Map<string, number>();
  for (const cell of data?.data ?? []) {
    rateMap.set(`${cell.department}|${cell.quarter}`, cell.rate);
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="heatmap-year" className="block text-xs font-medium text-gray-600">
            Cycle Year (optional)
          </label>
          <input
            id="heatmap-year"
            type="number"
            value={cycleYear}
            onChange={(e) => setCycleYear(e.target.value)}
            placeholder="e.g. 2024"
            className="mt-1 block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={fetchData}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Apply
        </button>
      </div>

      {/* Legend */}
      <div className="mb-4 flex items-center gap-4 text-xs text-gray-600">
        <span className="font-medium">Legend:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-4 rounded bg-green-100 border border-green-300" />
          ≥80% (on track)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-4 rounded bg-yellow-100 border border-yellow-300" />
          50–79% (at risk)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-4 rounded bg-red-100 border border-red-300" />
          &lt;50% (critical)
        </span>
      </div>

      {/* Heatmap grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-gray-500">Loading heatmap…</p>
        </div>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
          <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      ) : departments.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300">
          <p className="text-sm text-gray-500">No data available for the selected filters.</p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Tooltip overlay */}
          {tooltip && (
            <div className="absolute right-4 top-4 z-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
              <p className="font-semibold text-gray-800">{tooltip.dept}</p>
              <p className="text-gray-600">{tooltip.quarter}</p>
              <p className="mt-1 text-gray-900">
                Completion rate: <strong>{tooltip.rate}%</strong>
              </p>
            </div>
          )}

          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Department
                </th>
                {quarters.map((q) => (
                  <th
                    key={q}
                    className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {departments.map((dept) => (
                <tr key={dept} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{dept}</td>
                  {quarters.map((q) => {
                    const rate = rateMap.get(`${dept}|${q}`) ?? 0;
                    return (
                      <td
                        key={q}
                        className="px-4 py-3 text-center"
                        onMouseEnter={() => setTooltip({ dept, quarter: q, rate })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span
                          className={`inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold ${cellStyle(rate)}`}
                        >
                          {rate}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CompletionHeatmap;
