// ─── Segment colours ──────────────────────────────────────────────────────────
// A palette of distinct colours for up to 8 goal segments.
const SEGMENT_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-rose-500',
];

const LEGEND_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-lime-500',
  'bg-rose-500',
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface WeightageBarProps {
  goals: Array<{ title: string; weightage: number }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Displays a horizontal stacked bar showing each goal's weightage as a
 * coloured segment. The total is shown below the bar, colour-coded:
 * - Green  → total === 100%
 * - Red    → total > 100%
 * - Yellow → total < 100%
 */
export function WeightageBar({ goals }: WeightageBarProps) {
  const total = goals.reduce((sum, g) => sum + Number(g.weightage), 0);

  const totalColorClass =
    Math.abs(total - 100) <= 0.01
      ? 'text-green-600'
      : total > 100
        ? 'text-red-600'
        : 'text-yellow-600';

  const totalBgClass =
    Math.abs(total - 100) <= 0.01
      ? 'bg-green-100 border-green-300'
      : total > 100
        ? 'bg-red-100 border-red-300'
        : 'bg-yellow-100 border-yellow-300';

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div
        className="flex h-6 w-full overflow-hidden rounded-full bg-gray-200"
        role="img"
        aria-label={`Weightage distribution — total ${total.toFixed(2)}%`}
      >
        {goals.length === 0 ? (
          <div className="h-full w-full bg-gray-200" />
        ) : (
          goals.map((goal, i) => {
            const pct = Math.min(Number(goal.weightage), 100);
            return (
              <div
                key={i}
                className={`${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} h-full transition-all duration-300`}
                style={{ width: `${pct}%` }}
                title={`${goal.title}: ${pct}%`}
              />
            );
          })
        )}
      </div>

      {/* Total badge */}
      <div className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm font-semibold ${totalBgClass} ${totalColorClass}`}>
        <span>Total:</span>
        <span>{total.toFixed(2)}%</span>
        {Math.abs(total - 100) <= 0.01 && (
          <span aria-label="Valid" title="Weightage sums to 100%">✓</span>
        )}
        {total > 100 && (
          <span aria-label="Over 100%" title="Total exceeds 100%">↑</span>
        )}
        {total < 100 - 0.01 && (
          <span aria-label="Under 100%" title="Total is below 100%">↓</span>
        )}
      </div>

      {/* Legend */}
      {goals.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {goals.map((goal, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className={`inline-block h-3 w-3 flex-shrink-0 rounded-sm ${LEGEND_COLORS[i % LEGEND_COLORS.length]}`}
              />
              <span className="max-w-[160px] truncate" title={goal.title}>
                {goal.title}
              </span>
              <span className="font-medium text-gray-800">{Number(goal.weightage).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WeightageBar;
