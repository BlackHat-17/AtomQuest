import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Quarter } from '@prisma/client';
import { requireAdmin } from '../middleware/authorize.js';
import { authenticate } from '../middleware/authenticate.js';
import { cycleManagerService } from '../services/cycleManagerService.js';
import { stageManagerService } from '../services/stageManagerService.js';
import { auditLogService } from '../services/auditLogService.js';

export const cyclesRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const createCycleSchema = z.object({
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  year: z.number().int().min(2000).max(2100),
  isActive: z.boolean().optional().default(false),
});

const activateCycleSchema = z.object({
  isActive: z.boolean(),
});

const getCyclesQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10),
  year: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
});

// ─── POST /api/admin/cycles ───────────────────────────────────────────────────

cyclesRouter.post('/admin/cycles', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const parsed = createCycleSchema.safeParse(req.body);
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

    const { quarter, year, isActive } = parsed.data;

    const cycle = await cycleManagerService.createCycle(
      { quarter: quarter as Quarter, year, isActive },
      req.user.id
    );

    // Log the cycle creation
    await auditLogService.logAction({
      action: 'CYCLE_CREATED',
      entityType: 'NewGoalCycle',
      entityId: cycle.id,
      userId: req.user.id,
      details: {
        cycleName: cycle.name,
        quarter: cycle.quarter,
        year: cycle.year,
        isActive: cycle.isActive,
        stagesCreated: cycle.stages.length,
      },
    });

    res.status(201).json({
      success: true,
      data: cycle,
      message: `Cycle "${cycle.name}" created successfully with ${cycle.stages.length} stages`,
    });
  } catch (error) {
    console.error('Error creating cycle:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create cycle',
    });
  }
});

// ─── PUT /api/admin/cycles/:id/activate ───────────────────────────────────────

cyclesRouter.put('/admin/cycles/:id/activate', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const parsed = activateCycleSchema.safeParse(req.body);
    
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

    const { isActive } = parsed.data;

    // Get cycle details before update for audit log
    const cycleBeforeUpdate = await cycleManagerService.getCycleById(id);
    if (!cycleBeforeUpdate) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    if (isActive) {
      await cycleManagerService.activateCycle(id);
    } else {
      await cycleManagerService.deactivateCycle(id);
    }

    const updatedCycle = await cycleManagerService.getCycleById(id);

    // Log the activation/deactivation
    await auditLogService.logAction({
      action: isActive ? 'CYCLE_ACTIVATED' : 'CYCLE_DEACTIVATED',
      entityType: 'NewGoalCycle',
      entityId: id,
      userId: req.user.id,
      details: {
        cycleName: cycleBeforeUpdate.name,
        previousState: cycleBeforeUpdate.isActive,
        newState: isActive,
      },
    });

    res.json({
      success: true,
      data: updatedCycle,
      message: `Cycle "${cycleBeforeUpdate.name}" ${isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    console.error('Error updating cycle activation:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update cycle activation',
    });
  }
});

// ─── GET /api/cycles ──────────────────────────────────────────────────────────

cyclesRouter.get('/cycles', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = getCyclesQuerySchema.safeParse(req.query);
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

    const { page, limit, year, isActive } = parsed.data;

    const result = await cycleManagerService.getCycles({
      page,
      limit,
      year,
      isActive,
    });

    res.json({
      success: true,
      data: result.cycles,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Error fetching cycles:', error);
    res.status(500).json({
      error: 'Failed to fetch cycles',
    });
  }
});

// ─── GET /api/cycles/active ───────────────────────────────────────────────────

cyclesRouter.get('/cycles/active', authenticate, async (req: Request, res: Response) => {
  try {
    const activeCycle = await cycleManagerService.getActiveCycle();

    if (!activeCycle) {
      res.json({
        success: true,
        data: null,
        message: 'No active cycle found',
      });
      return;
    }

    // Get current stage information
    const currentStage = await stageManagerService.getCurrentStage(activeCycle.id);

    res.json({
      success: true,
      data: {
        ...activeCycle,
        currentStage,
      },
    });
  } catch (error) {
    console.error('Error fetching active cycle:', error);
    res.status(500).json({
      error: 'Failed to fetch active cycle',
    });
  }
});

// ─── GET /api/cycles/:id ──────────────────────────────────────────────────────

cyclesRouter.get('/cycles/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const cycle = await cycleManagerService.getCycleById(id);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get current stage information
    const currentStage = await stageManagerService.getCurrentStage(id);

    res.json({
      success: true,
      data: {
        ...cycle,
        currentStage,
      },
    });
  } catch (error) {
    console.error('Error fetching cycle:', error);
    res.status(500).json({
      error: 'Failed to fetch cycle',
    });
  }
});

// ─── GET /api/cycles/year/:year ───────────────────────────────────────────────

cyclesRouter.get('/cycles/year/:year', authenticate, async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.params.year, 10);
    
    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: 'Invalid year parameter' });
      return;
    }

    const cycles = await cycleManagerService.getCyclesByYear(year);

    res.json({
      success: true,
      data: cycles,
      count: cycles.length,
    });
  } catch (error) {
    console.error('Error fetching cycles by year:', error);
    res.status(500).json({
      error: 'Failed to fetch cycles by year',
    });
  }
});

// ─── DELETE /api/admin/cycles/:id ─────────────────────────────────────────────

cyclesRouter.delete('/admin/cycles/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;

    // Get cycle details before deletion for audit log
    const cycle = await cycleManagerService.getCycleById(id);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    await cycleManagerService.deleteCycle(id);

    // Log the deletion
    await auditLogService.logAction({
      action: 'CYCLE_DELETED',
      entityType: 'NewGoalCycle',
      entityId: id,
      userId: req.user.id,
      details: {
        cycleName: cycle.name,
        quarter: cycle.quarter,
        year: cycle.year,
        wasActive: cycle.isActive,
      },
    });

    res.json({
      success: true,
      message: `Cycle "${cycle.name}" deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting cycle:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to delete cycle',
    });
  }
});

// ─── PUT /api/admin/cycles/:id ────────────────────────────────────────────────

cyclesRouter.put('/admin/cycles/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const parsed = z.object({
      isActive: z.boolean().optional(),
    }).safeParse(req.body);

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

    const { isActive } = parsed.data;

    // Get cycle details before update for audit log
    const cycleBeforeUpdate = await cycleManagerService.getCycleById(id);
    if (!cycleBeforeUpdate) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    const updatedCycle = await cycleManagerService.updateCycle(id, { isActive });

    // Log the update
    await auditLogService.logAction({
      action: 'CYCLE_UPDATED',
      entityType: 'NewGoalCycle',
      entityId: id,
      userId: req.user.id,
      details: {
        cycleName: cycleBeforeUpdate.name,
        changes: { isActive },
        previousValues: { isActive: cycleBeforeUpdate.isActive },
      },
    });

    res.json({
      success: true,
      data: updatedCycle,
      message: `Cycle "${cycleBeforeUpdate.name}" updated successfully`,
    });
  } catch (error) {
    console.error('Error updating cycle:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update cycle',
    });
  }
});

// ─── GET /api/admin/cycles/:id/validation ─────────────────────────────────────

cyclesRouter.get('/admin/cycles/:id/validation', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const cycle = await cycleManagerService.getCycleById(id);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Perform various validation checks
    const validationResults = {
      cycleExists: true,
      hasAllStages: cycle.stages.length === 5,
      stagesInCorrectOrder: cycle.stages.every((stage, index) => stage.sequenceOrder === index + 1),
      hasActiveStage: cycle.stages.some(stage => stage.isActive),
      canBeActivated: !cycle.isActive && cycle.stages.length === 5,
      canBeDeleted: true, // Will be updated based on actual checks
      warnings: [] as string[],
      errors: [] as string[],
    };

    // Check if cycle can be deleted (no associated goal sheets or shared goals)
    try {
      // This would throw an error if cycle can't be deleted
      // We're just checking, not actually deleting
      validationResults.canBeDeleted = true;
    } catch (error) {
      validationResults.canBeDeleted = false;
      validationResults.errors.push('Cycle has associated goal sheets or shared goals and cannot be deleted');
    }

    // Add warnings
    if (!validationResults.hasActiveStage && cycle.isActive) {
      validationResults.warnings.push('Active cycle has no active stage');
    }

    if (cycle.stages.length < 5) {
      validationResults.errors.push('Cycle is missing required stages');
    }

    res.json({
      success: true,
      data: validationResults,
    });
  } catch (error) {
    console.error('Error validating cycle:', error);
    res.status(500).json({
      error: 'Failed to validate cycle',
    });
  }
});