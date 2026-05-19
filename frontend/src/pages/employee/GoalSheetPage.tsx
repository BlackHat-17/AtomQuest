import { useEffect, useState } from 'react';
import { useGoals } from '../../hooks/useGoals';
import { GoalForm } from '../../components/GoalForm';
import { WeightageBar } from '../../components/WeightageBar';
import { AIGoalSuggestions } from '../../components/AIGoalSuggestions';
import { FloatingBot } from '../../components/FloatingBot';
import { geminiEnabled } from '../../lib/gemini';
import { useAuth } from '../../hooks/useAuth';
import api from '../../lib/api';
import type { Goal, GoalFormData, GoalSheet, SheetStatus, ThrustArea, UomType } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<SheetStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-300' },
  SUBMITTED: { label: 'Submitted', className: 'bg-blue-100 text-blue-700 border-blue-300' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  REWORK: { label: 'Rework Required', className: 'bg-amber-100 text-amber-700 border-amber-300' },
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

const READ_ONLY_STATUSES: SheetStatus[] = ['SUBMITTED', 'APPROVED', 'LOCKED'];

// ─── Empty state illustration ─────────────────────────────────────────────────

function EmptyGoalsIllustration() {
  return (
    <svg viewBox="0 0 200 160" className="mx-auto h-32 w-auto text-[#1f0c25]/20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="30" y="30" width="140" height="100" rx="8" fill="currentColor" opacity="0.3" />
      <rect x="45" y="50" width="80" height="8" rx="4" fill="currentColor" opacity="0.5" />
      <rect x="45" y="66" width="110" height="6" rx="3" fill="currentColor" opacity="0.4" />
      <rect x="45" y="80" width="90" height="6" rx="3" fill="currentColor" opacity="0.4" />
      <rect x="45" y="94" width="60" height="6" rx="3" fill="currentColor" opacity="0.3" />
      <circle cx="155" cy="115" r="20" fill="currentColor" opacity="0.6" />
      <path d="M148 115l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalSheetPage() {
  const { sheet, loading, error, fetchMySheet, createGoal, updateGoal, deleteGoal } = useGoals();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<{ thrustArea: ThrustArea; title: string; description: string; uomType: UomType; target: string; weightage: number } | null>(null);
  const [pendingBulkGoals, setPendingBulkGoals] = useState<Array<{ thrustArea: ThrustArea; title: string; description: string; uomType: UomType; target: string; weightage: number }>>([]);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  
  // Inline editing state
  const [inlineEditingGoalId, setInlineEditingGoalId] = useState<string | null>(null);
  const [inlineEditingField, setInlineEditingField] = useState<'title' | 'description' | 'target' | 'weightage' | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  const [inlineSaving, setInlineSaving] = useState(false);

  useEffect(() => {
    fetchMySheet();
  }, [fetchMySheet]);

  const isReadOnly = sheet ? READ_ONLY_STATUSES.includes(sheet.status) : false;
  const statusInfo = sheet ? STATUS_BADGE[sheet.status] : null;
  const totalWeightage = sheet?.goals.reduce((sum, g) => sum + Number(g.weightage), 0) ?? 0;
  const canSubmit = sheet?.status === 'DRAFT' || sheet?.status === 'REWORK';
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'MANAGER' || user?.role === 'ADMIN';
  // Managers and admins can edit even when sheet is in read-only status
  const canEdit = !isReadOnly || isManagerOrAdmin;

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
    setPendingSuggestion(null);
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

  async function handleBulkGoalsFromBot(goals: Array<{ thrustArea: ThrustArea; title: string; description: string; uomType: UomType; target: string; weightage: number }>) {
    if (!sheet || isReadOnly) return;
    setBulkCreating(true);
    setBulkSuccess(null);
    let created = 0;
    for (const g of goals) {
      if ((sheet.goals.length + created) >= 8) break;
      try {
        await createGoal({ goalSheetId: sheet.id, ...g });
        created++;
      } catch {
        // skip failed goals
      }
    }
    await fetchMySheet();
    setBulkCreating(false);
    if (created > 0) setBulkSuccess(`✅ ${created} goal${created > 1 ? 's' : ''} added from AI!`);
    setTimeout(() => setBulkSuccess(null), 4000);
  }

  async function handleSubmit() {
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      await api.post<GoalSheet>(`/goals/${sheet.id}/submit`);
      await fetchMySheet();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to submit goal sheet.';
      setSubmitError(message);
    } finally {
      setSubmitLoading(false);
    }
  }

  // ─── Inline editing handlers ──────────────────────────────────────────────

  function startInlineEdit(goalId: string, field: 'title' | 'description' | 'target' | 'weightage', currentValue: string | number) {
    if (!canEdit) return;
    const goal = sheet?.goals.find(g => g.id === goalId);
    // Allow managers/admins to edit locked goals, but not shared goals
    if (goal?.isLocked && !isManagerOrAdmin) return;
    if (goal?.isShared) return;
    
    setInlineEditingGoalId(goalId);
    setInlineEditingField(field);
    setInlineEditValue(String(currentValue));
  }

  function cancelInlineEdit() {
    setInlineEditingGoalId(null);
    setInlineEditingField(null);
    setInlineEditValue('');
  }

  async function saveInlineEdit() {
    if (!inlineEditingGoalId || !inlineEditingField || !sheet) return;
    
    const goal = sheet.goals.find(g => g.id === inlineEditingGoalId);
    if (!goal) return;

    const trimmedValue = inlineEditValue.trim();
    if (!trimmedValue) {
      cancelInlineEdit();
      return;
    }

    setInlineSaving(true);
    try {
      const updateData: GoalFormData = {
        goalSheetId: goal.goalSheetId,
        thrustArea: goal.thrustArea,
        title: inlineEditingField === 'title' ? trimmedValue : goal.title,
        description: inlineEditingField === 'description' ? trimmedValue : goal.description,
        uomType: goal.uomType,
        target: inlineEditingField === 'target' ? trimmedValue : goal.target,
        weightage: inlineEditingField === 'weightage' ? Number(trimmedValue) : Number(goal.weightage),
      };

      await updateGoal(goal.id, updateData);
      cancelInlineEdit();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to update goal.';
      alert(message);
    } finally {
      setInlineSaving(false);
    }
  }

  function handleInlineKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveInlineEdit();
    } else if (e.key === 'Escape') {
      cancelInlineEdit();
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !sheet) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading your goal sheet…
        </div>
      </div>
    );
  }

  if (error && !sheet) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-xl bg-red-50 p-6 text-red-700 shadow-sm max-w-sm w-full text-center">
          <p className="font-semibold">Error loading goal sheet</p>
          <p className="mt-1 text-sm">{error}</p>
          <button onClick={fetchMySheet} className="mt-3 text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Goal Sheet</h1>
          {sheet?.cycle && (
            <p className="mt-1 text-sm text-gray-500">
              Cycle: {sheet.cycle.year} — {sheet.cycle.phase.replace('_', ' ')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusInfo && (
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          )}
          {canSubmit && sheet && sheet.goals.length > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitLoading || Math.abs(totalWeightage - 100) > 0.01}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              title={Math.abs(totalWeightage - 100) > 0.01 ? 'Total weightage must equal 100%' : undefined}
            >
              {submitLoading ? 'Submitting…' : 'Submit for Approval'}
            </button>
          )}
          {canEdit && (
            <button
              onClick={openAddModal}
              disabled={loading || (sheet?.goals.length ?? 0) >= 8}
              className="rounded-lg bg-[#1f0c25] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#2d1238] focus:outline-none focus:ring-2 focus:ring-[#1f0c25] focus:ring-offset-2 disabled:opacity-50"
            >
              + Add Goal
            </button>
          )}
          {canEdit && geminiEnabled && sheet && (sheet.goals.length ?? 0) < 8 && (
            <AIGoalSuggestions
              department={user?.department ?? ''}
              role={user?.role ?? ''}
              existingGoalTitles={sheet.goals.map(g => g.title)}
              existingGoalCount={sheet.goals.length}
              existingWeightage={totalWeightage}
              onApply={(suggestion) => {
                setEditingGoal(undefined);
                setFormError(null);
                setModalOpen(true);
                // Pre-fill will be handled via the suggestion state
                setPendingSuggestion(suggestion);
              }}
            />
          )}
        </div>
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* Rework comment */}
      {sheet?.status === 'REWORK' && sheet.reworkComment && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Manager's feedback:</p>
          <p className="mt-1 text-sm text-amber-700">{sheet.reworkComment}</p>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats bar */}
      {sheet && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-[#1f0c25]">{sheet.goals.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Goals</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className={`text-2xl font-bold ${Math.abs(totalWeightage - 100) <= 0.01 ? 'text-emerald-600' : totalWeightage > 100 ? 'text-red-600' : 'text-amber-600'}`}>
              {totalWeightage.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Weightage</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-700">{8 - sheet.goals.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Slots Left</p>
          </div>
        </div>
      )}

      {/* Weightage bar */}
      {sheet && sheet.goals.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Weightage Distribution</h2>
          <WeightageBar
            goals={sheet.goals.map((g) => ({ title: g.title, weightage: Number(g.weightage) }))}
          />
        </div>
      )}

      {/* Goals — table on desktop, cards on mobile */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {!sheet || sheet.goals.length === 0 ? (
          <div className="py-16 text-center">
            <EmptyGoalsIllustration />
            <p className="mt-4 text-sm font-medium text-gray-600">No goals added yet</p>
            <p className="mt-1 text-xs text-gray-400">Add up to 8 goals with a total weightage of 100%</p>
            {canEdit && (
              <button
                onClick={openAddModal}
                className="mt-4 rounded-lg bg-[#1f0c25] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d1238] transition-colors"
              >
                Add your first goal
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Thrust Area</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">UoM Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Weightage</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    {canEdit && (
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sheet.goals.map((goal) => {
                    const isEditingThis = inlineEditingGoalId === goal.id;
                    const canInlineEdit = canEdit && !goal.isShared && (!goal.isLocked || isManagerOrAdmin);
                    
                    return (
                      <tr key={goal.id} className="hover:bg-gray-50 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{goal.thrustArea}</td>
                        
                        {/* Title - inline editable */}
                        <td className="px-4 py-3">
                          {isEditingThis && inlineEditingField === 'title' ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={inlineEditValue}
                                onChange={(e) => setInlineEditValue(e.target.value)}
                                onKeyDown={handleInlineKeyDown}
                                onBlur={saveInlineEdit}
                                autoFocus
                                disabled={inlineSaving}
                                className="flex-1 rounded border border-[#1f0c25]/30 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1f0c25]"
                              />
                              {inlineSaving && (
                                <svg className="h-4 w-4 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              )}
                            </div>
                          ) : (
                            <div 
                              className={`${canInlineEdit ? 'cursor-pointer hover:bg-[#1f0c25]/5 rounded px-2 py-1 -mx-2 -my-1' : ''}`}
                              onClick={() => canInlineEdit && startInlineEdit(goal.id, 'title', goal.title)}
                            >
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                                {goal.isShared && (
                                  <span className="inline-flex shrink-0 items-center rounded-full bg-[#2d1238]/10 px-2 py-0.5 text-xs font-medium text-[#2d1238]">
                                    Shared
                                  </span>
                                )}
                                {canInlineEdit && (
                                  <svg className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                )}
                              </div>
                              {isEditingThis && inlineEditingField === 'description' ? (
                                <textarea
                                  value={inlineEditValue}
                                  onChange={(e) => setInlineEditValue(e.target.value)}
                                  onKeyDown={handleInlineKeyDown}
                                  onBlur={saveInlineEdit}
                                  autoFocus
                                  disabled={inlineSaving}
                                  rows={2}
                                  className="mt-1 w-full rounded border border-indigo-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              ) : (
                                <p 
                                  className={`mt-0.5 text-xs text-gray-500 line-clamp-1 ${canInlineEdit ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    canInlineEdit && startInlineEdit(goal.id, 'description', goal.description);
                                  }}
                                >
                                  {goal.description}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{UOM_LABELS[goal.uomType] ?? goal.uomType}</td>
                        
                        {/* Target - inline editable */}
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {isEditingThis && inlineEditingField === 'target' ? (
                            <div className="flex items-center gap-2">
                              <input
                                type={goal.uomType === 'TIMELINE' ? 'date' : 'text'}
                                value={inlineEditValue}
                                onChange={(e) => setInlineEditValue(e.target.value)}
                                onKeyDown={handleInlineKeyDown}
                                onBlur={saveInlineEdit}
                                autoFocus
                                disabled={inlineSaving}
                                className="w-28 rounded border border-indigo-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              {inlineSaving && (
                                <svg className="h-4 w-4 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              )}
                            </div>
                          ) : (
                            <span 
                              className={`${canInlineEdit ? 'cursor-pointer hover:bg-indigo-50 rounded px-2 py-1 -mx-2 -my-1 inline-block' : ''}`}
                              onClick={() => canInlineEdit && startInlineEdit(goal.id, 'target', goal.target)}
                            >
                              {goal.target}
                            </span>
                          )}
                        </td>
                        
                        {/* Weightage - inline editable (even for shared goals, and for locked goals by managers/admins) */}
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {isEditingThis && inlineEditingField === 'weightage' ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                min="10"
                                max="100"
                                value={inlineEditValue}
                                onChange={(e) => setInlineEditValue(e.target.value)}
                                onKeyDown={handleInlineKeyDown}
                                onBlur={saveInlineEdit}
                                autoFocus
                                disabled={inlineSaving}
                                className="w-16 rounded border border-indigo-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <span className="text-xs">%</span>
                              {inlineSaving && (
                                <svg className="h-4 w-4 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              )}
                            </div>
                          ) : (
                            <span 
                              className={`${canEdit && (!goal.isLocked || isManagerOrAdmin) ? 'cursor-pointer hover:bg-indigo-50 rounded px-2 py-1 -mx-2 -my-1 inline-block' : ''}`}
                              onClick={() => canEdit && (!goal.isLocked || isManagerOrAdmin) && startInlineEdit(goal.id, 'weightage', goal.weightage)}
                            >
                              {Number(goal.weightage).toFixed(0)}%
                            </span>
                          )}
                        </td>
                        
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            goal.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                            goal.status === 'ON_TRACK' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {GOAL_STATUS_LABELS[goal.status] ?? goal.status}
                          </span>
                          {goal.isLocked && <span className="ml-1 text-xs text-gray-400" title="Locked" aria-label="Locked">🔒</span>}
                        </td>
                        {canEdit && (
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openEditModal(goal)}
                                disabled={(goal.isLocked && !isManagerOrAdmin) || loading}
                                className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeletingGoalId(goal.id)}
                                disabled={goal.isLocked || loading}
                                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {sheet.goals.map((goal) => (
                <div key={goal.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{goal.title}</p>
                        {goal.isShared && (
                          <span className="inline-flex items-center rounded-full bg-[#2d1238]/10 px-2 py-0.5 text-xs font-medium text-[#2d1238]">Shared</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{goal.description}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-[#1f0c25]">{Number(goal.weightage).toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="rounded bg-gray-100 px-2 py-0.5">{goal.thrustArea}</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5">{UOM_LABELS[goal.uomType] ?? goal.uomType}</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5">Target: {goal.target}</span>
                  </div>
                  {canEdit && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => openEditModal(goal)}
                        disabled={(goal.isLocked && !isManagerOrAdmin)}
                        className="rounded-md border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingGoalId(goal.id)}
                        disabled={goal.isLocked}
                        className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {sheet && (
        <p className="mt-2 text-right text-xs text-gray-400">{sheet.goals.length} / 8 goals</p>
      )}

      {/* Bulk creation success */}
      {bulkSuccess && (
        <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 animate-fade-in">
          {bulkSuccess}
        </div>
      )}
      {bulkCreating && (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700 flex items-center gap-2 animate-fade-in">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Creating goals from AI…
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 motion-safe:animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl motion-safe:animate-slide-up max-h-[90vh] overflow-y-auto">
            <h2 id="modal-title" className="mb-4 text-lg font-semibold text-gray-900">
              {editingGoal ? 'Edit Goal' : 'Add New Goal'}
            </h2>
            {formError && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}
            <GoalForm
              goal={editingGoal ?? (pendingSuggestion ? {
                id: '', goalSheetId: sheet?.id ?? '', isLocked: false, isShared: false, sharedFromId: null,
                status: 'NOT_STARTED', createdAt: '', updatedAt: '',
                ...pendingSuggestion,
              } as Goal : undefined)}
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 motion-safe:animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl motion-safe:animate-scale-in">
            <h2 id="delete-modal-title" className="mb-2 text-lg font-semibold text-gray-900">Delete Goal</h2>
            <p className="mb-5 text-sm text-gray-600">Are you sure you want to delete this goal? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingGoalId(null)}
                disabled={deleteLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingGoalId)}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Goal Fill Bot (page-level, with goal creation capability) ─── */}
      {canEdit && geminiEnabled && (
        <FloatingBot
          onFillGoals={handleBulkGoalsFromBot}
          currentGoalCount={sheet?.goals.length ?? 0}
          currentWeightage={totalWeightage}
        />
      )}
    </div>
  );
}

export default GoalSheetPage;
