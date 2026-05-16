import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireManagerOrAdmin } from '../middleware/authorize.js';

export const sharedGoalsRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const pushGoalSchema = z.object({
  sourceGoalId: z.string().uuid('Invalid source goal ID'),
  targetEmployeeIds: z
    .array(z.string().uuid('Invalid employee ID'))
    .min(1, 'At least one target employee is required'),
  cycleId: z.string().uuid('Invalid cycle ID'),
});

const updateWeightageSchema = z.object({
  weightage: z
    .number({ invalid_type_error: 'Weightage must be a number' })
    .min(10, 'Minimum weightage is 10%')
    .max(100, 'Weightage cannot exceed 100%'),
});

// ─── POST /api/shared-goals/push ─────────────────────────────────────────────
// Manager or Admin pushes a goal to selected employees.

sharedGoalsRouter.post('/push', requireManagerOrAdmin, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = pushGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { sourceGoalId, targetEmployeeIds, cycleId } = parsed.data;

  // Verify the source goal exists
  const sourceGoal = await prisma.goal.findUnique({
    where: { id: sourceGoalId },
    include: { goalSheet: true },
  });

  if (!sourceGoal) {
    res.status(404).json({ error: 'Source goal not found' });
    return;
  }

  // Verify ownership: ADMIN can push any goal; MANAGER can only push goals from their own sheet
  if (req.user.role !== 'ADMIN' && sourceGoal.goalSheet.employeeId !== req.user.id) {
    res.status(403).json({ error: 'You can only push goals from your own goal sheet' });
    return;
  }

  // Verify the cycle exists
  const cycle = await prisma.goalCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) {
    res.status(404).json({ error: 'Cycle not found' });
    return;
  }

  const createdSharedGoals = [];

  for (const targetEmployeeId of targetEmployeeIds) {
    // Verify the target employee exists
    const targetEmployee = await prisma.user.findUnique({ where: { id: targetEmployeeId } });
    if (!targetEmployee) {
      res.status(404).json({ error: `Employee ${targetEmployeeId} not found` });
      return;
    }

    // Find or create a DRAFT GoalSheet for the target employee in the given cycle
    let targetSheet = await prisma.goalSheet.findUnique({
      where: { employeeId_cycleId: { employeeId: targetEmployeeId, cycleId } },
    });

    if (!targetSheet) {
      targetSheet = await prisma.goalSheet.create({
        data: {
          employeeId: targetEmployeeId,
          cycleId,
          status: 'DRAFT',
        },
      });
    }

    // Create the Goal record on the target sheet with isShared=true
    const sharedGoalRecord = await prisma.goal.create({
      data: {
        goalSheetId: targetSheet.id,
        thrustArea: sourceGoal.thrustArea,
        title: sourceGoal.title,
        description: sourceGoal.description,
        uomType: sourceGoal.uomType,
        target: sourceGoal.target,
        weightage: 10, // default; employee-adjustable
        isShared: true,
        sharedFromId: sourceGoalId,
        isLocked: false,
      },
    });

    // Create the SharedGoal mapping record
    // Use upsert to handle the unique constraint (sourceGoalId, targetEmployeeId, cycleId)
    const sharedGoal = await prisma.sharedGoal.upsert({
      where: {
        sourceGoalId_targetEmployeeId_cycleId: {
          sourceGoalId,
          targetEmployeeId,
          cycleId,
        },
      },
      update: {
        weightage: 10,
      },
      create: {
        sourceGoalId,
        targetEmployeeId,
        cycleId,
        weightage: 10,
      },
    });

    // Attach the created goal ID for reference
    createdSharedGoals.push({ ...sharedGoal, goalId: sharedGoalRecord.id });
  }

  res.status(201).json(createdSharedGoals);
});

// ─── PUT /api/shared-goals/:id/weightage ─────────────────────────────────────
// Employee adjusts the weightage of a shared goal assigned to them.

sharedGoalsRouter.put('/:id/weightage', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = updateWeightageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { id } = req.params;
  const { weightage } = parsed.data;

  // Fetch the SharedGoal record
  const sharedGoal = await prisma.sharedGoal.findUnique({ where: { id } });

  if (!sharedGoal) {
    res.status(404).json({ error: 'Shared goal not found' });
    return;
  }

  // Verify the authenticated user is the target employee
  if (sharedGoal.targetEmployeeId !== req.user.id) {
    res.status(403).json({ error: 'You do not have permission to update this shared goal' });
    return;
  }

  // Update SharedGoal.weightage
  const updatedSharedGoal = await prisma.sharedGoal.update({
    where: { id },
    data: { weightage },
  });

  // Also update the corresponding Goal.weightage on the employee's sheet
  const correspondingGoal = await prisma.goal.findFirst({
    where: {
      sharedFromId: sharedGoal.sourceGoalId,
      goalSheet: { employeeId: sharedGoal.targetEmployeeId, cycleId: sharedGoal.cycleId },
    },
  });

  if (correspondingGoal) {
    await prisma.goal.update({
      where: { id: correspondingGoal.id },
      data: { weightage },
    });
  }

  res.json(updatedSharedGoal);
});
