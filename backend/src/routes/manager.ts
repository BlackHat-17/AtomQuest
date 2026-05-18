import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const managerRouter = Router();

// ─── GET /api/manager/team ────────────────────────────────────────────────────
// Returns all direct reports with their current active cycle's goal sheet status
// and check-in completion status for the active quarterly cycle.

managerRouter.get('/team', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const managerId = req.user.id;

  // Find the active GOAL_SETTING cycle first (priority for goal sheet approval)
  // If not found, fall back to any active cycle
  let activeCycle = await prisma.goalCycle.findFirst({
    where: { isActive: true, phase: 'GOAL_SETTING' },
  });

  if (!activeCycle) {
    activeCycle = await prisma.goalCycle.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Find the active quarterly cycle (Q1–Q4) for check-in status
  // A quarterly cycle is active when isActive=true and phase is one of Q1–Q4
  const now = new Date();
  const activeQuarterlyCycle = await prisma.goalCycle.findFirst({
    where: {
      isActive: true,
      phase: { in: ['Q1', 'Q2', 'Q3', 'Q4'] },
      windowOpen: { lte: now },
      windowClose: { gte: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch all direct reports
  const directReports = await prisma.user.findMany({
    where: { managerId },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      role: true,
    },
    orderBy: { name: 'asc' },
  });

  // For each direct report, find their goal sheet and check-in status
  const team = await Promise.all(
    directReports.map(async (employee) => {
      let goalSheet = null;
      let checkInStatus: 'DONE' | 'PENDING' = 'PENDING';

      if (activeCycle) {
        goalSheet = await prisma.goalSheet.findUnique({
          where: {
            employeeId_cycleId: {
              employeeId: employee.id,
              cycleId: activeCycle.id,
            },
          },
          select: {
            id: true,
            status: true,
            submittedAt: true,
            approvedAt: true,
            reworkComment: true,
          },
        });
      }

      // Determine check-in status for the active quarterly window
      if (activeQuarterlyCycle && goalSheet) {
        const existingCheckIn = await prisma.checkIn.findUnique({
          where: {
            goalSheetId_quarter: {
              goalSheetId: goalSheet.id,
              quarter: activeQuarterlyCycle.phase as 'Q1' | 'Q2' | 'Q3' | 'Q4',
            },
          },
        });
        checkInStatus = existingCheckIn ? 'DONE' : 'PENDING';
      }

      return {
        ...employee,
        goalSheet,
        checkInStatus,
      };
    })
  );

  res.json({
    cycle: activeCycle ?? null,
    activeQuarter: activeQuarterlyCycle?.phase ?? null,
    team,
  });
});
