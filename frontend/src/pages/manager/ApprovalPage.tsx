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

  useEffect(() => { setDraft(value); }, [value]);

  if (!editable) return <span className="text-sm text-gray-700">{value}</span>;

  if (editing) {
    return (
      <input
        type={type}
        value={draft}
        min={min}
        max={max}
        autoFocus
        className="w-24 rounded-lg border border-indigo-400 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onChange(draft); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { setEditing(false); onChange(draft); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-gray-700 hover:bg-[#1f0c25]/5 hover:text-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25]/40 transition-colors"
      title="Click to edit"
    >
      {value}
      <svg className="h-3 w-3 text-gray-400 group-hover:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
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
  const [edits, setEdits] = useState<EditMap>({});
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [reworkComment, setReworkComment] = useState('');
  const [reworkLoading, setReworkLoading] = useState(false);
  const [reworkError, setReworkError] = useState<string | null>(null);
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
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load goal sheet';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

  useEffect(() => { fetchSheet(); }, [fetchSheet]);

  const isSubmitted = sheet?.status === 'SUBMITTED';
  const isLocked = sheet?.status === 'LOCKED' || sheet?.status === 'APPROVED';
  const canEditGoals = isSubmitted || isLocked; // Allow editing both submitted and locked goals

  const displayGoals: Goal[] = (sheet?.goals ?? []).map((g) => {
    const edit = edits[g.id];
    if (!edit) return g;
    return { ...g, target: edit.target ?? g.target, weightage: edit.weightage ?? Number(g.weightage) };
  });

  function buildEditsPayload() {
    return Object.entries(edits)
      .filter(([, edit]) => Object.keys(edit).length > 0)
      .map(([goalId, edit]) => ({ goalId, ...edit }));
  }

  function handleTargetEdit(goalId: string, value: string) {
    setEdits((prev) => ({ ...prev, [goalId]: { ...prev[goalId], target: value } }));
  }

  function handleWeightageEdit(goalId: string, value: string) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setEdits((prev) => ({ ...prev, [goalId]: { ...prev[goalId], weightage: num } }));
    }
  }

  async function handleApprove() {
    if (!sheetId) return;
    setApproveLoading(true);
    setApproveError(null);
    try {
      const editsPayload = buildEditsPayload();
      
      if (isLocked) {
        // For locked goals, update each goal individually
        for (const edit of editsPayload) {
          await api.put(`/goals/${edit.goalId}`, {
            target: edit.target,
            weightage: edit.weightage,
          });
        }
        // Refresh the sheet
        await fetchSheet();
        setEdits({});
        setApproveDialogOpen(false);
        setSuccessMessage('Changes saved successfully and logged in audit log.');
      } else {
        // For submitted goals, use the approve endpoint
        const body = editsPayload.length > 0 ? { edits: editsPayload } : {};
        const { data } = await api.post<GoalSheet>(`/goals/${sheetId}/approve`, body);
        setSheet(data);
        setEdits({});
        setApproveDialogOpen(false);
        setSuccessMessage('Goal sheet approved and goals locked successfully.');
      }
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { error?: string; errors?: string[] } } })?.response?.data;
      const message = errData?.errors?.join(', ') ?? errData?.error ?? 'Failed to save changes';
      setApproveError(message);
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleRework() {
    if (!sheetId) return;
    if (!reworkComment.trim()) { setReworkError('A comment is required when returning for rework.'); return; }
    setReworkLoading(true);
    setReworkError(null);
    try {
      const { data } = await api.post<GoalSheet>(`/goals/${sheetId}/rework`, { comment: reworkComment.trim() });
      setSheet(data);
      setReworkDialogOpen(false);
      setReworkComment('');
      setSuccessMessage('Goal sheet returned for rework.');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to return sheet for rework';
      setReworkError(message);
    } finally {
      setReworkLoading(false);
    }
  }

  if (loading) {
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

  if (error || !sheet) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-xl bg-red-50 p-6 text-red-700 shadow-sm max-w-sm w-full text-center">
          <p className="font-semibold">Error loading goal sheet</p>
          <p className="mt-1 text-sm">{error ?? 'Sheet not found'}</p>
          <button onClick={() => navigate('/manager/team')} className="mt-3 text-sm underline hover:no-underline">
            Back to team dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => navigate('/manager/team')} className="mb-2 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to team dashboard
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Goal Sheet Review</h1>
            {sheet.cycle && (
              <p className="mt-1 text-sm text-gray-500">
                Cycle: {sheet.cycle.year} — {sheet.cycle.phase.replace('_', ' ')}
              </p>
            )}
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            sheet.status === 'SUBMITTED' ? 'border-blue-300 bg-blue-100 text-blue-700' :
            sheet.status === 'LOCKED' || sheet.status === 'APPROVED' ? 'border-emerald-300 bg-emerald-100 text-emerald-700' :
            sheet.status === 'REWORK' ? 'border-amber-300 bg-amber-100 text-amber-700' :
            'border-gray-300 bg-gray-100 text-gray-600'
          }`}>
            {sheet.status}
          </span>
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 flex items-center justify-between">
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Rework comment */}
      {sheet.status === 'REWORK' && sheet.reworkComment && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Rework comment sent to employee:</p>
          <p className="mt-1 text-sm text-amber-700">{sheet.reworkComment}</p>
        </div>
      )}

      {/* Inline edit hint */}
      {canEditGoals && (
        <div className="mb-4 rounded-xl border border-[#1f0c25]/20 bg-[#1f0c25]/5 p-3 text-sm text-[#1f0c25] flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Click on <strong className="mx-1">Target</strong> or <strong className="mx-1">Weightage</strong> values to edit them inline{isLocked ? '. Changes will be logged in the audit log.' : ' before approving.'} 
        </div>
      )}

      {/* Weightage bar */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Weightage Distribution</h2>
        <WeightageBar goals={displayGoals.map((g) => ({ title: g.title, weightage: Number(g.weightage) }))} />
      </div>

      {/* Goals table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {displayGoals.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">No goals found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Thrust Area</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">UoM Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Weightage</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {displayGoals.map((goal) => (
                  <tr key={goal.id} className="hover:bg-gray-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{goal.thrustArea}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{goal.description}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{UOM_LABELS[goal.uomType] ?? goal.uomType}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {canEditGoals ? (
                        <EditableCell value={goal.target} editable={true} onChange={(val) => handleTargetEdit(goal.id, val)} />
                      ) : (
                        <span className="text-sm text-gray-700">{goal.target}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {canEditGoals ? (
                        <span className="inline-flex items-center gap-0.5">
                          <EditableCell value={Number(goal.weightage).toFixed(0)} editable={true} type="number" min={10} max={100} onChange={(val) => handleWeightageEdit(goal.id, val)} />
                          <span className="text-sm text-gray-500">%</span>
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-gray-900">{Number(goal.weightage).toFixed(0)}%</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        goal.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                        goal.status === 'ON_TRACK' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {goal.status.replace('_', ' ')}
                      </span>
                      {goal.isLocked && <span className="ml-1 text-xs text-gray-400" title="Locked">🔒</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action buttons — fixed on mobile, inline on desktop */}
      <div className="mt-6 flex justify-end gap-3 sm:static fixed bottom-0 left-0 right-0 sm:p-0 p-4 bg-white sm:bg-transparent border-t sm:border-0 border-gray-200 z-10">
        {isSubmitted ? (
          <>
            <button
              onClick={() => { setReworkError(null); setReworkComment(''); setReworkDialogOpen(true); }}
              className="flex-1 sm:flex-none rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              Return for Rework
            </button>
            <button
              onClick={() => { setApproveError(null); setApproveDialogOpen(true); }}
              className="flex-1 sm:flex-none rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              Approve
            </button>
          </>
        ) : isLocked && Object.keys(edits).length > 0 ? (
          <button
            onClick={() => { setApproveError(null); setApproveDialogOpen(true); }}
            className="flex-1 sm:flex-none rounded-lg bg-[#1f0c25] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d1238] transition-colors shadow-sm"
          >
            Save Changes
          </button>
        ) : null}
      </div>

      {/* Spacer for mobile fixed buttons */}
      <div className="h-20 sm:hidden" />

      {/* ── Approve/Save Dialog ──────────────────────────────────────────────── */}
      {approveDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 motion-safe:animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="approve-dialog-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl motion-safe:animate-scale-in">
            <h2 id="approve-dialog-title" className="mb-2 text-lg font-semibold text-gray-900">
              {isLocked ? 'Save Changes' : 'Approve Goal Sheet'}
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              {isLocked 
                ? 'Your changes will be saved and logged in the audit log for compliance tracking.'
                : 'This will lock all goals and mark the sheet as approved. This action cannot be undone without admin intervention.'}
            </p>
            {Object.keys(edits).length > 0 && (
              <p className="mb-4 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-700">
                {isLocked 
                  ? `You are updating ${Object.keys(edits).length} goal(s).`
                  : 'Your inline edits will be saved as part of this approval.'}
              </p>
            )}
            {approveError && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{approveError}</div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setApproveDialogOpen(false)} disabled={approveLoading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleApprove} disabled={approveLoading} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${isLocked ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                {approveLoading ? (isLocked ? 'Saving…' : 'Approving…') : (isLocked ? 'Confirm Save' : 'Confirm Approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rework Dialog ────────────────────────────────────────────────────── */}
      {reworkDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 motion-safe:animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="rework-dialog-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl motion-safe:animate-scale-in">
            <h2 id="rework-dialog-title" className="mb-2 text-lg font-semibold text-gray-900">Return for Rework</h2>
            <p className="mb-4 text-sm text-gray-600">Provide feedback to the employee explaining what needs to be revised.</p>
            <label htmlFor="rework-comment" className="mb-1 block text-sm font-medium text-gray-700">
              Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              id="rework-comment"
              rows={4}
              value={reworkComment}
              onChange={(e) => setReworkComment(e.target.value)}
              placeholder="Explain what needs to be changed…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {reworkError && (
              <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{reworkError}</div>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setReworkDialogOpen(false)} disabled={reworkLoading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleRework} disabled={reworkLoading || !reworkComment.trim()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
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
