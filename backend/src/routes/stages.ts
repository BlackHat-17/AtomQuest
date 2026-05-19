import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { StageName } from '@prisma/client';
import { requireAdmin } from '../middleware/authorize.js';
import { authenticate } from '../middleware/authenticate.js';
import { stageManagerService } from '../services/stageManagerService.js';
import { auditLogService } from '../services/auditLogService.js';
import { cycleManagerService } from '../services/cycleManagerService.js';

export const stagesRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const stageTransitionSchema = z.object({
  reason: z.string().optional(),
  adminOverride: z.boolean().optional().default(false),
});

const adminOverrideSchema = z.object({
  reason: z.string().min(1, 'Reason is required for admin override'),
  targetStage: z.enum(['Planning', 'Approval', 'Locked', 'Execution', 'Review']),
});

// ─── PUT /api/admin/cycles/:id/stages/:stageId/transition ─────────────────────

stagesRouter.put('/admin/cycles/:cycleId/stages/:stageId/transition', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { cycleId, stageId } = req.params;
    const parsed = stageTransitionSchema.safeParse(req.body);

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

    const { reason, adminOverride } = parsed.data;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get current stage before transition
    const currentStage = await stageManagerService.getCurrentStage(cycleId);

    // Perform stage transition
    const transitionResult = await stageManagerService.transitionStage(
      cycleId,
      stageId,
      {
        reason,
        adminOverride,
        initiatedBy: req.user.id,
      }
    );

    if (!transitionResult.success) {
      res.status(400).json({
        error: transitionResult.error,
        suggestions: transitionResult.suggestions,
      });
      return;
    }

    // Log the stage transition
    await auditLogService.logAction({
      action: adminOverride ? 'STAGE_ADMIN_OVERRIDE' : 'STAGE_TRANSITION',
      entityType: 'CycleStage',
      entityId: stageId,
      userId: req.user.id,
      details: {
        cycleId,
        cycleName: cycle.name,
        fromStage: currentStage?.stageName,
        toStage: transitionResult.newStage.stageName,
        reason,
        adminOverride,
        transitionId: transitionResult.transitionId,
      },
    });

    res.json({
      success: true,
      data: {
        transition: transitionResult,
        cycle: {
          id: cycle.id,
          name: cycle.name,
          currentStage: transitionResult.newStage,
        },
      },
      message: `Stage transitioned to ${transitionResult.newStage.stageName}${adminOverride ? ' (Admin Override)' : ''}`,
    });
  } catch (error) {
    console.error('Error transitioning stage:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to transition stage',
    });
  }
});

// ─── GET /api/cycles/:id/stages ──────────────────────────────────────────────

stagesRouter.get('/cycles/:cycleId/stages', authenticate, async (req: Request, res: Response) => {
  try {
    const { cycleId } = req.params;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get all stages for the cycle
    const stages = await stageManagerService.getCycleStages(cycleId);

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(cycleId);

    // Get allowed transitions for current stage
    const allowedTransitions = currentStage 
      ? await stageManagerService.getAllowedTransitions(cycleId, currentStage.id)
      : [];

    res.json({
      success: true,
      data: {
        cycleId,
        cycleName: cycle.name,
        stages,
        currentStage,
        allowedTransitions,
      },
    });
  } catch (error) {
    console.error('Error fetching cycle stages:', error);
    res.status(500).json({
      error: 'Failed to fetch cycle stages',
    });
  }
});

// ─── GET /api/cycles/:id/current-stage ───────────────────────────────────────

stagesRouter.get('/cycles/:cycleId/current-stage', authenticate, async (req: Request, res: Response) => {
  try {
    const { cycleId } = req.params;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    if (!currentStage) {
      res.status(404).json({ error: 'No active stage found for this cycle' });
      return;
    }

    // Get allowed transitions
    const allowedTransitions = await stageManagerService.getAllowedTransitions(cycleId, currentStage.id);

    // Get user permissions for current stage
    const userPermissions = await stageManagerService.getUserPermissions(
      cycleId,
      currentStage.stageName,
      req.user?.id || '',
      req.user?.role || 'EMPLOYEE'
    );

    res.json({
      success: true,
      data: {
        stage: currentStage,
        allowedTransitions,
        userPermissions,
        cycle: {
          id: cycle.id,
          name: cycle.name,
          quarter: cycle.quarter,
          year: cycle.year,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching current stage:', error);
    res.status(500).json({
      error: 'Failed to fetch current stage',
    });
  }
});

// ─── GET /api/cycles/:id/stages/:stageId ─────────────────────────────────────

stagesRouter.get('/cycles/:cycleId/stages/:stageId', authenticate, async (req: Request, res: Response) => {
  try {
    const { cycleId, stageId } = req.params;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get specific stage
    const stage = await stageManagerService.getStageById(stageId);
    if (!stage || stage.cycleId !== cycleId) {
      res.status(404).json({ error: 'Stage not found in this cycle' });
      return;
    }

    // Get stage history (transitions to/from this stage)
    const stageHistory = await stageManagerService.getStageHistory(cycleId, stageId);

    // Get user permissions for this stage
    const userPermissions = await stageManagerService.getUserPermissions(
      cycleId,
      stage.stageName,
      req.user?.id || '',
      req.user?.role || 'EMPLOYEE'
    );

    res.json({
      success: true,
      data: {
        stage,
        history: stageHistory,
        userPermissions,
        cycle: {
          id: cycle.id,
          name: cycle.name,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching stage details:', error);
    res.status(500).json({
      error: 'Failed to fetch stage details',
    });
  }
});

// ─── POST /api/admin/cycles/:id/stages/:stageId/override ──────────────────────

stagesRouter.post('/admin/cycles/:cycleId/stages/:stageId/override', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { cycleId, stageId } = req.params;
    const parsed = adminOverrideSchema.safeParse(req.body);

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

    const { reason, targetStage } = parsed.data;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Find target stage
    const targetStageRecord = cycle.stages.find(s => s.stageName === targetStage);
    if (!targetStageRecord) {
      res.status(404).json({ error: 'Target stage not found' });
      return;
    }

    // Get current stage before override
    const currentStage = await stageManagerService.getCurrentStage(cycleId);

    // Perform admin override
    const overrideResult = await stageManagerService.adminOverrideStage(
      cycleId,
      targetStageRecord.id,
      reason,
      req.user.id
    );

    if (!overrideResult.success) {
      res.status(400).json({
        error: overrideResult.error,
      });
      return;
    }

    // Log the admin override
    await auditLogService.logAction({
      action: 'STAGE_ADMIN_OVERRIDE',
      entityType: 'CycleStage',
      entityId: targetStageRecord.id,
      userId: req.user.id,
      details: {
        cycleId,
        cycleName: cycle.name,
        fromStage: currentStage?.stageName,
        toStage: targetStage,
        reason,
        overrideType: 'ADMIN_DIRECT_OVERRIDE',
        transitionId: overrideResult.transitionId,
      },
    });

    res.json({
      success: true,
      data: overrideResult,
      message: `Admin override: Stage set to ${targetStage}`,
    });
  } catch (error) {
    console.error('Error performing admin override:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to perform admin override',
    });
  }
});

// ─── GET /api/cycles/:id/stage-history ───────────────────────────────────────

stagesRouter.get('/cycles/:cycleId/stage-history', authenticate, async (req: Request, res: Response) => {
  try {
    const { cycleId } = req.params;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get complete stage history for the cycle
    const stageHistory = await stageManagerService.getStageHistory(cycleId);

    res.json({
      success: true,
      data: {
        cycleId,
        cycleName: cycle.name,
        history: stageHistory,
        totalTransitions: stageHistory.length,
      },
    });
  } catch (error) {
    console.error('Error fetching stage history:', error);
    res.status(500).json({
      error: 'Failed to fetch stage history',
    });
  }
});

// ─── GET /api/admin/cycles/:id/stage-validation ──────────────────────────────

stagesRouter.get('/admin/cycles/:cycleId/stage-validation', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { cycleId } = req.params;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    if (!currentStage) {
      res.status(404).json({ error: 'No active stage found' });
      return;
    }

    // Validate stage transition requirements
    const validationResults = await stageManagerService.validateStageRequirements(cycleId, currentStage.id);

    // Get next possible stages
    const allowedTransitions = await stageManagerService.getAllowedTransitions(cycleId, currentStage.id);

    res.json({
      success: true,
      data: {
        currentStage,
        validationResults,
        allowedTransitions,
        canTransition: validationResults.canTransition,
        blockers: validationResults.blockers || [],
        warnings: validationResults.warnings || [],
      },
    });
  } catch (error) {
    console.error('Error validating stage requirements:', error);
    res.status(500).json({
      error: 'Failed to validate stage requirements',
    });
  }
});

// ─── GET /api/stages/permissions ─────────────────────────────────────────────

stagesRouter.get('/stages/permissions', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { cycleId, stageName } = req.query;

    if (!cycleId || !stageName) {
      res.status(400).json({ error: 'cycleId and stageName query parameters are required' });
      return;
    }

    if (typeof cycleId !== 'string' || typeof stageName !== 'string') {
      res.status(400).json({ error: 'Invalid query parameters' });
      return;
    }

    // Validate stage name
    const validStageNames = ['Planning', 'Approval', 'Locked', 'Execution', 'Review'];
    if (!validStageNames.includes(stageName)) {
      res.status(400).json({ error: 'Invalid stage name' });
      return;
    }

    // Get user permissions for the specified stage
    const userPermissions = await stageManagerService.getUserPermissions(
      cycleId,
      stageName as StageName,
      req.user.id,
      req.user.role
    );

    res.json({
      success: true,
      data: {
        cycleId,
        stageName,
        userId: req.user.id,
        userRole: req.user.role,
        permissions: userPermissions,
      },
    });
  } catch (error) {
    console.error('Error fetching stage permissions:', error);
    res.status(500).json({
      error: 'Failed to fetch stage permissions',
    });
  }
});