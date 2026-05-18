import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { computeScore } from '../lib/scoring.js';
import { notifyService } from '../services/notifyService.js';

export const achievementsRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const quarterSchema = z.enum(['Q1', 'Q2', 'Q3', 'Q4']);

const updateAchievementSchema = z.object({
  actual: z.string().min(1, 'Actual value is required'),
  status: z.enum(['NOT_STARTED', 'ON_TRACK', 'COMPLETED']).optional(),
});

// ─── PUT /api/achievements/:goalId/:quarter ───────────────────────────────────
// Upsert actual value, compute score, enforce window check (P9)

achievementsRouter.put('/:goalId/:quarter', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Validate quarter param
  const quarterParsed = quarterSchema.safeParse(req.params.quarter);
  if (!quarterParsed.success) {
    res.status(400).json({ error: 'Invalid quarter. Must be Q1, Q2, Q3, or Q4.' });
    return;
  }
  const quarter = quarterParsed.data;

  // Validate body
  const bodyParsed = updateAchievementSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.issues[0]?.message ?? 'Invalid request body' });
    return;
  }
  const { actual, status } = bodyParsed.data;

  const { goalId } = req.params;

  // Fetch goal with its sheet to verify ownership
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      goalSheet: true,
    },
  });

  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }

  // Verify goal belongs to the authenticated user's sheet
  if (goal.goalSheet.employeeId !== req.user.id) {
    res.status(403).json({ error: 'You do not have access to this goal' });
    return;
  }

  // Only locked/approved goals can have achievements
  if (!goal.isLocked) {
    res.status(400).json({ error: 'Goal must be approved and locked before recording achievements' });
    return;
  }

  // P9 — Window check: find active GoalCycle where phase === quarter AND isActive === true
  // AND now is between windowOpen and windowClose
  const now = new Date();
  const activeCycle = await prisma.goalCycle.findFirst({
    where: {
      phase: quarter,
      isActive: true,
      windowOpen: { lte: now },
      windowClose: { gte: now },
    },
  });

  if (!activeCycle) {
    res.status(400).json({ error: `Check-in window for ${quarter} is not open.` });
    return;
  }

  // Compute score
  const score = computeScore(goal.uomType, goal.target, actual);

  // Upsert achievement
  const achievement = await prisma.achievement.upsert({
    where: { goalId_quarter: { goalId, quarter } },
    update: {
      actual,
      score,
      updatedById: req.user.id,
    },
    create: {
      goalId,
      quarter,
      actual,
      score,
      updatedById: req.user.id,
    },
  });

  // Update goal status if provided
  if (status) {
    await prisma.goal.update({
      where: { id: goalId },
      data: { status },
    });
  }

  // Shared goal sync: if goal.isShared === false (primary owner),
  // find all goals where sharedFromId === goal.id and upsert their achievements
  if (!goal.isShared) {
    const linkedGoals = await prisma.goal.findMany({
      where: { sharedFromId: goal.id },
    });

    for (const linked of linkedGoals) {
      await prisma.achievement.upsert({
        where: { goalId_quarter: { goalId: linked.id, quarter } },
        update: {
          actual,
          score,
          updatedById: req.user.id,
        },
        create: {
          goalId: linked.id,
          quarter,
          actual,
          score,
          updatedById: req.user.id,
        },
      });
    }
  }

  // Fire-and-forget: notify manager that achievement data has been updated
  const employeeWithManager = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { managerId: true },
  });
  if (employeeWithManager?.managerId) {
    notifyService
      .achievementUpdated(goal.goalSheet.id, req.user.id, employeeWithManager.managerId)
      .catch(() => {});
  }

  res.json(achievement);
});

// ─── GET /api/achievements/:sheetId ──────────────────────────────────────────
// Fetch all achievements for a sheet

achievementsRouter.get('/:sheetId', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { sheetId } = req.params;

  // Fetch all goals for the sheet, include their achievements
  const goals = await prisma.goal.findMany({
    where: { goalSheetId: sheetId },
    include: {
      achievements: {
        orderBy: { quarter: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ goals });
});
