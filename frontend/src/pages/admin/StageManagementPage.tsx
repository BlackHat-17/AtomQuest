import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';

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
  startDate?: string;
  endDate?: string;
}

interface StageTransition {
  id: string;
  fromStage?: {
    id: string;
    stageName: string;
  };
  toStage: {
    id: string;
    stageName: string;
  };
  initiatedBy: {
    id: string;
    name: string;
    email: string;
  };
  reason?: string;
  isAdminOverride: boolean;
  transitionTimestamp: string;
}

interface StageValidation {
  canTransition: boolean;
  blockers: string[];
  warnings: string[];
}

const STAGE_COLORS = {
  Planning: 'bg-blue-100 text-blue-700 border-blue-300',
  Approval: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  Locked: 'bg-red-100 text-red-700 border-red-300',
  Execution: 'bg-green-100 text-green-700 border-green-300',
  Review: 'bg-purple-100 text-purple-700 border-purple-300',
};

const STAGE_DESCRIPTIONS = {
  Planning: 'Goal setting and initial planning phase',
  Approval: 'Manager review and approval of goals',
  Locked: 'Goals are locked and cannot be modified',
  Execution: 'Active goal tracking and achievement updates',
  Review: 'Final evaluation and performance review',
};

// ─── Admin Override Modal ─────────────────────────────────────────────────────

interface AdminOverrideModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cycleId: string;
  availableStages: CycleStage[];
}

function AdminOverrideModal({ open, onClose, onSuccess, cycleId, availableStages }: AdminOverrideModalProps) {
  const [targetStage, setTargetStage] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTargetStage('');
      setReason('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStage || !reason.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const selectedStage = availableStages.find(s => s.stageName === targetStage);
      if (!selectedStage) throw new Error('Invalid stage selected');

      await api.post(`/admin/cycles/${cycleId}/stages/${selectedStage.id}/override`, {
        reason: reason.trim(),
        targetStage,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to perform admin override');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Admin Override</h2>
        
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            <strong>Warning:</strong> Admin override bypasses normal stage validation and will be logged for audit purposes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Stage</label>
            <select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            >
              <option value="">Select target stage...</option>
              {availableStages.map(stage => (
                <option key={stage.id} value={stage.stageName}>
                  {stage.sequenceOrder}. {stage.stageName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter detailed reason for admin override..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              This reason will be permanently logged for audit purposes.
            </p>
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
              disabled={submitting || !targetStage || !reason.trim()}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {submitting ? 'Overriding...' : 'Override Stage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stage Timeline Component ─────────────────────────────────────────────────

interface StageTimelineProps {
  stages: CycleStage[];
  currentStage?: CycleStage;
}

function StageTimeline({ stages, currentStage }: StageTimelineProps) {
  const sortedStages = [...stages].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Stage Timeline</h3>
      
      <div className="space-y-4">
        {sortedStages.map((stage, index) => {
          const isActive = stage.isActive;
          const isPast = currentStage ? stage.sequenceOrder < currentStage.sequenceOrder : false;
          const isFuture = currentStage ? stage.sequenceOrder > currentStage.sequenceOrder : true;

          return (
            <div key={stage.id} className="flex items-start">
              <div className="flex flex-col items-center mr-4">
                <div className={`w-4 h-4 rounded-full border-2 ${
                  isActive 
                    ? 'bg-blue-600 border-blue-600' 
                    : isPast 
                    ? 'bg-green-600 border-green-600'
                    : 'bg-gray-200 border-gray-300'
                }`} />
                {index < sortedStages.length - 1 && (
                  <div className={`w-0.5 h-8 mt-2 ${
                    isPast ? 'bg-green-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className={`text-sm font-medium ${
                      isActive ? 'text-blue-900' : isPast ? 'text-green-900' : 'text-gray-500'
                    }`}>
                      {stage.sequenceOrder}. {stage.stageName}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {STAGE_DESCRIPTIONS[stage.stageName]}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        Current
                      </span>
                    )}
                    {isPast && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        Completed
                      </span>
                    )}
                    {isFuture && !isActive && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
                
                {(stage.startDate || stage.endDate) && (
                  <div className="mt-2 text-xs text-gray-500">
                    {stage.startDate && (
                      <span>Started: {new Date(stage.startDate).toLocaleDateString()}</span>
                    )}
                    {stage.startDate && stage.endDate && <span className="mx-2">•</span>}
                    {stage.endDate && (
                      <span>Ended: {new Date(stage.endDate).toLocaleDateString()}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StageManagementPage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const navigate = useNavigate();
  
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [stages, setStages] = useState<CycleStage[]>([]);
  const [currentStage, setCurrentStage] = useState<CycleStage | null>(null);
  const [stageHistory, setStageHistory] = useState<StageTransition[]>([]);
  const [stageValidation, setStageValidation] = useState<StageValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  const fetchStageData = useCallback(async () => {
    if (!cycleId) return;

    try {
      setLoading(true);
      
      const [cycleResponse, stagesResponse, historyResponse] = await Promise.all([
        api.get(`/cycles/${cycleId}`),
        api.get(`/cycles/${cycleId}/stages`),
        api.get(`/cycles/${cycleId}/stage-history`),
      ]);

      setCycle(cycleResponse.data.data);
      setStages(stagesResponse.data.data.stages || []);
      setCurrentStage(stagesResponse.data.data.currentStage);
      setStageHistory(historyResponse.data.data.history || []);

      // Fetch validation if there's a current stage
      if (stagesResponse.data.data.currentStage) {
        try {
          const validationResponse = await api.get(`/admin/cycles/${cycleId}/stage-validation`);
          setStageValidation(validationResponse.data.data.validationResults);
        } catch (err) {
          console.error('Failed to fetch stage validation:', err);
        }
      }

      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to fetch stage data');
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchStageData();
  }, [fetchStageData]);

  const handleStageTransition = async () => {
    if (!currentStage || !cycleId) return;

    const nextStage = stages.find(s => s.sequenceOrder === currentStage.sequenceOrder + 1);
    if (!nextStage) return;

    try {
      await api.put(`/admin/cycles/${cycleId}/stages/${nextStage.id}/transition`, {
        reason: 'Normal stage progression',
      });
      await fetchStageData();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to transition stage');
    }
  };

  if (!cycleId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Invalid cycle ID</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Cycle not found</p>
        <button
          onClick={() => navigate('/admin/cycles')}
          className="mt-4 text-blue-600 hover:text-blue-700"
        >
          Back to Cycles
        </button>
      </div>
    );
  }

  const nextStage = currentStage ? stages.find(s => s.sequenceOrder === currentStage.sequenceOrder + 1) : null;
  const canTransition = stageValidation?.canTransition && nextStage;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/admin/cycles')}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-2"
          >
            ← Back to Cycles
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Stage Management</h1>
          <p className="text-gray-600">{cycle.name} - Stage Transitions & Timeline</p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={() => setShowOverrideModal(true)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Admin Override
          </button>
          
          {canTransition && (
            <button
              onClick={handleStageTransition}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Transition to {nextStage?.stageName}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <StageTimeline stages={stages} currentStage={currentStage || undefined} />
        
        <div className="space-y-6">
          {/* Current Stage Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Stage</h3>
            
            {currentStage ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium border ${
                    STAGE_COLORS[currentStage.stageName]
                  }`}>
                    {currentStage.stageName}
                  </span>
                  <span className="text-sm text-gray-500">
                    Stage {currentStage.sequenceOrder} of {stages.length}
                  </span>
                </div>
                
                <p className="text-sm text-gray-600">
                  {STAGE_DESCRIPTIONS[currentStage.stageName]}
                </p>
                
                {currentStage.startDate && (
                  <p className="text-sm text-gray-500">
                    Started: {new Date(currentStage.startDate).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No active stage</p>
            )}
          </div>

          {/* Stage Validation */}
          {stageValidation && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Stage Validation</h3>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    stageValidation.canTransition ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className={`text-sm font-medium ${
                    stageValidation.canTransition ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {stageValidation.canTransition ? 'Ready for transition' : 'Cannot transition'}
                  </span>
                </div>
                
                {stageValidation.blockers.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-red-700 mb-1">Blockers:</p>
                    <ul className="text-sm text-red-600 space-y-1">
                      {stageValidation.blockers.map((blocker, index) => (
                        <li key={index}>• {blocker}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {stageValidation.warnings.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-yellow-700 mb-1">Warnings:</p>
                    <ul className="text-sm text-yellow-600 space-y-1">
                      {stageValidation.warnings.map((warning, index) => (
                        <li key={index}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stage History */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Stage History</h3>
        
        {stageHistory.length > 0 ? (
          <div className="space-y-4">
            {stageHistory.map((transition) => (
              <div key={transition.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {transition.fromStage?.stageName || 'Initial'} → {transition.toStage.stageName}
                    </span>
                    {transition.isAdminOverride && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                        Admin Override
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-2">
                    By {transition.initiatedBy.name} ({transition.initiatedBy.email})
                  </p>
                  
                  {transition.reason && (
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-medium">Reason:</span> {transition.reason}
                    </p>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    {new Date(transition.transitionTimestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No stage transitions yet</p>
        )}
      </div>

      <AdminOverrideModal
        open={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        onSuccess={fetchStageData}
        cycleId={cycleId}
        availableStages={stages}
      />
    </div>
  );
}