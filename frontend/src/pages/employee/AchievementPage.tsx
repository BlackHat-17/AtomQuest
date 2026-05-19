import React, { useEffect, useState, useCallback } from 'react';
import { useAchievements } from '../../hooks/useAchievements';
import api from '../../lib/api';
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

function getScoreColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-600 bg-emerald-50';
  if (score >= 0.5) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

// Removed - we'll fetch the sheet ID from the API instead

// ─── Row state type ───────────────────────────────────────────────────────────

interface RowState {
  actuals: Partial<Record<Quarter, string>>;
  status: GoalStatus;
  saving: Partial<Record<Quarter, boolean>>;
  errors: Partial<Record<Quarter, string>>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AchievementPage() {
  const { goals, loading, error, fetchAchievements, updateAchievement } = useAchievements();
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetLoading, setSheetLoading] = useState(true);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Fetch the user's goal sheet to get the sheet ID
  useEffect(() => {
    async function fetchSheet() {
      setSheetLoading(true);
      setSheetError(null);
      try {
        const { data } = await api.get('/goals/my-sheet');
        setSheetId(data.id);
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to load goal sheet';
        setSheetError(message);
      } finally {
        setSheetLoading(false);
      }
    }
    fetchSheet();
  }, []);

  useEffect(() => {
    if (sheetId) fetchAchievements(sheetId);
  }, [sheetId, fetchAchievements]);

  useEffect(() => {
    if (goals.length === 0) return;
    setRowStates((prev) => {
      const next: Record<string, RowState> = { ...prev };
      for (const goal of goals) {
        if (next[goal.id]) continue;
        const actuals: Partial<Record<Quarter, string>> = {};
        for (const ach of goal.achievements) {
          actuals[ach.quarter] = ach.actual;
        }
        next[goal.id] = { actuals, status: goal.status, saving: {}, errors: {} };
      }
      return next;
    });
  }, [goals]);

  // ─── Compute quarter averages ─────────────────────────────────────────────

  const quarterAverages: Partial<Record<Quarter, number>> = {};
  for (const q of QUARTERS) {
    const scores = goals
      .flatMap((g) => g.achievements)
      .filter((a) => a.quarter === q && a.score != null)
      .map((a) => Number(a.score));
    if (scores.length > 0) {
      quarterAverages[q] = scores.reduce((s, v) => s + v, 0) / scores.length;
    }
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleActualChange = useCallback((goalId: string, quarter: Quarter, value: string) => {
    setRowStates((prev) => ({
      ...prev,
      [goalId]: {
        ...prev[goalId],
        actuals: { ...prev[goalId]?.actuals, [quarter]: value },
        errors: { ...prev[goalId]?.errors, [quarter]: undefined },
      },
    }));
  }, []);

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
          [goalId]: { ...prev[goalId], errors: { ...prev[goalId]?.errors, [quarter]: 'Actual value is required' } },
        }));
        return;
      }
      setRowStates((prev) => ({
        ...prev,
        [goalId]: { ...prev[goalId], saving: { ...prev[goalId]?.saving, [quarter]: true }, errors: { ...prev[goalId]?.errors, [quarter]: undefined } },
      }));
      try {
        await updateAchievement(goalId, quarter, actual, row.status);
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save achievement';
        setRowStates((prev) => ({
          ...prev,
          [goalId]: { ...prev[goalId], errors: { ...prev[goalId]?.errors, [quarter]: message } },
        }));
      } finally {
        setRowStates((prev) => ({
          ...prev,
          [goalId]: { ...prev[goalId], saving: { ...prev[goalId]?.saving, [quarter]: false } },
        }));
      }
    },
    [rowStates, updateAchievement]
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (sheetLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading goal sheet…
        </div>
      </div>
    );
  }

  if (sheetError || !sheetId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-xl bg-amber-50 p-6 text-amber-700 shadow-sm max-w-sm w-full text-center">
          <p className="font-semibold">No goal sheet found</p>
          <p className="mt-1 text-sm">{sheetError ?? 'Please visit your Goal Sheet page first to create your sheet.'}</p>
        </div>
      </div>
    );
  }

  if (loading && goals.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading achievements…
        </div>
      </div>
    );
  }

  if (error && goals.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-xl bg-red-50 p-6 text-red-700 shadow-sm max-w-sm w-full text-center">
          <p className="font-semibold">Error loading achievements</p>
          <p className="mt-1 text-sm">{error}</p>
          <button onClick={() => fetchAchievements(sheetId)} className="mt-3 text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quarterly Achievements</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your actual values for each goal per quarter. Scores are computed automatically.
        </p>
      </div>

      {/* Quarter summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUARTERS.map((q) => {
          const avg = quarterAverages[q];
          return (
            <div key={q} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{q} Avg</p>
              {avg !== undefined ? (
                <p className={`mt-1 text-xl font-bold rounded-lg px-2 py-0.5 inline-block ${getScoreColor(avg)}`}>
                  {formatScore(avg)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-400">—</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {goals.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-500 shadow-sm">
          <p className="text-sm">No goals found. Please set up your goal sheet first.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Goal Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Thrust Area</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">UoM</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target</th>
                  {QUARTERS.map((q) => (
                    <th key={q} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={2}>
                      {q}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                </tr>
                <tr className="bg-gray-50 border-t border-gray-100">
                  <th colSpan={4} />
                  {QUARTERS.map((q) => (
                    <React.Fragment key={q}>
                      <th className="px-3 py-1 text-center text-xs font-medium text-gray-400">Actual</th>
                      <th className="px-3 py-1 text-center text-xs font-medium text-gray-400">Score</th>
                    </React.Fragment>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {goals.map((goal) => {
                  const row = rowStates[goal.id];
                  const achievementByQuarter = Object.fromEntries(goal.achievements.map((a) => [a.quarter, a]));

                  return (
                    <tr key={goal.id} className="hover:bg-gray-50 transition-colors align-top">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-1">
                          {goal.title}
                          {goal.isShared && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-[#2d1238]/10 px-1.5 py-0.5 text-xs font-medium text-[#2d1238]">Shared</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{goal.thrustArea}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{UOM_LABELS[goal.uomType] ?? goal.uomType}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{goal.target}</td>

                      {QUARTERS.map((q) => {
                        const existing = achievementByQuarter[q];
                        const currentActual = row?.actuals[q] ?? existing?.actual ?? '';
                        const isSaving = row?.saving[q] ?? false;
                        const rowError = row?.errors[q];

                        return (
                          <React.Fragment key={`${goal.id}-${q}`}>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  value={currentActual}
                                  onChange={(e) => handleActualChange(goal.id, q, e.target.value)}
                                  placeholder="—"
                                  aria-label={`${goal.title} ${q} actual`}
                                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25] transition-colors"
                                />
                                {rowError && <p className="text-xs text-red-600">{rowError}</p>}
                                <button
                                  onClick={() => handleSave(goal.id, q)}
                                  disabled={isSaving}
                                  aria-label={`Save ${goal.title} ${q}`}
                                  className="rounded-md bg-[#1f0c25] px-2 py-0.5 text-xs font-medium text-white hover:bg-[#2d1238] disabled:opacity-50 transition-colors"
                                >
                                  {isSaving ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              {existing ? (
                                <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${getScoreColor(Number(existing.score))}`}>
                                  {formatScore(Number(existing.score))}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      <td className="px-4 py-3">
                        <select
                          value={row?.status ?? goal.status}
                          onChange={(e) => handleStatusChange(goal.id, e.target.value as GoalStatus)}
                          aria-label={`${goal.title} status`}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25]"
                        >
                          {GOAL_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
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
