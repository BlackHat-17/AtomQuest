import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';

interface Migration {
  migrationId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  startedAt: string;
  completedAt?: string;
  initiatedBy: {
    id: string;
    name: string;
    email: string;
  };
  totalRecords: number;
  migratedRecords: number;
  failedRecords: number;
  estimatedTimeRemaining?: number;
  dryRun: boolean;
  batchSize: number;
  errors?: MigrationError[];
}

interface MigrationError {
  entityType: string;
  entityId: string;
  error: string;
  suggestion: string;
}

interface MigrationProgress {
  migrationId: string;
  status: string;
  progress: {
    totalRecords: number;
    processedRecords: number;
    successfulRecords: number;
    failedRecords: number;
    currentBatch: number;
    totalBatches: number;
    percentComplete: number;
    estimatedTimeRemaining: number;
  };
  currentOperation: string;
  startedAt: string;
  lastUpdated: string;
}

interface LegacyDataSummary {
  totalCycles: number;
  totalGoalSheets: number;
  totalGoals: number;
  totalSharedGoals: number;
  dataIntegrityIssues: number;
  estimatedMigrationTime: string;
  readyForMigration: boolean;
  issues: Array<{
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    category: string;
    description: string;
    affectedRecords: number;
  }>;
}

const STATUS_COLORS = {
  PENDING: 'bg-gray-100 text-gray-700 border-gray-300',
  RUNNING: 'bg-blue-100 text-blue-700 border-blue-300',
  COMPLETED: 'bg-green-100 text-green-700 border-green-300',
  FAILED: 'bg-red-100 text-red-700 border-red-300',
  ROLLED_BACK: 'bg-yellow-100 text-yellow-700 border-yellow-300',
};

// ─── Start Migration Modal ────────────────────────────────────────────────────

interface StartMigrationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function StartMigrationModal({ open, onClose, onSuccess }: StartMigrationModalProps) {
  const [dryRun, setDryRun] = useState(true);
  const [batchSize, setBatchSize] = useState(100);
  const [skipValidation, setSkipValidation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDryRun(true);
      setBatchSize(100);
      setSkipValidation(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.post('/admin/migration/legacy-to-cycle-stage', {
        dryRun,
        batchSize,
        skipValidation,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to start migration');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Start Migration</h2>
        
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            <strong>Warning:</strong> This will migrate legacy data to the new cycle-stage architecture. 
            Always run a dry run first to validate the migration.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="dryRun" className="ml-2 block text-sm text-gray-700">
              Dry run (recommended for first attempt)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch Size</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value))}
              min="1"
              max="1000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of records to process in each batch (1-1000)
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="skipValidation"
              checked={skipValidation}
              onChange={(e) => setSkipValidation(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="skipValidation" className="ml-2 block text-sm text-gray-700">
              Skip validation (not recommended)
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
              {submitting ? 'Starting...' : dryRun ? 'Start Dry Run' : 'Start Migration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Migration Progress Component ─────────────────────────────────────────────

interface MigrationProgressProps {
  migration: Migration;
  onRefresh: () => void;
}

function MigrationProgressCard({ migration, onRefresh }: MigrationProgressProps) {
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [, setLoading] = useState(false);

  const fetchProgress = useCallback(async () => {
    if (migration.status !== 'RUNNING') return;

    try {
      setLoading(true);
      const response = await api.get(`/admin/migration/${migration.migrationId}/progress`);
      setProgress(response.data.data);
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    } finally {
      setLoading(false);
    }
  }, [migration.migrationId, migration.status]);

  useEffect(() => {
    fetchProgress();
    
    if (migration.status === 'RUNNING') {
      const interval = setInterval(fetchProgress, 2000); // Update every 2 seconds
      return () => clearInterval(interval);
    }
  }, [fetchProgress, migration.status]);

  const handleRollback = async () => {
    if (!confirm('Are you sure you want to rollback this migration? This action cannot be undone.')) {
      return;
    }

    const reason = prompt('Please provide a reason for the rollback:');
    if (!reason) return;

    try {
      await api.post(`/admin/migration/${migration.migrationId}/rollback`, { reason });
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to start rollback');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this migration?')) {
      return;
    }

    const reason = prompt('Please provide a reason for cancellation:');
    if (!reason) return;

    try {
      await api.post(`/admin/migration/${migration.migrationId}/cancel`, { reason });
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to cancel migration');
    }
  };

  const progressPercent = progress 
    ? progress.progress.percentComplete 
    : migration.totalRecords > 0 
    ? (migration.migratedRecords / migration.totalRecords) * 100 
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Migration {migration.migrationId.slice(-8)}
          </h3>
          <p className="text-sm text-gray-600">
            Started by {migration.initiatedBy.name} on {new Date(migration.startedAt).toLocaleString()}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
            STATUS_COLORS[migration.status]
          }`}>
            {migration.status}
          </span>
          {migration.dryRun && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              Dry Run
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{progressPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Total Records</p>
            <p className="font-medium">{migration.totalRecords.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Migrated</p>
            <p className="font-medium text-green-600">{migration.migratedRecords.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Failed</p>
            <p className="font-medium text-red-600">{migration.failedRecords.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Batch Size</p>
            <p className="font-medium">{migration.batchSize}</p>
          </div>
        </div>

        {progress && (
          <div className="text-sm text-gray-600">
            <p><span className="font-medium">Current Operation:</span> {progress.currentOperation}</p>
            <p><span className="font-medium">Batch:</span> {progress.progress.currentBatch} of {progress.progress.totalBatches}</p>
            {progress.progress.estimatedTimeRemaining > 0 && (
              <p><span className="font-medium">Est. Time Remaining:</span> {Math.round(progress.progress.estimatedTimeRemaining / 60)} minutes</p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <button
            onClick={onRefresh}
            className="rounded-lg bg-gray-100 text-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Refresh
          </button>
          
          {migration.status === 'RUNNING' && (
            <button
              onClick={handleCancel}
              className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          )}
          
          {(migration.status === 'COMPLETED' || migration.status === 'FAILED') && (
            <button
              onClick={handleRollback}
              className="rounded-lg bg-yellow-100 text-yellow-700 px-3 py-2 text-sm font-medium hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
            >
              Rollback
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MigrationManagementPage() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [legacyDataSummary, setLegacyDataSummary] = useState<LegacyDataSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [validatingData, setValidatingData] = useState(false);

  const fetchMigrations = useCallback(async () => {
    try {
      const response = await api.get('/admin/migration/status', {
        params: { limit: 20 }
      });
      setMigrations(response.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to fetch migrations');
    }
  }, []);

  const fetchLegacyDataSummary = useCallback(async () => {
    try {
      const response = await api.get('/admin/migration/legacy-data-summary');
      setLegacyDataSummary(response.data.data);
    } catch (err: any) {
      console.error('Failed to fetch legacy data summary:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchMigrations(), fetchLegacyDataSummary()]);
    setLoading(false);
  }, [fetchMigrations, fetchLegacyDataSummary]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleValidateData = async () => {
    setValidatingData(true);
    try {
      const response = await api.post('/admin/migration/validate-legacy-data', {
        sampleSize: 100
      });
      
      const validation = response.data.data;
      const message = `Validation completed:\n` +
        `Total Records: ${validation.totalRecords}\n` +
        `Valid Records: ${validation.validRecords}\n` +
        `Invalid Records: ${validation.invalidRecords}\n` +
        `Critical Issues: ${validation.criticalIssues.length}\n` +
        `Warnings: ${validation.warnings.length}`;
      
      alert(message);
      await fetchLegacyDataSummary();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to validate data');
    } finally {
      setValidatingData(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Migration Management</h1>
          <p className="text-gray-600">Manage legacy data migration to cycle-stage architecture</p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleValidateData}
            disabled={validatingData}
            className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {validatingData ? 'Validating...' : 'Validate Data'}
          </button>
          <button
            onClick={() => setShowStartModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Start Migration
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Legacy Data Summary */}
      {legacyDataSummary && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Legacy Data Summary</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{legacyDataSummary.totalCycles}</p>
              <p className="text-sm text-gray-600">Total Cycles</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{legacyDataSummary.totalGoalSheets}</p>
              <p className="text-sm text-gray-600">Goal Sheets</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{legacyDataSummary.totalGoals}</p>
              <p className="text-sm text-gray-600">Goals</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{legacyDataSummary.totalSharedGoals}</p>
              <p className="text-sm text-gray-600">Shared Goals</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Estimated Migration Time:</span> {legacyDataSummary.estimatedMigrationTime}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Data Integrity Issues:</span> {legacyDataSummary.dataIntegrityIssues}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                legacyDataSummary.readyForMigration ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className={`text-sm font-medium ${
                legacyDataSummary.readyForMigration ? 'text-green-700' : 'text-red-700'
              }`}>
                {legacyDataSummary.readyForMigration ? 'Ready for Migration' : 'Issues Found'}
              </span>
            </div>
          </div>

          {legacyDataSummary.issues.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Data Issues</h3>
              <div className="space-y-2">
                {legacyDataSummary.issues.slice(0, 5).map((issue, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      issue.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                      issue.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                      issue.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {issue.severity}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{issue.description}</p>
                      <p className="text-xs text-gray-500">{issue.affectedRecords} records affected</p>
                    </div>
                  </div>
                ))}
                {legacyDataSummary.issues.length > 5 && (
                  <p className="text-xs text-gray-500">
                    And {legacyDataSummary.issues.length - 5} more issues...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Migration History */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Migration History</h2>
        
        {migrations.length > 0 ? (
          <div className="space-y-4">
            {migrations.map((migration) => (
              <MigrationProgressCard
                key={migration.migrationId}
                migration={migration}
                onRefresh={fetchMigrations}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <p className="text-gray-500">No migrations found</p>
            <p className="text-sm text-gray-400 mt-1">Start your first migration to see it here</p>
          </div>
        )}
      </div>

      <StartMigrationModal
        open={showStartModal}
        onClose={() => setShowStartModal(false)}
        onSuccess={fetchMigrations}
      />
    </div>
  );
}