import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireManagerOrAdmin } from '../middleware/authorize.js';

export const checkinsRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const createCheckinSchema = z.object({
  goalSheetId: z.string().uuid('Invalid goal sheet ID'),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  comment: z.string().min(1, 'Comment is required'),
});

// ─── POST /api/checkins ───────────────────────────────────────────────────────

checkinsRouter.post('/', requireManagerOrAdmin, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = createCheckinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
    return;
  }

  const { goalSheetId, quarter, comment } = parsed.data;

  const sheet = await prisma.goalSheet.findUnique({
    where: { id: goalSheetId },
    include: { employee: true },
  });

  if (!sheet) {
    res.status(404).json({ error: 'Goal sheet not found' });
    return;
  }

  if (req.user.role !== 'ADMIN' && sheet.employee.managerId !== req.user.id) {
    res.status(403).json({ error: 'You are not the manager of this employee' });
    return;
  }

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

  const checkIn = await prisma.checkIn.upsert({
    where: { goalSheetId_quarter: { goalSheetId, quarter } },
    update: { managerId: req.user.id, comment, completedAt: now },
    create: { goalSheetId, quarter, managerId: req.user.id, comment, completedAt: now },
  });

  res.json(checkIn);
});

// ─── GET /api/checkins/:sheetId ───────────────────────────────────────────────

checkinsRouter.get('/:sheetId', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { sheetId } = req.params;

  const checkIns = await prisma.checkIn.findMany({
    where: { goalSheetId: sheetId },
    orderBy: { completedAt: 'desc' },
    include: {
      manager: { select: { id: true, name: true, email: true } },
    },
  });

  res.json(checkIns);
});
