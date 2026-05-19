import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/authorize.js';
import { legacyMigrationService } from '../services/legacyMigrationService.js';
import { migrationRollbackService } from '../services/migrationRollbackService.js';
import { auditLogService } from '../services/auditLogService.js';

export const migrationRouter = Router();

// All migration endpoints require admin access
migrationRouter.use(requireAdmin);

// ─── Validation schemas ───────────────────────────────────────────────────────

const migrationRequestSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  batchSize: z.number().int().min(1).max(1000).optional().default(100),
  skipValidation: z.boolean().optional().default(false),
  targetCycles: z.array(z.string().uuid()).optional(), // Specific cycles to migrate
});

const rollbackRequestSchema = z.object({
  migrationId: z.string().uuid('Invalid migration ID'),
  reason: z.string().min(1, 'Reason is required for rollback'),
  force: z.boolean().optional().default(false),
});

const migrationStatusQuerySchema = z.object({
  migrationId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK']).optional(),
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10),
});

// ─── POST /api/admin/migration/legacy-to-cycle-stage ─────────────────────────

migrationRouter.post('/legacy-to-cycle-stage', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const parsed = migrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ 
        error: 'Invalid request data',
        details: parsed.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { dryRun, batchSize, skipValidation, targetCycles } = parsed.data;

    // Start migration process
    const migrationResult = await legacyMigrationService.migrateLegacyData({
      dryRun,
      batchSize,
      skipValidation,
      targetCycles,
      initiatedBy: req.user.id,
    });

    // Log the migration initiation
    await auditLogService.logAction({
      action: dryRun ? 'MIGRATION_DRY_RUN_STARTED' : 'MIGRATION_STARTED',
      entityType: 'Migration',
      entityId: migrationResult.migrationId,
      userId: req.user.id,
      details: {
        dryRun,
        batchSize,
        skipValidation,
        targetCycles: targetCycles?.length || 'all',
        estimatedRecords: migrationResult.estimatedRecords,
      },
    });

    res.status(202).json({
      success: true,
      data: migrationResult,
      message: dryRun 
        ? 'Dry run migration started successfully' 
        : 'Migration started successfully',
    });
  } catch (error) {
    console.error('Error starting migration:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to start migration',
    });
  }
});

// ─── GET /api/admin/migration/status ─────────────────────────────────────────

migrationRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const parsed = migrationStatusQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ 
        error: 'Invalid query parameters',
        details: parsed.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { migrationId, status, page, limit } = parsed.data;

    if (migrationId) {
      // Get specific migration status
      const migrationStatus = await legacyMigrationService.getMigrationStatus(migrationId);
      if (!migrationStatus) {
        res.status(404).json({ error: 'Migration not found' });
        return;
      }

      res.json({
        success: true,
        data: migrationStatus,
      });
    } else {
      // Get all migrations with filtering and pagination
      const migrations = await legacyMigrationService.getMigrations({
        status,
        page,
        limit,
      });

      res.json({
        success: true,
        data: migrations.migrations,
        pagination: migrations.pagination,
      });
    }
  } catch (error) {
    console.error('Error fetching migration status:', error);
    res.status(500).json({
      error: 'Failed to fetch migration status',
    });
  }
});

// ─── GET /api/admin/migration/:migrationId/progress ──────────────────────────

migrationRouter.get('/:migrationId/progress', async (req: Request, res: Response) => {
  try {
    const { migrationId } = req.params;

    if (!migrationId || typeof migrationId !== 'string') {
      res.status(400).json({ error: 'Invalid migration ID' });
      return;
    }

    const progress = await legacyMigrationService.getMigrationProgress(migrationId);
    if (!progress) {
      res.status(404).json({ error: 'Migration not found' });
      return;
    }

    res.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    console.error('Error fetching migration progress:', error);
    res.status(500).json({
      error: 'Failed to fetch migration progress',
    });
  }
});

// ─── GET /api/admin/migration/:migrationId/errors ────────────────────────────

migrationRouter.get('/:migrationId/errors', async (req: Request, res: Response) => {
  try {
    const { migrationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    if (!migrationId || typeof migrationId !== 'string') {
      res.status(400).json({ error: 'Invalid migration ID' });
      return;
    }

    const pageNum = typeof page === 'string' ? parseInt(page, 10) : 1;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : 50;

    const errors = await legacyMigrationService.getMigrationErrors(migrationId, {
      page: pageNum,
      limit: limitNum,
    });

    res.json({
      success: true,
      data: errors.errors,
      pagination: errors.pagination,
    });
  } catch (error) {
    console.error('Error fetching migration errors:', error);
    res.status(500).json({
      error: 'Failed to fetch migration errors',
    });
  }
});

// ─── POST /api/admin/migration/:migrationId/rollback ─────────────────────────

migrationRouter.post('/:migrationId/rollback', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { migrationId } = req.params;
    const parsed = rollbackRequestSchema.safeParse({ ...req.body, migrationId });

    if (!parsed.success) {
      res.status(400).json({ 
        error: 'Invalid request data',
        details: parsed.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const { reason, force } = parsed.data;

    // Check if migration can be rolled back
    const migrationStatus = await legacyMigrationService.getMigrationStatus(migrationId);
    if (!migrationStatus) {
      res.status(404).json({ error: 'Migration not found' });
      return;
    }

    if (migrationStatus.status === 'RUNNING' && !force) {
      res.status(400).json({ 
        error: 'Cannot rollback running migration without force flag',
        suggestion: 'Wait for migration to complete or use force=true',
      });
      return;
    }

    // Start rollback process
    const rollbackResult = await migrationRollbackService.rollbackMigration({
      migrationId,
      reason,
      force,
      initiatedBy: req.user.id,
    });

    // Log the rollback initiation
    await auditLogService.logAction({
      action: 'MIGRATION_ROLLBACK_STARTED',
      entityType: 'Migration',
      entityId: migrationId,
      userId: req.user.id,
      details: {
        reason,
        force,
        originalMigrationStatus: migrationStatus.status,
        rollbackId: rollbackResult.rollbackId,
      },
    });

    res.status(202).json({
      success: true,
      data: rollbackResult,
      message: 'Migration rollback started successfully',
    });
  } catch (error) {
    console.error('Error starting rollback:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to start rollback',
    });
  }
});

// ─── GET /api/admin/migration/:migrationId/rollback-status ───────────────────

migrationRouter.get('/:migrationId/rollback-status', async (req: Request, res: Response) => {
  try {
    const { migrationId } = req.params;

    if (!migrationId || typeof migrationId !== 'string') {
      res.status(400).json({ error: 'Invalid migration ID' });
      return;
    }

    const rollbackStatus = await migrationRollbackService.getRollbackStatus(migrationId);
    if (!rollbackStatus) {
      res.status(404).json({ error: 'No rollback found for this migration' });
      return;
    }

    res.json({
      success: true,
      data: rollbackStatus,
    });
  } catch (error) {
    console.error('Error fetching rollback status:', error);
    res.status(500).json({
      error: 'Failed to fetch rollback status',
    });
  }
});

// ─── POST /api/admin/migration/validate-legacy-data ──────────────────────────

migrationRouter.post('/validate-legacy-data', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { sampleSize = 100 } = req.body;

    if (typeof sampleSize !== 'number' || sampleSize < 1 || sampleSize > 1000) {
      res.status(400).json({ error: 'Sample size must be between 1 and 1000' });
      return;
    }

    // Validate legacy data structure and integrity
    const validationResult = await legacyMigrationService.validateLegacyData(sampleSize);

    // Log the validation
    await auditLogService.logAction({
      action: 'LEGACY_DATA_VALIDATION',
      entityType: 'Migration',
      entityId: 'validation',
      userId: req.user.id,
      details: {
        sampleSize,
        totalRecords: validationResult.totalRecords,
        validRecords: validationResult.validRecords,
        invalidRecords: validationResult.invalidRecords,
        criticalIssues: validationResult.criticalIssues.length,
        warnings: validationResult.warnings.length,
      },
    });

    res.json({
      success: true,
      data: validationResult,
      message: `Validated ${validationResult.validRecords}/${validationResult.totalRecords} records`,
    });
  } catch (error) {
    console.error('Error validating legacy data:', error);
    res.status(500).json({
      error: 'Failed to validate legacy data',
    });
  }
});

// ─── GET /api/admin/migration/legacy-data-summary ────────────────────────────

migrationRouter.get('/legacy-data-summary', async (req: Request, res: Response) => {
  try {
    // Get summary of legacy data that needs migration
    const summary = await legacyMigrationService.getLegacyDataSummary();

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching legacy data summary:', error);
    res.status(500).json({
      error: 'Failed to fetch legacy data summary',
    });
  }
});

// ─── DELETE /api/admin/migration/:migrationId ────────────────────────────────

migrationRouter.delete('/:migrationId', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { migrationId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'Reason is required for migration deletion' });
      return;
    }

    if (!migrationId || typeof migrationId !== 'string') {
      res.status(400).json({ error: 'Invalid migration ID' });
      return;
    }

    // Check migration status before deletion
    const migrationStatus = await legacyMigrationService.getMigrationStatus(migrationId);
    if (!migrationStatus) {
      res.status(404).json({ error: 'Migration not found' });
      return;
    }

    if (migrationStatus.status === 'RUNNING') {
      res.status(400).json({ 
        error: 'Cannot delete running migration',
        suggestion: 'Wait for migration to complete or cancel it first',
      });
      return;
    }

    // Delete migration record
    await legacyMigrationService.deleteMigration(migrationId, req.user.id, reason.trim());

    // Log the deletion
    await auditLogService.logAction({
      action: 'MIGRATION_DELETED',
      entityType: 'Migration',
      entityId: migrationId,
      userId: req.user.id,
      details: {
        reason: reason.trim(),
        originalStatus: migrationStatus.status,
        migratedRecords: migrationStatus.migratedRecords,
        totalRecords: migrationStatus.totalRecords,
      },
    });

    res.json({
      success: true,
      message: 'Migration record deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting migration:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to delete migration',
    });
  }
});

// ─── POST /api/admin/migration/:migrationId/cancel ───────────────────────────

migrationRouter.post('/:migrationId/cancel', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { migrationId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'Reason is required for migration cancellation' });
      return;
    }

    if (!migrationId || typeof migrationId !== 'string') {
      res.status(400).json({ error: 'Invalid migration ID' });
      return;
    }

    // Cancel the migration
    const cancelResult = await legacyMigrationService.cancelMigration(migrationId, req.user.id, reason.trim());

    // Log the cancellation
    await auditLogService.logAction({
      action: 'MIGRATION_CANCELLED',
      entityType: 'Migration',
      entityId: migrationId,
      userId: req.user.id,
      details: {
        reason: reason.trim(),
        migratedRecords: cancelResult.migratedRecords,
        totalRecords: cancelResult.totalRecords,
        completionPercentage: cancelResult.completionPercentage,
      },
    });

    res.json({
      success: true,
      data: cancelResult,
      message: 'Migration cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling migration:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to cancel migration',
    });
  }
});