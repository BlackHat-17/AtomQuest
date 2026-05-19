import { useEffect, useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
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

interface ThrustAreaItem {
  name: string;
  count: number;
  weightage: number;
}

interface UomTypeItem {
  name: string;
  count: number;
}

interface StatusItem {
  name: string;
  count: number;
}

interface GoalDistributionResponse {
  byThrustArea: ThrustAreaItem[];
  byUomType: UomTypeItem[];
  byStatus: StatusItem[];
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const PIE_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: '#94a3b8',
  ON_TRACK: '#10b981',
  COMPLETED: '#6366f1',
};

// ─── Custom label for pie chart ───────────────────────────────────────────────

function renderCustomLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (!cx || !cy || midAngle === undefined || !innerRadius || !outerRadius || !percent) return null;

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalDistribution() {
  const [data, setData] = useState<GoalDistributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState('');
  const [department, setDepartment] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Hardcoded demo data for presentation
      const mockData: GoalDistributionResponse = {
        byThrustArea: [
          { name: 'Revenue Growth', count: 45, weightage: 35 },
          { name: 'Customer Satisfaction', count: 32, weightage: 25 },
          { name: 'Operational Excellence', count: 28, weightage: 20 },
          { name: 'Innovation', count: 18, weightage: 15 },
          { name: 'Team Development', count: 12, weightage: 5 }
        ].filter(() => !department || Math.random() > 0.3), // Simulate department filtering
        byUomType: [
          { name: 'Percentage', count: 58 },
          { name: 'Number', count: 42 },
          { name: 'Currency', count: 35 },
          { name: 'Binary', count: 28 },
          { name: 'Rating', count: 22 }
        ],
        byStatus: [
          { name: 'ON_TRACK', count: 89 },
          { name: 'NOT_STARTED', count: 34 },
          { name: 'COMPLETED', count: 62 }
        ]
      };
      
      setData(mockData);
    } catch (err: unknown) {
      const message = 'Failed to load goal distribution';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [cycleId, department]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const byThrustArea = data?.byThrustArea ?? [];
  const byUomType = data?.byUomType ?? [];
  const byStatus = data?.byStatus ?? [];

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="dist-cycle" className="block text-xs font-medium text-gray-600">
            Cycle ID (optional)
          </label>
          <input
            id="dist-cycle"
            type="text"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            placeholder="UUID"
            className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="dist-dept" className="block text-xs font-medium text-gray-600">
            Department (optional)
          </label>
          <input
            id="dist-dept"
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
          <p className="text-gray-500">Loading distribution…</p>
        </div>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
          <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {/* 1. Goals by Thrust Area — Pie chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Goals by Thrust Area</h3>
            {byThrustArea.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={byThrustArea}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    labelLine={false}
                    label={renderCustomLabel}
                  >
                    {byThrustArea.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any, props: any) => [
                      `${value} goals (${props.payload?.weightage ?? 0}% total weightage)`,
                      name,
                    ]}
                  />
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-xs text-gray-700">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 2. Goals by UoM Type — Bar chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Goals by UoM Type</h3>
            {byUomType.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={byUomType}
                  margin={{ top: 5, right: 20, left: 0, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Goals" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 3. Goals by Status — Pie chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Goals by Status</h3>
            {byStatus.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={byStatus}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    labelLine={false}
                    label={renderCustomLabel}
                  >
                    {byStatus.map((item, idx) => (
                      <Cell
                        key={idx}
                        fill={STATUS_COLORS[item.name] ?? PIE_COLORS[idx % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-xs text-gray-700">
                        {value.replace(/_/g, ' ')}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GoalDistribution;
