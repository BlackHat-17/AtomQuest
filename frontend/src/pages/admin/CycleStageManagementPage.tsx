import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

interface Cycle {
  id: string;
  name: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  isActive: boolean;
  createdAt: string;
  stages: CycleStage[];
  currentStage?: CycleStage;
}

interface CycleStage {
  id: string;
  stageName: 'Planning' | 'Approval' | 'Locked' | 'Execution' | 'Review';
  isActive: boolean;
  sequenceOrder: number;
  startDate?: string;
  endDate?: string;
}

interface CreateCycleData {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  isActive: boolean;
}

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const STAGE_COLORS = {
  Planning: 'bg-blue-100 text-blue-700 border-blue-300',
  Approval: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  Locked: 'bg-red-100 text-red-700 border-red-300',
  Execution: 'bg-green-100 text-green-700 border-green-300',
  Review: 'bg-purple-100 text-purple-700 border-purple-300',
};

// ─── Create Cycle Modal ───────────────────────────────────────────────────────

interface CreateCycleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateCycleModal({ open, onClose, onSuccess }: CreateCycleModalProps) {
  const [quarter, setQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [year, setYear] = useState(new Date().getFullYear());
  const [isActive, setIsActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuarter('Q1');
      setYear(new Date().getFullYear());
      setIsActive(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.post('/admin/cycles', { quarter, year, isActive });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create cycle');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create New Cycle</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quarter</label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value as typeof quarter)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            >
              {QUARTERS.map(q => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              min="2000"
              max="2100"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
              Set as active cycle
            </label>
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
              disabled={submitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Cycle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stage Transition Modal ───────────────────────────────────────────────────

interface StageTransitionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cycle: Cycle | null;
}

function StageTransitionModal({ open, onClose, onSuccess, cycle }: StageTransitionModalProps) {
  const [reason, setReason] = useState('');
  const [adminOverride, setAdminOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowedTransitions, setAllowedTransitions] = useState<string[]>([]);

  useEffect(() => {
    if (open && cycle) {
      setReason('');
      setAdminOverride(false);
      setError(null);
      fetchAllowedTransitions();
    }
  }, [open, cycle]);

  const fetchAllowedTransitions = async () => {
    if (!cycle) return;
    
    try {
      const response = await api.get(`/cycles/${cycle.id}/current-stage`);
      setAllowedTransitions(response.data.data.allowedTransitions || []);
    } catch (err) {
      console.error('Failed to fetch allowed transitions:', err);
    }
  };

  if (!open || !cycle) return null;

  const currentStage = cycle.currentStage;
  const nextStage = cycle.stages.find(s => s.sequenceOrder === (currentStage?.sequenceOrder || 0) + 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextStage) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.put(`/admin/cycles/${cycle.id}/stages/${nextStage.id}/transition`, {
        reason: reason.trim() || undefined,
        adminOverride,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to transition stage');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Stage Transition</h2>
        
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Current Stage:</span> {currentStage?.stageName || 'None'}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Next Stage:</span> {nextStage?.stageName || 'None available'}
          </p>
        </div>

        {!nextStage ? (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">No next stage available for transition.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (Optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter reason for stage transition..."
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="adminOverride"
                checked={adminOverride}
                onChange={(e) => setAdminOverride(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="adminOverride" className="ml-2 block text-sm text-gray-700">
                Admin override (bypass validation)
              </label>
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
                disabled={submitting}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {submitting ? 'Transitioning...' : 'Transition Stage'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CycleStageManagementPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const fetchCycles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cycles', {
        params: { limit: 100 }
      });
      setCycles(response.data.data || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to fetch cycles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  const handleActivateCycle = async (cycleId: string, isActive: boolean) => {
    try {
      await api.put(`/admin/cycles/${cycleId}/activate`, { isActive });
      await fetchCycles();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to update cycle');
    }
  };

  const handleDeleteCycle = async (cycleId: string) => {
    if (!confirm('Are you sure you want to delete this cycle? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/admin/cycles/${cycleId}`);
      await fetchCycles();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to delete cycle');
    }
  };

  const handleStageTransition = (cycle: Cycle) => {
    setSelectedCycle(cycle);
    setShowTransitionModal(true);
  };

  const filteredCycles = cycles.filter(cycle => {
    if (filter === 'active') return cycle.isActive;
    if (filter === 'inactive') return !cycle.isActive;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cycle & Stage Management</h1>
          <p className="text-gray-600">Manage goal cycles and stage transitions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Create Cycle
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-lg text-sm font-medium ${
            filter === 'all'
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Cycles
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`px-3 py-1 rounded-lg text-sm font-medium ${
            filter === 'active'
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter('inactive')}
          className={`px-3 py-1 rounded-lg text-sm font-medium ${
            filter === 'inactive'
              ? 'bg-gray-200 text-gray-700 border border-gray-400'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Inactive
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredCycles.map((cycle) => (
          <div key={cycle.id} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{cycle.name}</h3>
                <p className="text-sm text-gray-600">
                  {cycle.quarter} {cycle.year}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cycle.isActive && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    Active
                  </span>
                )}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Current Stage:</p>
              {cycle.currentStage ? (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                  STAGE_COLORS[cycle.currentStage.stageName]
                }`}>
                  {cycle.currentStage.stageName}
                </span>
              ) : (
                <span className="text-sm text-gray-500">No active stage</span>
              )}
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Stages:</p>
              <div className="flex flex-wrap gap-1">
                {cycle.stages.map((stage) => (
                  <span
                    key={stage.id}
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border ${
                      stage.isActive
                        ? STAGE_COLORS[stage.stageName]
                        : 'bg-gray-100 text-gray-600 border-gray-300'
                    }`}
                  >
                    {stage.sequenceOrder}. {stage.stageName}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleActivateCycle(cycle.id, !cycle.isActive)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  cycle.isActive
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500'
                    : 'bg-green-100 text-green-700 hover:bg-green-200 focus:ring-green-500'
                }`}
              >
                {cycle.isActive ? 'Deactivate' : 'Activate'}
              </button>
              
              {cycle.isActive && (
                <button
                  onClick={() => handleStageTransition(cycle)}
                  className="flex-1 rounded-lg bg-blue-100 text-blue-700 px-3 py-2 text-sm font-medium hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Transition
                </button>
              )}
              
              <button
                onClick={() => handleDeleteCycle(cycle.id)}
                className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredCycles.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No cycles found.</p>
        </div>
      )}

      <CreateCycleModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchCycles}
      />

      <StageTransitionModal
        open={showTransitionModal}
        onClose={() => setShowTransitionModal(false)}
        onSuccess={fetchCycles}
        cycle={selectedCycle}
      />
    </div>
  );
}