import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import type { Goal, GoalSheet } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  department: string;
}

interface TeamResponse {
  cycle: { id: string; year: number; phase: string } | null;
  team: TeamMember[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PushKpiModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PushKpiModal({ open, onClose, onSuccess }: PushKpiModalProps) {
  // Step 1: select source goal; Step 2: select target employees
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state
  const [mySheet, setMySheet] = useState<GoalSheet | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Step 2 state
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [cycleId, setCycleId] = useState<string>('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Submit state
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const fetchMySheet = useCallback(async () => {
    setSheetLoading(true);
    setSheetError(null);
    try {
      const { data } = await api.get<GoalSheet>('/goals/my-sheet');
      setMySheet(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load your goal sheet';
      setSheetError(message);
    } finally {
      setSheetLoading(false);
    }
  }, []);

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const { data } = await api.get<TeamResponse>('/manager/team');
      setTeam(data.team);
      if (data.cycle) {
        setCycleId(data.cycle.id);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load team members';
      setTeamError(message);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  // Fetch data when modal opens
  useEffect(() => {
    if (!open) return;
    // Reset state on open
    setStep(1);
    setSelectedGoalId('');
    setSelectedEmployeeIds(new Set());
    setSubmitError(null);
    fetchMySheet();
    fetchTeam();
  }, [open, fetchMySheet, fetchTeam]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleGoalSelect(goalId: string) {
    setSelectedGoalId(goalId);
  }

  function handleEmployeeToggle(employeeId: string) {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedEmployeeIds.size === team.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(team.map((m) => m.id)));
    }
  }

  async function handleSubmit() {
    if (!selectedGoalId || selectedEmployeeIds.size === 0 || !cycleId) return;

    setSubmitLoading(true);
    setSubmitError(null);
    try {
      await api.post('/shared-goals/push', {
        sourceGoalId: selectedGoalId,
        targetEmployeeIds: Array.from(selectedEmployeeIds),
        cycleId,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to push KPI. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitLoading(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!open) return null;

  const goals: Goal[] = mySheet?.goals ?? [];
  const selectedGoal = goals.find((g) => g.id === selectedGoalId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-kpi-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 id="push-kpi-modal-title" className="text-lg font-semibold text-gray-900">
            Push KPI to Team
          </h2>
          <button
            onClick={onClose}
            disabled={submitLoading}
            aria-label="Close modal"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === 1
                  ? 'bg-indigo-600 text-white'
                  : 'bg-green-500 text-white'
              }`}
            >
              {step === 1 ? '1' : '✓'}
            </span>
            <span className={`text-sm ${step === 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              Select Goal
            </span>
          </div>
          <div className="mx-3 flex items-center text-gray-300">→</div>
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === 2 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              2
            </span>
            <span className={`text-sm ${step === 2 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              Select Employees
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto px-6 py-4">
          {/* ── Step 1: Select source goal ─────────────────────────────────── */}
          {step === 1 && (
            <>
              {sheetLoading ? (
                <p className="py-6 text-center text-sm text-gray-500">Loading your goals…</p>
              ) : sheetError ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {sheetError}
                </div>
              ) : goals.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  You have no goals to push. Add goals to your sheet first.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="mb-3 text-sm text-gray-600">
                    Select a goal from your sheet to push to your team members:
                  </p>
                  {goals.map((goal) => (
                    <label
                      key={goal.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        selectedGoalId === goal.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sourceGoal"
                        value={goal.id}
                        checked={selectedGoalId === goal.id}
                        onChange={() => handleGoalSelect(goal.id)}
                        className="mt-0.5 h-4 w-4 text-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {goal.thrustArea} · {goal.uomType.replace('_', ' ')} · Target: {goal.target}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Select target employees ───────────────────────────── */}
          {step === 2 && (
            <>
              {/* Selected goal summary */}
              {selectedGoal && (
                <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    Pushing goal
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">{selectedGoal.title}</p>
                  <p className="text-xs text-gray-500">
                    Target: {selectedGoal.target} · {selectedGoal.uomType.replace('_', ' ')}
                  </p>
                </div>
              )}

              {teamLoading ? (
                <p className="py-6 text-center text-sm text-gray-500">Loading team members…</p>
              ) : teamError ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {teamError}
                </div>
              ) : team.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No direct reports found.</p>
              ) : (
                <div className="space-y-2">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Select employees to receive this KPI:
                    </p>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {selectedEmployeeIds.size === team.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {team.map((member) => (
                    <label
                      key={member.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedEmployeeIds.has(member.id)
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployeeIds.has(member.id)}
                        onChange={() => handleEmployeeToggle(member.id)}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-500">
                          {member.department} · {member.email}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {!cycleId && !teamLoading && (
                <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-700">
                  No active cycle found. Cannot push KPI without an active cycle.
                </div>
              )}
            </>
          )}

          {/* Submit error */}
          {submitError && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={step === 1 ? onClose : () => setStep(1)}
            disabled={submitLoading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!selectedGoalId || sheetLoading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Next: Select Employees →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                submitLoading ||
                selectedEmployeeIds.size === 0 ||
                !cycleId ||
                teamLoading
              }
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitLoading
                ? 'Pushing…'
                : `Push KPI to ${selectedEmployeeIds.size} employee${selectedEmployeeIds.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PushKpiModal;
