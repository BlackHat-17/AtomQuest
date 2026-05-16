import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { WeightageBar } from '../../components/WeightageBar';
import type { GoalSheet, Goal } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalEdit {
  target?: string;
  weightage?: number;
}

type EditMap = Record<string, GoalEdit>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UOM_LABELS: Record<string, string> = {
  NUMERIC_MIN: 'Numeric (Min)',
  NUMERIC_MAX: 'Numeric (Max)',
  TIMELINE: 'Timeline',
  ZERO: 'Zero',
};

// ─── Inline editable cell ─────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  editable: boolean;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  onChange: (val: string) => void;
}

function EditableCell({ value, editable, type = 'text', min, max, onChange }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // Sync draft when value changes externally
  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!editable) {
    return <span className="text-sm text-gray-700">{value}</span>;
  }

  if (editing) {
    return (
      <input
        type={type}
        value={draft}
        min={min}
        max={max}
        autoFocus
        className="w-24 rounded border border-indigo-400 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setEditing(false);
            onChange(draft);
          }
          if (e.key === 'Escape') {
            setEditing(false);
            setDraft(value);
          }
        }}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="rounded px-1.5 py-0.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      title="Click to edit"
    >
      {value}
      <span className="ml-1 text-xs text-gray-400">✎</span>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ApprovalPage() {
  const { sheetId } = useParams<{ sheetId: string }>();
  const navigate = useNavigate();

  const [sheet, setSheet] = useState<GoalSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline edits keyed by goalId
  const [edits, setEdits] = useState<EditMap>({});

  // Approve dialog
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Rework dialog
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [reworkComment, setReworkComment] = useState('');
  const [reworkLoading, setReworkLoading] = useState(false);
  const [reworkError, setReworkError] = useState<string | null>(null);

  // Success feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchSheet = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<GoalSheet>(`/goals/${sheetId}`);
      setSheet(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load goal sheet';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

  useEffect(() => {
    fetchSheet();
  }, [fetchSheet]);

  // ─── Derived state ───────────────────────────────────────────────────────────

  const isSubmitted = sheet?.status === 'SUBMITTED';

  /** Goals with any pending edits merged in for display */
  const displayGoals: Goal[] = (sheet?.goals ?? []).map((g) => {
    const edit = edits[g.id];
    if (!edit) return g;
    return {
      ...g,
      target: edit.target ?? g.target,
      weightage: edit.weightage ?? Number(g.weightage),
    };
  });

  /** Build the edits array for the API call */
  function buildEditsPayload() {
    return Object.entries(edits)
      .filter(([, edit]) => Object.keys(edit).length > 0)
      .map(([goalId, edit]) => ({ goalId, ...edit }));
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleTargetEdit(goalId: string, value: string) {
    setEdits((prev) => ({
      ...prev,
      [goalId]: { ...prev[goalId], target: value },
    }));
  }

  function handleWeightageEdit(goalId: string, value: string) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setEdits((prev) => ({
        ...prev,
        [goalId]: { ...prev[goalId], weightage: num },
      }));
    }
  }

  async function handleApprove() {
    if (!sheetId) return;
    setApproveLoading(true);
    setApproveError(null);
    try {
      const editsPayload = buildEditsPayload();
      const body = editsPayload.length > 0 ? { edits: editsPayload } : {};
      const { data } = await api.post<GoalSheet>(`/goals/${sheetId}/approve`, body);
      setSheet(data);
      setEdits({});
      setApproveDialogOpen(false);
      setSuccessMessage('Goal sheet approved and goals locked successfully.');
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { error?: string; errors?: string[] } } })
        ?.response?.data;
      const message =
        errData?.errors?.join(', ') ?? errData?.error ?? 'Failed to approve goal sheet';
      setApproveError(message);
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleRework() {
    if (!sheetId) return;
    if (!reworkComment.trim()) {
      setReworkError('A comment is required when returning for rework.');
      return;
    }
    setReworkLoading(true);
    setReworkError(null);
    try {
      const { data } = await api.post<GoalSheet>(`/goals/${sheetId}/rework`, {
        comment: reworkComment.trim(),
      });
      setSheet(data);
      setReworkDialogOpen(false);
      setReworkComment('');
      setSuccessMessage('Goal sheet returned for rework.');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to return sheet for rework';
      setReworkError(message);
    } finally {
      setReworkLoading(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading goal sheet…</p>
      </div>
    );
  }

  if (error || !sheet) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading goal sheet</p>
          <p className="text-sm">{error ?? 'Sheet not found'}</p>
          <button
            onClick={() => navigate('/manager/team')}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Back to team dashboard
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
          <button
            onClick={() => navigate('/manager/team')}
            className="mb-2 text-sm text-indigo-600 hover:underline"
          >
            ← Back to team dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Goal Sheet Review</h1>
          {sheet.cycle && (
            <p className="mt-1 text-sm text-gray-500">
              Cycle: {sheet.cycle.year} — {sheet.cycle.phase.replace('_', ' ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              sheet.status === 'SUBMITTED'
                ? 'border-blue-300 bg-blue-100 text-blue-700'
                : sheet.status === 'LOCKED' || sheet.status === 'APPROVED'
                  ? 'border-green-300 bg-green-100 text-green-700'
                  : sheet.status === 'REWORK'
                    ? 'border-yellow-300 bg-yellow-100 text-yellow-700'
                    : 'border-gray-300 bg-gray-100 text-gray-600'
            }`}
          >
            {sheet.status}
          </span>
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-2 text-green-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Rework comment (if applicable) */}
      {sheet.status === 'REWORK' && sheet.reworkComment && (
        <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-yellow-800">Rework comment sent to employee:</p>
          <p className="mt-1 text-sm text-yellow-700">{sheet.reworkComment}</p>
        </div>
      )}

      {/* Inline edit hint */}
      {isSubmitted && (
        <div className="mb-4 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700">
          You can click on <strong>Target</strong> or <strong>Weightage</strong> values to edit
          them inline before approving.
        </div>
      )}

      {/* Weightage bar — live updates with edits */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Weightage Distribution</h2>
        <WeightageBar
          goals={displayGoals.map((g) => ({
            title: g.title,
            weightage: Number(g.weightage),
          }))}
        />
      </div>

      {/* Goals table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {displayGoals.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">No goals found.</div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {displayGoals.map((goal) => (
                  <tr key={goal.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {goal.thrustArea}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                        {goal.description}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {UOM_LABELS[goal.uomType] ?? goal.uomType}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {isSubmitted ? (
                        <EditableCell
                          value={goal.target}
                          editable={true}
                          onChange={(val) => handleTargetEdit(goal.id, val)}
                        />
                      ) : (
                        <span className="text-sm text-gray-700">{goal.target}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {isSubmitted ? (
                        <>
                          <EditableCell
                            value={Number(goal.weightage).toFixed(0)}
                            editable={true}
                            type="number"
                            min={10}
                            max={100}
                            onChange={(val) => handleWeightageEdit(goal.id, val)}
                          />
                          <span className="ml-0.5 text-sm text-gray-500">%</span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-gray-900">
                          {Number(goal.weightage).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          goal.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-700'
                            : goal.status === 'ON_TRACK'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {goal.status.replace('_', ' ')}
                      </span>
                      {goal.isLocked && (
                        <span className="ml-1 text-xs text-gray-400" title="Locked">
                          🔒
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={() => {
            setReworkError(null);
            setReworkComment('');
            setReworkDialogOpen(true);
          }}
          disabled={!isSubmitted}
          className="rounded-md border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Return for Rework
        </button>
        <button
          onClick={() => {
            setApproveError(null);
            setApproveDialogOpen(true);
          }}
          disabled={!isSubmitted}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve
        </button>
      </div>

      {/* ── Approve Confirmation Dialog ──────────────────────────────────────── */}
      {approveDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-dialog-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2
              id="approve-dialog-title"
              className="mb-2 text-lg font-semibold text-gray-900"
            >
              Approve Goal Sheet
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              This will lock all goals and mark the sheet as approved. This action cannot be
              undone without admin intervention.
            </p>
            {Object.keys(edits).length > 0 && (
              <p className="mb-4 rounded-md bg-indigo-50 p-2 text-xs text-indigo-700">
                Your inline edits will be saved as part of this approval.
              </p>
            )}
            {approveError && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {approveError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setApproveDialogOpen(false)}
                disabled={approveLoading}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approveLoading}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {approveLoading ? 'Approving…' : 'Confirm Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rework Dialog ────────────────────────────────────────────────────── */}
      {reworkDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rework-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2
              id="rework-dialog-title"
              className="mb-2 text-lg font-semibold text-gray-900"
            >
              Return for Rework
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              Provide feedback to the employee explaining what needs to be revised.
            </p>
            <label
              htmlFor="rework-comment"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              id="rework-comment"
              rows={4}
              value={reworkComment}
              onChange={(e) => setReworkComment(e.target.value)}
              placeholder="Explain what needs to be changed…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {reworkError && (
              <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {reworkError}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setReworkDialogOpen(false)}
                disabled={reworkLoading}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRework}
                disabled={reworkLoading || !reworkComment.trim()}
                className="rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
              >
                {reworkLoading ? 'Sending…' : 'Return for Rework'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApprovalPage;
