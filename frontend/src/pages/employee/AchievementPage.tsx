import { useEffect, useState, useCallback } from 'react';
import { useAchievements } from '../../hooks/useAchievements';
import type { GoalStatus, Quarter } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

const UOM_LABELS: Record<string, string> = {
  NUMERIC_MIN: 'Numeric (Min)',
  NUMERIC_MAX: 'Numeric (Max)',
  TIMELINE: 'Timeline',
  ZERO: 'Zero',
};

const GOAL_STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'ON_TRACK', label: 'On Track' },
  { value: 'COMPLETED', label: 'Completed' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

function getSheetIdFromStorage(): string | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const user = JSON.parse(raw) as { sheetId?: string };
    return user.sheetId ?? null;
  } catch {
    return null;
  }
}

// ─── Row state type ───────────────────────────────────────────────────────────

interface RowState {
  /** Keyed by quarter */
  actuals: Partial<Record<Quarter, string>>;
  status: GoalStatus;
  saving: Partial<Record<Quarter, boolean>>;
  errors: Partial<Record<Quarter, string>>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AchievementPage() {
  const { goals, loading, error, fetchAchievements, updateAchievement } = useAchievements();

  // Per-goal row state for controlled inputs
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  // Derive sheetId from localStorage (set during login / goal sheet fetch)
  const sheetId = getSheetIdFromStorage();

  // ─── Load achievements on mount ──────────────────────────────────────────────

  useEffect(() => {
    if (sheetId) {
      fetchAchievements(sheetId);
    }
  }, [sheetId, fetchAchievements]);

  // ─── Initialise row states when goals load ───────────────────────────────────

  useEffect(() => {
    if (goals.length === 0) return;

    setRowStates((prev) => {
      const next: Record<string, RowState> = { ...prev };
      for (const goal of goals) {
        if (next[goal.id]) continue; // don't overwrite user edits

        const actuals: Partial<Record<Quarter, string>> = {};
        for (const ach of goal.achievements) {
          actuals[ach.quarter] = ach.actual;
        }

        next[goal.id] = {
          actuals,
          status: goal.status,
          saving: {},
          errors: {},
        };
      }
      return next;
    });
  }, [goals]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleActualChange = useCallback(
    (goalId: string, quarter: Quarter, value: string) => {
      setRowStates((prev) => ({
        ...prev,
        [goalId]: {
          ...prev[goalId],
          actuals: { ...prev[goalId]?.actuals, [quarter]: value },
          errors: { ...prev[goalId]?.errors, [quarter]: undefined },
        },
      }));
    },
    []
  );

  const handleStatusChange = useCallback((goalId: string, value: GoalStatus) => {
    setRowStates((prev) => ({
      ...prev,
      [goalId]: { ...prev[goalId], status: value },
    }));
  }, []);

  const handleSave = useCallback(
    async (goalId: string, quarter: Quarter) => {
      const row = rowStates[goalId];
      if (!row) return;

      const actual = row.actuals[quarter] ?? '';
      if (!actual.trim()) {
        setRowStates((prev) => ({
          ...prev,
          [goalId]: {
            ...prev[goalId],
            errors: { ...prev[goalId]?.errors, [quarter]: 'Actual value is required' },
          },
        }));
        return;
      }

      // Mark saving
      setRowStates((prev) => ({
        ...prev,
        [goalId]: {
          ...prev[goalId],
          saving: { ...prev[goalId]?.saving, [quarter]: true },
          errors: { ...prev[goalId]?.errors, [quarter]: undefined },
        },
      }));

      try {
        await updateAchievement(goalId, quarter, actual, row.status);
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to save achievement';
        setRowStates((prev) => ({
          ...prev,
          [goalId]: {
            ...prev[goalId],
            errors: { ...prev[goalId]?.errors, [quarter]: message },
          },
        }));
      } finally {
        setRowStates((prev) => ({
          ...prev,
          [goalId]: {
            ...prev[goalId],
            saving: { ...prev[goalId]?.saving, [quarter]: false },
          },
        }));
      }
    },
    [rowStates, updateAchievement]
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!sheetId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md bg-yellow-50 p-4 text-yellow-700">
          <p className="font-medium">No goal sheet found</p>
          <p className="text-sm">Please visit your Goal Sheet page first to initialise your sheet.</p>
        </div>
      </div>
    );
  }

  if (loading && goals.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading achievements…</p>
      </div>
    );
  }

  if (error && goals.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading achievements</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => fetchAchievements(sheetId)}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quarterly Achievements</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your actual values for each goal per quarter. Scores are computed automatically.
        </p>
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {goals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-gray-500 shadow-sm">
          <p className="text-sm">No goals found. Please set up your goal sheet first.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Goal Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Thrust Area
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    UoM Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Target
                  </th>
                  {QUARTERS.map((q) => (
                    <th
                      key={q}
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                      colSpan={2}
                    >
                      {q}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                </tr>
                {/* Sub-header for Actual / Score columns */}
                <tr className="bg-gray-50 border-t border-gray-100">
                  <th colSpan={4} />
                  {QUARTERS.map((q) => (
                    <>
                      <th
                        key={`${q}-actual`}
                        className="px-3 py-1 text-center text-xs font-medium text-gray-400"
                      >
                        Actual
                      </th>
                      <th
                        key={`${q}-score`}
                        className="px-3 py-1 text-center text-xs font-medium text-gray-400"
                      >
                        Score
                      </th>
                    </>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {goals.map((goal) => {
                  const row = rowStates[goal.id];
                  const achievementByQuarter = Object.fromEntries(
                    goal.achievements.map((a) => [a.quarter, a])
                  );

                  return (
                    <tr key={goal.id} className="hover:bg-gray-50 align-top">
                      {/* Goal Title */}
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-1">
                          {goal.title}
                          {goal.isShared && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                              Shared
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Thrust Area */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {goal.thrustArea}
                      </td>

                      {/* UoM Type */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {UOM_LABELS[goal.uomType] ?? goal.uomType}
                      </td>

                      {/* Target */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {goal.target}
                      </td>

                      {/* Quarter columns */}
                      {QUARTERS.map((q) => {
                        const existing = achievementByQuarter[q];
                        const currentActual = row?.actuals[q] ?? existing?.actual ?? '';
                        const isSaving = row?.saving[q] ?? false;
                        const rowError = row?.errors[q];

                        return (
                          <>
                            {/* Actual input */}
                            <td key={`${goal.id}-${q}-actual`} className="px-3 py-3">
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  value={currentActual}
                                  onChange={(e) =>
                                    handleActualChange(goal.id, q, e.target.value)
                                  }
                                  placeholder="—"
                                  aria-label={`${goal.title} ${q} actual`}
                                  className="w-24 rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                {rowError && (
                                  <p className="text-xs text-red-600">{rowError}</p>
                                )}
                                <button
                                  onClick={() => handleSave(goal.id, q)}
                                  disabled={isSaving}
                                  aria-label={`Save ${goal.title} ${q}`}
                                  className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {isSaving ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </td>

                            {/* Score display */}
                            <td
                              key={`${goal.id}-${q}-score`}
                              className="whitespace-nowrap px-3 py-3 text-center text-gray-700"
                            >
                              {existing ? (
                                <span
                                  className={`font-medium ${
                                    existing.score >= 1
                                      ? 'text-green-600'
                                      : existing.score >= 0.5
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                  }`}
                                >
                                  {formatScore(Number(existing.score))}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </>
                        );
                      })}

                      {/* Status selector */}
                      <td className="px-4 py-3">
                        <select
                          value={row?.status ?? goal.status}
                          onChange={(e) =>
                            handleStatusChange(goal.id, e.target.value as GoalStatus)
                          }
                          aria-label={`${goal.title} status`}
                          className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {GOAL_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AchievementPage;
