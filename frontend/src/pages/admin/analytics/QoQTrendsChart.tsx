import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeTrend {
  name: string;
  department: string;
  scores: {
    Q1: number | null;
    Q2: number | null;
    Q3: number | null;
    Q4: number | null;
  };
}

interface QoQTrendsResponse {
  employees: EmployeeTrend[];
}

// Chart data point: one entry per quarter
interface ChartDataPoint {
  quarter: string;
  [employeeName: string]: number | null | string;
}

// Distinct colors for up to 10 bars
const BAR_COLORS = [
  '#1f0c25', // primary theme color
  '#2d1238', // secondary theme color
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

// ─── Component ────────────────────────────────────────────────────────────────

export function QoQTrendsChart() {
  const [data, setData] = useState<QoQTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleYear, setCycleYear] = useState('2026'); // Default to current year
  const [department, setDepartment] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Hardcoded demo data for presentation
      const mockData: QoQTrendsResponse = {
        employees: [
          {
            name: 'Sarah Chen',
            department: 'Engineering',
            scores: { Q1: 85, Q2: 88, Q3: 92, Q4: 89 }
          },
          {
            name: 'Michael Rodriguez',
            department: 'Engineering',
            scores: { Q1: 78, Q2: 82, Q3: 85, Q4: 87 }
          },
          {
            name: 'Emily Johnson',
            department: 'Marketing',
            scores: { Q1: 91, Q2: 89, Q3: 94, Q4: 96 }
          },
          {
            name: 'David Kim',
            department: 'Sales',
            scores: { Q1: 73, Q2: 76, Q3: 79, Q4: 82 }
          },
          {
            name: 'Lisa Wang',
            department: 'Engineering',
            scores: { Q1: 88, Q2: 90, Q3: 87, Q4: 91 }
          },
          {
            name: 'James Thompson',
            department: 'Marketing',
            scores: { Q1: 82, Q2: 85, Q3: 88, Q4: 90 }
          }
        ].filter(emp => !department || emp.department.toLowerCase().includes(department.toLowerCase()))
      };
      
      setData(mockData);
    } catch (err: unknown) {
      const message = 'Failed to load QoQ trends';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [cycleYear, department]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Transform API data into Recharts-friendly format
  const chartData: ChartDataPoint[] = ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => {
    const point: ChartDataPoint = { quarter: q };
    for (const emp of data?.employees ?? []) {
      point[emp.name] = emp.scores[q as keyof typeof emp.scores];
    }
    return point;
  });

  const employees = data?.employees ?? [];

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="qoq-year" className="block text-xs font-medium text-gray-600">
            Cycle Year (optional)
          </label>
          <input
            id="qoq-year"
            type="number"
            value={cycleYear}
            onChange={(e) => setCycleYear(e.target.value)}
            placeholder="e.g. 2024"
            className="mt-1 block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25]"
          />
        </div>
        <div>
          <label htmlFor="qoq-dept" className="block text-xs font-medium text-gray-600">
            Department (optional)
          </label>
          <input
            id="qoq-dept"
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering"
            className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25]"
          />
        </div>
        <button
          onClick={fetchData}
          className="rounded-md bg-[#1f0c25] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#2d1238] focus:outline-none focus:ring-2 focus:ring-[#1f0c25] focus:ring-offset-2"
        >
          Apply
        </button>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-gray-500">Loading trends…</p>
        </div>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
          <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      ) : employees.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300">
          <p className="text-sm text-gray-500">No data available for the selected filters.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="quarter" tick={{ fontSize: 13 }} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 12 }}
                width={48}
              />
              <Tooltip
                formatter={(value: number | null | string) =>
                  typeof value === 'number' && value !== null ? [`${value}%`, ''] : ['N/A', '']
                }
              />
              <Legend />
              {employees.map((emp, idx) => (
                <Bar
                  key={emp.name}
                  dataKey={emp.name}
                  fill={BAR_COLORS[idx % BAR_COLORS.length]}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default QoQTrendsChart;
