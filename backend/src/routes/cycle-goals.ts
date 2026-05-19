import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { StageName } from '@prisma/client';
import { requireManagerOrAdmin, requireAdmin } from '../middleware/authorize.js';
import { authenticate } from '../middleware/authenticate.js';
import { goalTrackerService } from '../services/goalTrackerService.js';
import { accessControllerService } from '../services/accessControllerService.js';
import { stageManagerService } from '../services/stageManagerService.js';
import { auditLogService } from '../services/auditLogService.js';
import { cycleManagerService } from '../services/cycleManagerService.js';

export const cycleGoalsRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const createGoalSchema = z.object({
  cycleId: z.string().uuid('Invalid cycle ID'),
  thrustArea: z.enum([
    'Revenue',
    'Cost',
    'Quality',
    'Delivery',
    'Safety',
    'People',
    'Innovation',
    'Customer',
  ]),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().min(1, 'Description is required').max(1000, 'Description too long'),
  uomType: z.enum(['NUMERIC_MIN', 'NUMERIC_MAX', 'TIMELINE', 'ZERO']),
  target: z.string().min(1, 'Target is required'),
  weightage: z
    .number({ invalid_type_error: 'Weightage must be a number' })
    .min(10, 'Minimum weightage is 10%')
    .max(100, 'Weightage cannot exceed 100%'),
});

const updateGoalSchema = z.object({
  thrustArea: z
    .enum(['Revenue', 'Cost', 'Quality', 'Delivery', 'Safety', 'People', 'Innovation', 'Customer'])
    .optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(1000).optional(),
  uomType: z.enum(['NUMERIC_MIN', 'NUMERIC_MAX', 'TIMELINE', 'ZERO']).optional(),
  target: z.string().min(1).optional(),
  weightage: z.number().min(10).max(100).optional(),
  status: z.enum(['NOT_STARTED', 'ON_TRACK', 'COMPLETED']).optional(),
});

const updateAchievementSchema = z.object({
  achievement: z.string().min(1, 'Achievement is required'),
  score: z.number().min(0).max(100).optional(),
});

const goalVisibilityQuerySchema = z.object({
  cycleId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  includeArchived: z.string().optional().transform(val => val === 'true'),
});

// ─── GET /api/cycle-goals/cycles/:cycleId/my-goals ───────────────────────────

cycleGoalsRouter.get('/cycles/:cycleId/my-goals', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { cycleId } = req.params;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get current stage and user permissions
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    const userPermissions = currentStage 
      ? await stageManagerService.getUserPermissions(cycleId, currentStage.stageName, req.user.id, req.user.role)
      : null;

    // Get user's goals for this cycle
    const goals = await goalTrackerService.getGoalsByCycle(cycleId, req.user.id);

    // Get goal visibility rules
    const visibilityRules = await goalTrackerService.getGoalVisibilityRules(cycleId, req.user.id);

    res.json({
      success: true,
      data: {
        cycle: {
          id: cycle.id,
          name: cycle.name,
          quarter: cycle.quarter,
          year: cycle.year,
          isActive: cycle.isActive,
        },
        currentStage,
        userPermissions,
        goals,
        visibilityRules,
        totalGoals: goals.length,
        maxGoalsAllowed: 8,
      },
    });
  } catch (error) {
    console.error('Error fetching user goals:', error);
    res.status(500).json({
      error: 'Failed to fetch goals',
    });
  }
});

// ─── POST /api/cycle-goals/cycles/:cycleId/goals ─────────────────────────────

cycleGoalsRouter.post('/cycles/:cycleId/goals', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { cycleId } = req.params;
    const parsed = createGoalSchema.safeParse({ ...req.body, cycleId });

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

    const goalData = parsed.data;

    // Validate cycle exists and is active
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Check stage-based permissions
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    if (!currentStage) {
      res.status(400).json({ error: 'No active stage found for this cycle' });
      return;
    }

    // Validate user can create goals in current stage
    const canCreateGoals = await accessControllerService.canPerformAction(
      req.user.id,
      req.user.role,
      'CREATE_GOAL',
      cycleId,
      currentStage.stageName
    );

    if (!canCreateGoals.allowed) {
      res.status(403).json({
        error: canCreateGoals.reason,
        currentStage: currentStage.stageName,
        allowedActions: canCreateGoals.allowedActions,
      });
      return;
    }

    // Create the goal
    const goal = await goalTrackerService.createGoal(goalData, req.user.id);

    // Log the goal creation
    await auditLogService.logAction({
      action: 'GOAL_CREATED',
      entityType: 'Goal',
      entityId: goal.id,
      userId: req.user.id,
      details: {
        cycleId,
        cycleName: cycle.name,
        currentStage: currentStage.stageName,
        goalTitle: goal.title,
        thrustArea: goal.thrustArea,
        weightage: goal.weightage,
      },
    });

    res.status(201).json({
      success: true,
      data: goal,
      message: 'Goal created successfully',
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create goal',
    });
  }
});

// ─── PUT /api/cycle-goals/goals/:goalId ──────────────────────────────────────

cycleGoalsRouter.put('/goals/:goalId', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { goalId } = req.params;
    const parsed = updateGoalSchema.safeParse(req.body);

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

    const updates = parsed.data;

    // Get goal and validate ownership/permissions
    const goal = await goalTrackerService.getGoalById(goalId);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    // Get cycle and current stage
    const cycle = await cycleManagerService.getCycleById(goal.cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Associated cycle not found' });
      return;
    }

    const currentStage = await stageManagerService.getCurrentStage(goal.cycleId);
    if (!currentStage) {
      res.status(400).json({ error: 'No active stage found for this cycle' });
      return;
    }

    // Check stage-based permissions
    const canEditGoals = await accessControllerService.canPerformAction(
      req.user.id,
      req.user.role,
      'EDIT_GOAL',
      goal.cycleId,
      currentStage.stageName
    );

    if (!canEditGoals.allowed) {
      res.status(403).json({
        error: canEditGoals.reason,
        currentStage: currentStage.stageName,
        allowedActions: canEditGoals.allowedActions,
      });
      return;
    }

    // Update the goal
    const updatedGoal = await goalTrackerService.updateGoal(goalId, updates, req.user.id);

    // Log the goal update
    await auditLogService.logAction({
      action: 'GOAL_UPDATED',
      entityType: 'Goal',
      entityId: goalId,
      userId: req.user.id,
      details: {
        cycleId: goal.cycleId,
        cycleName: cycle.name,
        currentStage: currentStage.stageName,
        goalTitle: goal.title,
        updates,
      },
    });

    res.json({
      success: true,
      data: updatedGoal,
      message: 'Goal updated successfully',
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update goal',
    });
  }
});

// ─── DELETE /api/cycle-goals/goals/:goalId ───────────────────────────────────

cycleGoalsRouter.delete('/goals/:goalId', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { goalId } = req.params;

    // Get goal and validate ownership/permissions
    const goal = await goalTrackerService.getGoalById(goalId);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    // Get cycle and current stage
    const cycle = await cycleManagerService.getCycleById(goal.cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Associated cycle not found' });
      return;
    }

    const currentStage = await stageManagerService.getCurrentStage(goal.cycleId);
    if (!currentStage) {
      res.status(400).json({ error: 'No active stage found for this cycle' });
      return;
    }

    // Check stage-based permissions
    const canDeleteGoals = await accessControllerService.canPerformAction(
      req.user.id,
      req.user.role,
      'DELETE_GOAL',
      goal.cycleId,
      currentStage.stageName
    );

    if (!canDeleteGoals.allowed) {
      res.status(403).json({
        error: canDeleteGoals.reason,
        currentStage: currentStage.stageName,
        allowedActions: canDeleteGoals.allowedActions,
      });
      return;
    }

    // Delete the goal
    await goalTrackerService.deleteGoal(goalId, req.user.id);

    // Log the goal deletion
    await auditLogService.logAction({
      action: 'GOAL_DELETED',
      entityType: 'Goal',
      entityId: goalId,
      userId: req.user.id,
      details: {
        cycleId: goal.cycleId,
        cycleName: cycle.name,
        currentStage: currentStage.stageName,
        goalTitle: goal.title,
        thrustArea: goal.thrustArea,
      },
    });

    res.json({
      success: true,
      message: 'Goal deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to delete goal',
    });
  }
});

// ─── PUT /api/cycle-goals/goals/:goalId/achievement ──────────────────────────

cycleGoalsRouter.put('/goals/:goalId/achievement', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { goalId } = req.params;
    const parsed = updateAchievementSchema.safeParse(req.body);

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

    const { achievement, score } = parsed.data;

    // Get goal and validate ownership/permissions
    const goal = await goalTrackerService.getGoalById(goalId);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    // Get cycle and current stage
    const cycle = await cycleManagerService.getCycleById(goal.cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Associated cycle not found' });
      return;
    }

    const currentStage = await stageManagerService.getCurrentStage(goal.cycleId);
    if (!currentStage) {
      res.status(400).json({ error: 'No active stage found for this cycle' });
      return;
    }

    // Check stage-based permissions for achievement updates
    const canUpdateAchievements = await accessControllerService.canPerformAction(
      req.user.id,
      req.user.role,
      'UPDATE_ACHIEVEMENT',
      goal.cycleId,
      currentStage.stageName
    );

    if (!canUpdateAchievements.allowed) {
      res.status(403).json({
        error: canUpdateAchievements.reason,
        currentStage: currentStage.stageName,
        allowedActions: canUpdateAchievements.allowedActions,
      });
      return;
    }

    // Update the achievement
    const updatedGoal = await goalTrackerService.updateAchievement(goalId, achievement, score, req.user.id);

    // Log the achievement update
    await auditLogService.logAction({
      action: 'ACHIEVEMENT_UPDATED',
      entityType: 'Goal',
      entityId: goalId,
      userId: req.user.id,
      details: {
        cycleId: goal.cycleId,
        cycleName: cycle.name,
        currentStage: currentStage.stageName,
        goalTitle: goal.title,
        achievement,
        score,
      },
    });

    res.json({
      success: true,
      data: updatedGoal,
      message: 'Achievement updated successfully',
    });
  } catch (error) {
    console.error('Error updating achievement:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update achievement',
    });
  }
});

// ─── GET /api/cycle-goals/cycles/:cycleId/goals/visibility ───────────────────

cycleGoalsRouter.get('/cycles/:cycleId/goals/visibility', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { cycleId } = req.params;
    const parsed = goalVisibilityQuerySchema.safeParse({ ...req.query, cycleId });

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

    const { userId, includeArchived } = parsed.data;
    const targetUserId = userId || req.user.id;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get visibility rules for the user
    const visibilityRules = await goalTrackerService.getGoalVisibilityRules(cycleId, targetUserId);

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(cycleId);

    res.json({
      success: true,
      data: {
        cycleId,
        cycleName: cycle.name,
        userId: targetUserId,
        currentStage,
        visibilityRules,
        includeArchived,
      },
    });
  } catch (error) {
    console.error('Error fetching goal visibility:', error);
    res.status(500).json({
      error: 'Failed to fetch goal visibility rules',
    });
  }
});

// ─── GET /api/cycle-goals/cycles/:cycleId/team-goals ─────────────────────────

cycleGoalsRouter.get('/cycles/:cycleId/team-goals', requireManagerOrAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { cycleId } = req.params;

    // Validate cycle exists
    const cycle = await cycleManagerService.getCycleById(cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    // Get team goals (for manager) or all goals (for admin)
    const teamGoals = await goalTrackerService.getTeamGoalsByCycle(cycleId, req.user.id, req.user.role);

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(cycleId);

    res.json({
      success: true,
      data: {
        cycle: {
          id: cycle.id,
          name: cycle.name,
          quarter: cycle.quarter,
          year: cycle.year,
        },
        currentStage,
        teamGoals,
        totalEmployees: teamGoals.length,
      },
    });
  } catch (error) {
    console.error('Error fetching team goals:', error);
    res.status(500).json({
      error: 'Failed to fetch team goals',
    });
  }
});

// ─── GET /api/cycle-goals/goals/:goalId/permissions ──────────────────────────

cycleGoalsRouter.get('/goals/:goalId/permissions', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { goalId } = req.params;

    // Get goal
    const goal = await goalTrackerService.getGoalById(goalId);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(goal.cycleId);
    if (!currentStage) {
      res.status(400).json({ error: 'No active stage found for this cycle' });
      return;
    }

    // Get user permissions for this goal
    const permissions = await accessControllerService.getGoalPermissions(
      req.user.id,
      req.user.role,
      goalId,
      currentStage.stageName
    );

    res.json({
      success: true,
      data: {
        goalId,
        userId: req.user.id,
        userRole: req.user.role,
        currentStage: currentStage.stageName,
        permissions,
      },
    });
  } catch (error) {
    console.error('Error fetching goal permissions:', error);
    res.status(500).json({
      error: 'Failed to fetch goal permissions',
    });
  }
});

// ─── POST /api/admin/cycle-goals/goals/:goalId/unlock ────────────────────────

cycleGoalsRouter.post('/admin/goals/:goalId/unlock', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { goalId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'Reason is required for admin unlock' });
      return;
    }

    // Get goal
    const goal = await goalTrackerService.getGoalById(goalId);
    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    // Get cycle and current stage
    const cycle = await cycleManagerService.getCycleById(goal.cycleId);
    if (!cycle) {
      res.status(404).json({ error: 'Associated cycle not found' });
      return;
    }

    const currentStage = await stageManagerService.getCurrentStage(goal.cycleId);
    if (!currentStage) {
      res.status(400).json({ error: 'No active stage found for this cycle' });
      return;
    }

    // Perform admin unlock
    const unlockResult = await accessControllerService.adminUnlockGoal(goalId, req.user.id, reason.trim());

    // Log the admin unlock
    await auditLogService.logAction({
      action: 'GOAL_ADMIN_UNLOCK',
      entityType: 'Goal',
      entityId: goalId,
      userId: req.user.id,
      details: {
        cycleId: goal.cycleId,
        cycleName: cycle.name,
        currentStage: currentStage.stageName,
        goalTitle: goal.title,
        reason: reason.trim(),
        unlockDuration: unlockResult.unlockDurationMinutes,
      },
    });

    res.json({
      success: true,
      data: unlockResult,
      message: `Goal unlocked for ${unlockResult.unlockDurationMinutes} minutes`,
    });
  } catch (error) {
    console.error('Error unlocking goal:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to unlock goal',
    });
  }
});