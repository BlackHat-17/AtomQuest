import { useEffect, useState } from 'react';
import { useGoals } from '../../hooks/useGoals';
import { GoalForm } from '../../components/GoalForm';
import { WeightageBar } from '../../components/WeightageBar';
import type { Goal, GoalFormData, SheetStatus } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<SheetStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-300' },
  SUBMITTED: { label: 'Submitted', className: 'bg-blue-100 text-blue-700 border-blue-300' },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-700 border-green-300' },
  REWORK: { label: 'Rework Required', className: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  LOCKED: { label: 'Locked', className: 'bg-red-100 text-red-700 border-red-300' },
};

const UOM_LABELS: Record<string, string> = {
  NUMERIC_MIN: 'Numeric (Min)',
  NUMERIC_MAX: 'Numeric (Max)',
  TIMELINE: 'Timeline',
  ZERO: 'Zero',
};

const GOAL_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  ON_TRACK: 'On Track',
  COMPLETED: 'Completed',
};

/** Statuses where add/edit/delete are disabled */
const READ_ONLY_STATUSES: SheetStatus[] = ['SUBMITTED', 'APPROVED', 'LOCKED'];

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalSheetPage() {
  const { sheet, loading, error, fetchMySheet, createGoal, updateGoal, deleteGoal } = useGoals();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchMySheet();
  }, [fetchMySheet]);

  const isReadOnly = sheet ? READ_ONLY_STATUSES.includes(sheet.status) : false;
  const statusInfo = sheet ? STATUS_BADGE[sheet.status] : null;

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function openAddModal() {
    setEditingGoal(undefined);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(goal: Goal) {
    setEditingGoal(goal);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingGoal(undefined);
    setFormError(null);
  }

  async function handleFormSubmit(data: GoalFormData) {
    setFormLoading(true);
    setFormError(null);
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, data);
      } else {
        await createGoal(data);
      }
      closeModal();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'An error occurred. Please try again.';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(goalId: string) {
    setDeleteLoading(true);
    try {
      await deleteGoal(goalId);
    } finally {
      setDeleteLoading(false);
      setDeletingGoalId(null);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !sheet) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading your goal sheet…</p>
      </div>
    );
  }

  if (error && !sheet) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading goal sheet</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={fetchMySheet}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Goal Sheet</h1>
          {sheet?.cycle && (
            <p className="mt-1 text-sm text-gray-500">
              Cycle: {sheet.cycle.year} — {sheet.cycle.phase.replace('_', ' ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {statusInfo && (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusInfo.className}`}
            >
              {statusInfo.label}
            </span>
          )}
          {!isReadOnly && (
            <button
              onClick={openAddModal}
              disabled={loading || (sheet?.goals.length ?? 0) >= 8}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              + Add Goal
            </button>
          )}
        </div>
      </div>

      {/* Rework comment */}
      {sheet?.status === 'REWORK' && sheet.reworkComment && (
        <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-yellow-800">Manager's feedback:</p>
          <p className="mt-1 text-sm text-yellow-700">{sheet.reworkComment}</p>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Weightage bar */}
      {sheet && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Weightage Distribution</h2>
          <WeightageBar
            goals={sheet.goals.map((g) => ({
              title: g.title,
              weightage: Number(g.weightage),
            }))}
          />
        </div>
      )}

      {/* Goals table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {!sheet || sheet.goals.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <p className="text-sm">No goals added yet.</p>
            {!isReadOnly && (
              <button
                onClick={openAddModal}
                className="mt-2 text-sm text-indigo-600 underline hover:no-underline"
              >
                Add your first goal
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Thrust Area
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    UoM Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Target
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Weightage
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  {!isReadOnly && (
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sheet.goals.map((goal) => (
                  <tr key={goal.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {goal.thrustArea}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                        {goal.isShared && (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                            Shared
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                        {goal.description}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {UOM_LABELS[goal.uomType] ?? goal.uomType}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {goal.target}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {Number(goal.weightage).toFixed(0)}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          goal.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-700'
                            : goal.status === 'ON_TRACK'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {GOAL_STATUS_LABELS[goal.status] ?? goal.status}
                      </span>
                      {goal.isLocked && (
                        <span
                          className="ml-1 text-xs text-gray-400"
                          title="This goal is locked"
                          aria-label="Locked"
                        >
                          🔒
                        </span>
                      )}
                    </td>
                    {!isReadOnly && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditModal(goal)}
                            disabled={goal.isLocked || loading}
                            className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingGoalId(goal.id)}
                            disabled={goal.isLocked || loading}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Goal count hint */}
      {sheet && (
        <p className="mt-2 text-right text-xs text-gray-400">
          {sheet.goals.length} / 8 goals
        </p>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 id="modal-title" className="mb-4 text-lg font-semibold text-gray-900">
              {editingGoal ? 'Edit Goal' : 'Add New Goal'}
            </h2>

            {formError && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <GoalForm
              goal={editingGoal}
              goalSheetId={sheet?.id}
              onSubmit={handleFormSubmit}
              onCancel={closeModal}
              loading={formLoading}
              isShared={editingGoal?.isShared}
            />
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────────────── */}
      {deletingGoalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 id="delete-modal-title" className="mb-2 text-lg font-semibold text-gray-900">
              Delete Goal
            </h2>
            <p className="mb-5 text-sm text-gray-600">
              Are you sure you want to delete this goal? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingGoalId(null)}
                disabled={deleteLoading}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingGoalId)}
                disabled={deleteLoading}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoalSheetPage;
