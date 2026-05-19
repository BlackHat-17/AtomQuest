import { useEffect, useState, useCallback } from 'react';
import { GoalForm } from '../../components/GoalForm';
import { WeightageBar } from '../../components/WeightageBar';
import { AIGoalSuggestions } from '../../components/AIGoalSuggestions';
import { FloatingBot } from '../../components/FloatingBot';
import { geminiEnabled } from '../../lib/gemini';
import api from '../../lib/api';
import type { Goal, GoalFormData } from '../../types';

interface Cycle {
  id: string;
  name: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  isActive: boolean;
}

interface CycleStage {
  id: string;
  stageName: 'Planning' | 'Approval' | 'Locked' | 'Execution' | 'Review';
  isActive: boolean;
  sequenceOrder: number;
}

interface UserPermissions {
  canCreateGoals: boolean;
  canEditGoals: boolean;
  canDeleteGoals: boolean;
  canUpdateAchievements: boolean;
  canApproveGoals: boolean;
  canPerformCheckIns: boolean;
}

interface VisibilityRules {
  canViewGoals: boolean;
  canViewAchievements: boolean;
  canViewScores: boolean;
  restrictedFields: string[];
}

interface CycleGoalData {
  cycle: Cycle;
  currentStage: CycleStage | null;
  userPermissions: UserPermissions;
  goals: Goal[];
  visibilityRules: VisibilityRules;
  totalGoals: number;
  maxGoalsAllowed: number;
}

const STAGE_COLORS = {
  Planning: 'bg-blue-100 text-blue-700 border-blue-300',
  Approval: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  Locked: 'bg-red-100 text-red-700 border-red-300',
  Execution: 'bg-green-100 text-green-700 border-green-300',
  Review: 'bg-purple-100 text-purple-700 border-purple-300',
};

const STAGE_DESCRIPTIONS = {
  Planning: 'Create and modify your goals for this cycle',
  Approval: 'Goals are under manager review - limited editing allowed',
  Locked: 'Goals are locked and cannot be modified',
  Execution: 'Track progress and update achievements',
  Review: 'Final evaluation and performance review period',
};

const UOM_LABELS: Record<string, string> = {
  NUMERIC_MIN: 'Numeric (Min)',
  NUMERIC_MAX: 'Numeric (Max)',
  TIMELINE: 'Timeline',
  ZERO: 'Zero',
};



// ─── Stage Info Component ─────────────────────────────────────────────────────

interface StageInfoProps {
  cycle: Cycle;
  currentStage: CycleStage | null;
  userPermissions: UserPermissions;
}

function StageInfo({ cycle, currentStage, userPermissions }: StageInfoProps) {
  if (!currentStage) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <p className="text-gray-600">No active stage for this cycle.</p>
      </div>
    );
  }

  const availableActions = [];
  if (userPermissions.canCreateGoals) availableActions.push('Create Goals');
  if (userPermissions.canEditGoals) availableActions.push('Edit Goals');
  if (userPermissions.canDeleteGoals) availableActions.push('Delete Goals');
  if (userPermissions.canUpdateAchievements) availableActions.push('Update Achievements');

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{cycle.name}</h2>
          <p className="text-sm text-gray-600">{cycle.quarter} {cycle.year}</p>
        </div>
        <div className="flex items-center gap-2">
          {cycle.isActive && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              Active Cycle
            </span>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Current Stage</h3>
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium border ${
              STAGE_COLORS[currentStage.stageName]
            }`}>
              {currentStage.stageName}
            </span>
            <span className="text-sm text-gray-500">
              Stage {currentStage.sequenceOrder} of 5
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {STAGE_DESCRIPTIONS[currentStage.stageName]}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Available Actions</h3>
          {availableActions.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {availableActions.map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                >
                  {action}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No actions available in this stage</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Achievement Update Modal ─────────────────────────────────────────────────

interface AchievementModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  goal: Goal | null;
}

function AchievementModal({ open, onClose, onSuccess, goal }: AchievementModalProps) {
  const [achievement, setAchievement] = useState('');
  const [score, setScore] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && goal) {
      setAchievement('');
      setScore('');
      setError(null);
    }
  }, [open, goal]);

  if (!open || !goal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!achievement.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.put(`/cycle-goals/goals/${goal.id}/achievement`, {
        achievement: achievement.trim(),
        score: score !== '' ? Number(score) : undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to update achievement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Update Achievement</h2>
        
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-700">{goal.title}</p>
          <p className="text-xs text-gray-500 mt-1">Target: {goal.target}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Achievement <span className="text-red-500">*</span>
            </label>
            <textarea
              value={achievement}
              onChange={(e) => setAchievement(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Describe what you have achieved..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Score (0-100)
            </label>
            <input
              type="number"
              value={score}
              onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
              min="0"
              max="100"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional self-assessment score"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !achievement.trim()}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {submitting ? 'Updating...' : 'Update Achievement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CycleAwareGoalSheetPage() {

  const [goalData, setGoalData] = useState<CycleGoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const [achievementModalOpen, setAchievementModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeCycle, setActiveCycle] = useState<Cycle | null>(null);

  const fetchGoalData = useCallback(async () => {
    try {
      setLoading(true);
      
      // First get the active cycle
      const activeCycleResponse = await api.get('/cycles/active');
      const cycle = activeCycleResponse.data.data;
      
      if (!cycle) {
        setError('No active cycle found');
        return;
      }

      setActiveCycle(cycle);

      // Then get goals for this cycle
      const goalsResponse = await api.get(`/cycle-goals/cycles/${cycle.id}/my-goals`);
      setGoalData(goalsResponse.data.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to fetch goal data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoalData();
  }, [fetchGoalData]);

  const handleCreateGoal = async (goalData: GoalFormData) => {
    if (!activeCycle) return;

    setFormLoading(true);
    setFormError(null);

    try {
      await api.post(`/cycle-goals/cycles/${activeCycle.id}/goals`, goalData);
      await fetchGoalData();
      setModalOpen(false);
      setEditingGoal(undefined);
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to create goal');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateGoal = async (goalId: string, updates: Partial<GoalFormData>) => {
    setFormLoading(true);
    setFormError(null);

    try {
      await api.put(`/cycle-goals/goals/${goalId}`, updates);
      await fetchGoalData();
      setModalOpen(false);
      setEditingGoal(undefined);
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to update goal');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    try {
      await api.delete(`/cycle-goals/goals/${goalId}`);
      await fetchGoalData();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to delete goal');
    }
  };

  const openAddModal = () => {
    setEditingGoal(undefined);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal);
    setFormError(null);
    setModalOpen(true);
  };

  const openAchievementModal = (goal: Goal) => {
    setSelectedGoal(goal);
    setAchievementModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !goalData) {
    return (
      <div className="text-center py-12">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 max-w-md mx-auto">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!goalData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No goal data available</p>
      </div>
    );
  }

  const { cycle, currentStage, userPermissions, goals, visibilityRules, totalGoals, maxGoalsAllowed } = goalData;
  const totalWeightage = goals.reduce((sum, g) => sum + Number(g.weightage), 0);
  const canAddGoals = userPermissions.canCreateGoals && totalGoals < maxGoalsAllowed;

  return (
    <div className="space-y-6">
      <StageInfo 
        cycle={cycle}
        currentStage={currentStage}
        userPermissions={userPermissions}
      />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Goals</h1>
          <p className="text-gray-600">
            {totalGoals} of {maxGoalsAllowed} goals • Total weightage: {totalWeightage}%
          </p>
        </div>
        
        {canAddGoals && (
          <button
            onClick={openAddModal}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Add Goal
          </button>
        )}
      </div>

      <WeightageBar goals={goals} />

      {goals.length > 0 ? (
        <div className="space-y-4">
          {goals.map((goal) => (
            <div key={goal.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{goal.title}</h3>
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                      {goal.thrustArea}
                    </span>
                    <span className="text-sm text-gray-500">
                      {goal.weightage}% • {UOM_LABELS[goal.uomType]}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-2">{goal.description}</p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Target:</span> {goal.target}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  {userPermissions.canEditGoals && (
                    <button
                      onClick={() => openEditModal(goal)}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      Edit
                    </button>
                  )}
                  {userPermissions.canDeleteGoals && (
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {visibilityRules.canViewAchievements && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Achievement</h4>
                      {/* Achievement data would come from separate API call */}
                      <p className="text-sm text-gray-500">No achievement recorded yet</p>
                    </div>
                    
                    {userPermissions.canUpdateAchievements && (
                      <button
                        onClick={() => openAchievementModal(goal)}
                        className="ml-4 rounded-lg bg-green-100 text-green-700 px-3 py-2 text-sm font-medium hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      >
                        Update Achievement
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="mx-auto h-32 w-32 text-gray-300 mb-4">
            <svg viewBox="0 0 200 160" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="30" y="30" width="140" height="100" rx="8" fill="currentColor" opacity="0.3" />
              <rect x="45" y="50" width="80" height="8" rx="4" fill="currentColor" opacity="0.5" />
              <rect x="45" y="66" width="110" height="6" rx="3" fill="currentColor" opacity="0.4" />
              <rect x="45" y="80" width="90" height="6" rx="3" fill="currentColor" opacity="0.4" />
              <rect x="45" y="94" width="60" height="6" rx="3" fill="currentColor" opacity="0.3" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No goals yet</h3>
          <p className="text-gray-600 mb-4">
            {canAddGoals 
              ? "Start by creating your first goal for this cycle."
              : "Goal creation is not available in the current stage."
            }
          </p>
          {canAddGoals && (
            <button
              onClick={openAddModal}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Create Your First Goal
            </button>
          )}
        </div>
      )}

      {geminiEnabled && canAddGoals && (
        <>
          <AIGoalSuggestions 
            department={cycle.name}
            role="EMPLOYEE"
            existingGoalTitles={goals.map(g => g.title)}
            onApply={() => {}}
          />
          <FloatingBot />
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-25" onClick={() => {
              setModalOpen(false);
              setEditingGoal(undefined);
              setFormError(null);
            }} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {editingGoal ? 'Edit Goal' : 'Create New Goal'}
                  </h2>
                  <button
                    onClick={() => {
                      setModalOpen(false);
                      setEditingGoal(undefined);
                      setFormError(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {formError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{formError}</p>
                  </div>
                )}
                <GoalForm
                  goal={editingGoal}
                  goalSheetId={activeCycle?.id}
                  onSubmit={editingGoal ? 
                    (data) => handleUpdateGoal(editingGoal.id, data) : 
                    handleCreateGoal
                  }
                  onCancel={() => {
                    setModalOpen(false);
                    setEditingGoal(undefined);
                    setFormError(null);
                  }}
                  loading={formLoading}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <AchievementModal
        open={achievementModalOpen}
        onClose={() => {
          setAchievementModalOpen(false);
          setSelectedGoal(null);
        }}
        onSuccess={fetchGoalData}
        goal={selectedGoal}
      />
    </div>
  );
}