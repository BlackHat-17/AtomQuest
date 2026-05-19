import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validateGoalSheet } from '../lib/validation.js';
import { requireManagerOrAdmin, requireAdmin } from '../middleware/authorize.js';
import { notifyService } from '../services/notifyService.js';

export const goalsRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const createGoalSchema = z.object({
  goalSheetId: z.string().uuid('Invalid goal sheet ID'),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EDITABLE_STATUSES = ['DRAFT', 'REWORK'] as const;

// ─── GET /api/goals/my-sheet ──────────────────────────────────────────────────
// Must be defined before /:sheetId to avoid route conflict

goalsRouter.get('/my-sheet', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const employeeId = req.user.id;

  // First, try to find the employee's most recent goal sheet (any cycle)
  let sheet = await prisma.goalSheet.findFirst({
    where: { employeeId },
    include: {
      goals: { 
        orderBy: { createdAt: 'asc' },
        include: {
          achievements: {
            orderBy: { quarter: 'asc' },
          },
        },
      },
      cycle: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // If no sheet exists, find the active GOAL_SETTING cycle and create one
  if (!sheet) {
    const activeCycle = await prisma.goalCycle.findFirst({
      where: { phase: 'GOAL_SETTING', isActive: true },
    });

    if (!activeCycle) {
      res.status(404).json({ error: 'No active goal-setting cycle found' });
      return;
    }

    sheet = await prisma.goalSheet.create({
      data: {
        employeeId,
        cycleId: activeCycle.id,
        status: 'DRAFT',
      },
      include: {
        goals: { 
          orderBy: { createdAt: 'asc' },
          include: {
            achievements: {
              orderBy: { quarter: 'asc' },
            },
          },
        },
        cycle: true,
      },
    });
  }

  res.json(sheet);
});

// ─── POST /api/goals ──────────────────────────────────────────────────────────

goalsRouter.post('/', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = createGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { goalSheetId, thrustArea, title, description, uomType, target, weightage } = parsed.data;

  // Verify sheet belongs to the authenticated user and is in an editable state
  const sheet = await prisma.goalSheet.findUnique({
    where: { id: goalSheetId },
    include: { goals: true },
  });

  if (!sheet) {
    res.status(404).json({ error: 'Goal sheet not found' });
    return;
  }

  if (sheet.employeeId !== req.user.id) {
    res.status(403).json({ error: 'You do not have access to this goal sheet' });
    return;
  }

  if (!EDITABLE_STATUSES.includes(sheet.status as (typeof EDITABLE_STATUSES)[number])) {
    res.status(403).json({
      error: `Cannot add goals to a sheet with status ${sheet.status}. Sheet must be in DRAFT or REWORK status.`,
    });
    return;
  }

  // Enforce maximum 8 goals
  if (sheet.goals.length >= 8) {
    res.status(400).json({ error: 'Maximum 8 goals allowed per employee.' });
    return;
  }

  const goal = await prisma.goal.create({
    data: {
      goalSheetId,
      thrustArea,
      title,
      description,
      uomType,
      target,
      weightage,
    },
  });

  res.status(201).json(goal);
});

// ─── GET /api/goals/search ────────────────────────────────────────────────────
// Must be defined before /:sheetId to avoid route conflict
// Returns locked goals matching title or employee name

goalsRouter.get('/search', requireAdmin, async (req: Request, res: Response) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  const searchTerm = q.trim();

  const goals = await prisma.goal.findMany({
    where: {
      isLocked: true,
      OR: [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        {
          goalSheet: {
            employee: {
              name: { contains: searchTerm, mode: 'insensitive' },
            },
          },
        },
      ],
    },
    include: {
      goalSheet: {
        include: {
          employee: {
            select: { id: true, name: true, email: true, department: true },
          },
          cycle: {
            select: { id: true, year: true, phase: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  res.json(goals);
});

// ─── GET /api/goals/:sheetId ──────────────────────────────────────────────────

goalsRouter.get('/:sheetId', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { sheetId } = req.params;

  let sheet = await prisma.goalSheet.findUnique({
    where: { id: sheetId },
    include: {
      goals: { 
        orderBy: { createdAt: 'asc' },
        include: {
          achievements: {
            orderBy: { quarter: 'asc' },
          },
        },
      },
      cycle: true,
    },
  });

  // If sheet doesn't exist, create a DRAFT sheet for the active cycle for this employee
  if (!sheet) {
    const activeCycle = await prisma.goalCycle.findFirst({
      where: { phase: 'GOAL_SETTING', isActive: true },
    });

    if (!activeCycle) {
      res.status(404).json({ error: 'Goal sheet not found and no active cycle to create one' });
      return;
    }

    sheet = await prisma.goalSheet.create({
      data: {
        employeeId: req.user.id,
        cycleId: activeCycle.id,
        status: 'DRAFT',
      },
      include: {
        goals: { 
          orderBy: { createdAt: 'asc' },
          include: {
            achievements: {
              orderBy: { quarter: 'asc' },
            },
          },
        },
        cycle: true,
      },
    });
  }

  res.json(sheet);
});

// ─── PUT /api/goals/:goalId ───────────────────────────────────────────────────

goalsRouter.put('/:goalId', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = updateGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { goalId } = req.params;

  // Fetch goal with its sheet to verify ownership and status
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { goalSheet: { include: { employee: true } } },
  });

  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  const isManagerOrAdmin = req.user.role === 'MANAGER' || req.user.role === 'ADMIN';
  const isManager = req.user.role === 'MANAGER' && goal.goalSheet.employee.managerId === req.user.id;
  const isAdmin = req.user.role === 'ADMIN';
  const isOwner = goal.goalSheet.employeeId === req.user.id;

  // If goal is locked, only manager/admin can edit
  if (goal.isLocked) {
    if (!isManagerOrAdmin) {
      res.status(403).json({ error: 'This goal is locked and cannot be modified by employees.' });
      return;
    }

    // Verify manager relationship or admin role
    if (!isAdmin && !isManager) {
      res.status(403).json({ error: 'You do not have permission to edit this locked goal.' });
      return;
    }

    // Create audit log for locked goal edits
    await prisma.auditLog.create({
      data: {
        entityType: 'Goal',
        entityId: goalId,
        userId: req.user.id,
        action: 'UPDATE',
        oldValue: goal as object,
        newValue: { ...goal, ...parsed.data } as object,
        reason: `Locked goal edited by ${req.user.role}`,
        timestamp: new Date(),
      },
    });
  } else {
    // Unlocked goals: employee or manager/admin edit flow
    
    // Manager/Admin can edit any unlocked goal regardless of sheet status
    if (isManagerOrAdmin && !isOwner) {
      // Verify manager relationship or admin role
      if (!isAdmin && !isManager) {
        res.status(403).json({ error: 'You do not have permission to edit this goal.' });
        return;
      }

      // Create audit log for manager/admin edits on unlocked goals
      await prisma.auditLog.create({
        data: {
          entityType: 'Goal',
          entityId: goalId,
          userId: req.user.id,
          action: 'UPDATE',
          oldValue: goal as object,
          newValue: { ...goal, ...parsed.data } as object,
          reason: `Unlocked goal edited by ${req.user.role}`,
          timestamp: new Date(),
        },
      });
    } else {
      // Employee editing their own goal
      
      // Block if sheet is not in an editable state
      if (!EDITABLE_STATUSES.includes(goal.goalSheet.status as (typeof EDITABLE_STATUSES)[number])) {
        res.status(403).json({
          error: `Cannot edit goals on a sheet with status ${goal.goalSheet.status}. Sheet must be in DRAFT or REWORK status.`,
        });
        return;
      }

      // Verify ownership — goal must belong to the authenticated user's sheet
      if (!isOwner) {
        res.status(403).json({ error: 'You do not have access to this goal' });
        return;
      }

      // Block restricted field changes on shared goals — only weightage and status are editable
      if (goal.isShared) {
        const allowedFields = ['weightage', 'status'];
        const attemptedFields = Object.keys(parsed.data);
        const blockedFields = attemptedFields.filter((f) => !allowedFields.includes(f));
        if (blockedFields.length > 0) {
          res.status(403).json({
            error: `Cannot modify ${blockedFields.join(', ')} on a shared goal. Only weightage and status can be changed.`,
          });
          return;
        }
      }
    }
  }

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: parsed.data,
  });

  res.json(updated);
});

// ─── DELETE /api/goals/:goalId ────────────────────────────────────────────────

goalsRouter.delete('/:goalId', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { goalId } = req.params;

  // Fetch goal with its sheet to verify ownership and status
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { goalSheet: true },
  });

  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  // Block if goal is locked
  if (goal.isLocked) {
    res.status(403).json({ error: 'This goal is locked and cannot be deleted.' });
    return;
  }

  // Block if sheet is not in an editable state
  if (!EDITABLE_STATUSES.includes(goal.goalSheet.status as (typeof EDITABLE_STATUSES)[number])) {
    res.status(403).json({
      error: `Cannot delete goals from a sheet with status ${goal.goalSheet.status}. Sheet must be in DRAFT or REWORK status.`,
    });
    return;
  }

  // Verify ownership
  if (goal.goalSheet.employeeId !== req.user.id) {
    res.status(403).json({ error: 'You do not have access to this goal' });
    return;
  }

  await prisma.goal.delete({ where: { id: goalId } });

  res.status(204).send();
});

// ─── POST /api/goals/:sheetId/submit ─────────────────────────────────────────

goalsRouter.post('/:sheetId/submit', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { sheetId } = req.params;

  const sheet = await prisma.goalSheet.findUnique({
    where: { id: sheetId },
    include: { goals: true },
  });

  if (!sheet) {
    res.status(404).json({ error: 'Goal sheet not found' });
    return;
  }

  // Verify ownership
  if (sheet.employeeId !== req.user.id) {
    res.status(403).json({ error: 'You do not have access to this goal sheet' });
    return;
  }

  // Sheet must be in DRAFT or REWORK status
  if (sheet.status !== 'DRAFT' && sheet.status !== 'REWORK') {
    res.status(400).json({
      error: `Cannot submit a sheet with status ${sheet.status}. Sheet must be in DRAFT or REWORK status.`,
    });
    return;
  }

  // Validate all goals
  const goalsForValidation = sheet.goals.map((g) => ({
    weightage: Number(g.weightage),
  }));

  const validation = validateGoalSheet(goalsForValidation);
  if (!validation.valid) {
    res.status(400).json({ errors: validation.errors });
    return;
  }

  const updated = await prisma.goalSheet.update({
    where: { id: sheetId },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
    include: { goals: { orderBy: { createdAt: 'asc' } }, cycle: true },
  });

  // Fire-and-forget: notify manager that a goal sheet has been submitted
  const employee = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { managerId: true },
  });
  if (employee?.managerId) {
    notifyService
      .goalSubmitted(sheetId, req.user.id, employee.managerId)
      .catch(() => {});
  }

  res.json(updated);
});

// ─── POST /api/goals/:sheetId/approve ────────────────────────────────────────

const approveBodySchema = z.object({
  edits: z
    .array(
      z.object({
        goalId: z.string().uuid('Invalid goal ID'),
        target: z.string().min(1).optional(),
        weightage: z.number().min(10).max(100).optional(),
      })
    )
    .optional(),
});

goalsRouter.post(
  '/:sheetId/approve',
  requireManagerOrAdmin,
  async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { sheetId } = req.params;

    const parsed = approveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    const sheet = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { employee: true, goals: true },
    });

    if (!sheet) {
      res.status(404).json({ error: 'Goal sheet not found' });
      return;
    }

    // Verify manager relationship (or ADMIN can approve any)
    if (
      req.user.role !== 'ADMIN' &&
      sheet.employee.managerId !== req.user.id
    ) {
      res.status(403).json({ error: 'You are not the manager of this employee' });
      return;
    }

    // P10 idempotency — sheet must be in SUBMITTED status
    if (sheet.status !== 'SUBMITTED') {
      res.status(400).json({
        error: `Cannot approve a sheet with status ${sheet.status}. Sheet must be in SUBMITTED status.`,
      });
      return;
    }

    // Apply inline manager edits if provided
    const { edits } = parsed.data;
    if (edits && edits.length > 0) {
      for (const edit of edits) {
        const goalExists = sheet.goals.some((g) => g.id === edit.goalId);
        if (!goalExists) {
          res.status(400).json({ error: `Goal ${edit.goalId} does not belong to this sheet` });
          return;
        }

        const updateData: { target?: string; weightage?: number } = {};
        if (edit.target !== undefined) updateData.target = edit.target;
        if (edit.weightage !== undefined) updateData.weightage = edit.weightage;

        if (Object.keys(updateData).length > 0) {
          await prisma.goal.update({
            where: { id: edit.goalId },
            data: updateData,
          });
        }
      }

      // Re-validate after edits
      const updatedGoals = await prisma.goal.findMany({ where: { goalSheetId: sheetId } });
      const validation = validateGoalSheet(
        updatedGoals.map((g) => ({ weightage: Number(g.weightage) }))
      );
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }
    }

    // Lock all goals
    await prisma.goal.updateMany({
      where: { goalSheetId: sheetId },
      data: { isLocked: true },
    });

    // Update sheet status
    const updated = await prisma.goalSheet.update({
      where: { id: sheetId },
      data: {
        status: 'LOCKED',
        approvedAt: new Date(),
        approvedById: req.user.id,
      },
      include: { goals: { orderBy: { createdAt: 'asc' } }, cycle: true },
    });

    // Fire-and-forget: notify employee that their goal sheet has been approved
    notifyService.goalApproved(sheetId, sheet.employee.id).catch(() => {});

    res.json(updated);
  }
);

// ─── POST /api/goals/:sheetId/rework ─────────────────────────────────────────

const reworkBodySchema = z.object({
  comment: z.string().min(1, 'Comment is required'),
});

goalsRouter.post(
  '/:sheetId/rework',
  requireManagerOrAdmin,
  async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { sheetId } = req.params;

    const parsed = reworkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    const sheet = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { employee: true },
    });

    if (!sheet) {
      res.status(404).json({ error: 'Goal sheet not found' });
      return;
    }

    // Verify manager relationship (or ADMIN)
    if (
      req.user.role !== 'ADMIN' &&
      sheet.employee.managerId !== req.user.id
    ) {
      res.status(403).json({ error: 'You are not the manager of this employee' });
      return;
    }

    // Sheet must be in SUBMITTED status
    if (sheet.status !== 'SUBMITTED') {
      res.status(400).json({
        error: `Cannot return a sheet with status ${sheet.status} for rework. Sheet must be in SUBMITTED status.`,
      });
      return;
    }

    const updated = await prisma.goalSheet.update({
      where: { id: sheetId },
      data: { status: 'REWORK', reworkComment: parsed.data.comment },
      include: { goals: { orderBy: { createdAt: 'asc' } }, cycle: true },
    });

    // Fire-and-forget: notify employee that their goal sheet needs rework
    notifyService
      .goalReworked(sheetId, sheet.employee.id, parsed.data.comment)
      .catch(() => {});

    res.json(updated);
  }
);

// ─── POST /api/goals/:goalId/unlock ──────────────────────────────────────────

const unlockBodySchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

goalsRouter.post('/:goalId/unlock', requireAdmin, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { goalId } = req.params;

  const parsed = unlockBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { reason } = parsed.data;

  // Verify goal exists
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  // Verify goal is locked
  if (!goal.isLocked) {
    res.status(400).json({ error: 'Goal is not locked' });
    return;
  }

  // Write audit log
  await prisma.auditLog.create({
    data: {
      entityType: 'Goal',
      entityId: goalId,
      userId: req.user.id,
      action: 'UNLOCK',
      oldValue: { isLocked: true },
      newValue: { isLocked: false },
      reason,
      timestamp: new Date(),
    },
  });

  // Unlock the goal
  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { isLocked: false },
  });

  res.json(updated);
});
