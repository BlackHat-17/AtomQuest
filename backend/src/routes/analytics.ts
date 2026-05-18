import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const analyticsRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const qoqTrendsSchema = z.object({
  cycleYear: z.coerce.number().int().optional(),
  department: z.string().optional(),
  employeeId: z.string().uuid().optional(),
});

const completionHeatmapSchema = z.object({
  cycleYear: z.coerce.number().int().optional(),
});

const goalDistributionSchema = z.object({
  cycleId: z.string().uuid().optional(),
  department: z.string().optional(),
});

const managerEffectivenessSchema = z.object({
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  department: z.string().optional(),
});

// ─── GET /api/analytics/qoq-trends ───────────────────────────────────────────
// Returns average achievement scores per employee per quarter.
// Response: { employees: [{ name, department, scores: { Q1, Q2, Q3, Q4 } }] }

analyticsRouter.get('/qoq-trends', async (req: Request, res: Response) => {
  const parsed = qoqTrendsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }

  const { cycleYear, department, employeeId } = parsed.data;

  // Build where clause for GoalSheet
  const sheetWhere: {
    cycle?: { year?: number };
    employee?: { department?: string; id?: string };
  } = {};

  if (cycleYear) {
    sheetWhere.cycle = { year: cycleYear };
  }

  if (department || employeeId) {
    sheetWhere.employee = {};
    if (department) sheetWhere.employee.department = department;
    if (employeeId) sheetWhere.employee.id = employeeId;
  }

  const sheets = await prisma.goalSheet.findMany({
    where: sheetWhere,
    include: {
      employee: {
        select: { id: true, name: true, department: true },
      },
      goals: {
        include: {
          achievements: true,
        },
      },
    },
  });

  // Aggregate: for each employee, compute weighted average score per quarter
  const employeeMap = new Map<
    string,
    {
      name: string;
      department: string;
      quarterScores: Record<string, { totalWeightedScore: number; totalWeight: number }>;
    }
  >();

  for (const sheet of sheets) {
    const empId = sheet.employee.id;
    if (!employeeMap.has(empId)) {
      employeeMap.set(empId, {
        name: sheet.employee.name,
        department: sheet.employee.department,
        quarterScores: {
          Q1: { totalWeightedScore: 0, totalWeight: 0 },
          Q2: { totalWeightedScore: 0, totalWeight: 0 },
          Q3: { totalWeightedScore: 0, totalWeight: 0 },
          Q4: { totalWeightedScore: 0, totalWeight: 0 },
        },
      });
    }

    const entry = employeeMap.get(empId)!;

    for (const goal of sheet.goals) {
      const weight = Number(goal.weightage);
      for (const achievement of goal.achievements) {
        const q = achievement.quarter as string;
        if (entry.quarterScores[q]) {
          entry.quarterScores[q].totalWeightedScore += Number(achievement.score) * weight;
          entry.quarterScores[q].totalWeight += weight;
        }
      }
    }
  }

  const employees = Array.from(employeeMap.values()).map((emp) => ({
    name: emp.name,
    department: emp.department,
    scores: {
      Q1:
        emp.quarterScores.Q1.totalWeight > 0
          ? Math.round(
              (emp.quarterScores.Q1.totalWeightedScore / emp.quarterScores.Q1.totalWeight) * 100
            )
          : null,
      Q2:
        emp.quarterScores.Q2.totalWeight > 0
          ? Math.round(
              (emp.quarterScores.Q2.totalWeightedScore / emp.quarterScores.Q2.totalWeight) * 100
            )
          : null,
      Q3:
        emp.quarterScores.Q3.totalWeight > 0
          ? Math.round(
              (emp.quarterScores.Q3.totalWeightedScore / emp.quarterScores.Q3.totalWeight) * 100
            )
          : null,
      Q4:
        emp.quarterScores.Q4.totalWeight > 0
          ? Math.round(
              (emp.quarterScores.Q4.totalWeightedScore / emp.quarterScores.Q4.totalWeight) * 100
            )
          : null,
    },
  }));

  res.json({ employees });
});

// ─── GET /api/analytics/completion-heatmap ────────────────────────────────────
// Returns check-in completion rates by department × quarter.
// Response: { departments, quarters, data: [{ department, quarter, rate }] }

analyticsRouter.get('/completion-heatmap', async (req: Request, res: Response) => {
  const parsed = completionHeatmapSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }

  const { cycleYear } = parsed.data;

  const sheetWhere: { cycle?: { year?: number } } = {};
  if (cycleYear) sheetWhere.cycle = { year: cycleYear };

  const sheets = await prisma.goalSheet.findMany({
    where: sheetWhere,
    include: {
      employee: {
        select: { department: true },
      },
      checkIns: {
        select: { quarter: true },
      },
    },
  });

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

  // Map: department → quarter → { total, completed }
  const heatmap = new Map<string, Record<string, { total: number; completed: number }>>();

  for (const sheet of sheets) {
    const dept = sheet.employee.department;
    if (!heatmap.has(dept)) {
      heatmap.set(
        dept,
        Object.fromEntries(quarters.map((q) => [q, { total: 0, completed: 0 }]))
      );
    }

    const deptEntry = heatmap.get(dept)!;
    const completedQuarters = new Set(sheet.checkIns.map((ci) => ci.quarter));

    for (const q of quarters) {
      deptEntry[q].total += 1;
      if (completedQuarters.has(q)) {
        deptEntry[q].completed += 1;
      }
    }
  }

  const departments = Array.from(heatmap.keys()).sort();
  const data: { department: string; quarter: string; rate: number }[] = [];

  for (const dept of departments) {
    const deptEntry = heatmap.get(dept)!;
    for (const q of quarters) {
      const { total, completed } = deptEntry[q];
      data.push({
        department: dept,
        quarter: q,
        rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      });
    }
  }

  res.json({ departments, quarters: [...quarters], data });
});

// ─── GET /api/analytics/goal-distribution ────────────────────────────────────
// Returns goal distribution by thrust area, UoM type, and status.
// Response: { byThrustArea, byUomType, byStatus }

analyticsRouter.get('/goal-distribution', async (req: Request, res: Response) => {
  const parsed = goalDistributionSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }

  const { cycleId, department } = parsed.data;

  const goalWhere: {
    goalSheet?: {
      cycleId?: string;
      employee?: { department?: string };
    };
  } = {};

  if (cycleId || department) {
    goalWhere.goalSheet = {};
    if (cycleId) goalWhere.goalSheet.cycleId = cycleId;
    if (department) goalWhere.goalSheet.employee = { department };
  }

  const goals = await prisma.goal.findMany({
    where: goalWhere,
    select: {
      thrustArea: true,
      uomType: true,
      status: true,
      weightage: true,
    },
  });

  // By thrust area
  const thrustMap = new Map<string, { count: number; totalWeightage: number }>();
  for (const goal of goals) {
    const key = goal.thrustArea;
    if (!thrustMap.has(key)) thrustMap.set(key, { count: 0, totalWeightage: 0 });
    const entry = thrustMap.get(key)!;
    entry.count += 1;
    entry.totalWeightage += Number(goal.weightage);
  }
  const byThrustArea = Array.from(thrustMap.entries())
    .map(([name, { count, totalWeightage }]) => ({
      name,
      count,
      weightage: Math.round(totalWeightage * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // By UoM type
  const uomMap = new Map<string, number>();
  for (const goal of goals) {
    uomMap.set(goal.uomType, (uomMap.get(goal.uomType) ?? 0) + 1);
  }
  const byUomType = Array.from(uomMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // By status
  const statusMap = new Map<string, number>();
  for (const goal of goals) {
    statusMap.set(goal.status, (statusMap.get(goal.status) ?? 0) + 1);
  }
  const byStatus = Array.from(statusMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  res.json({ byThrustArea, byUomType, byStatus });
});

// ─── GET /api/analytics/manager-effectiveness ────────────────────────────────
// Returns manager effectiveness ranked by check-in completion rate.
// Response: { managers: [{ name, directReports, completedCheckIns, pendingCheckIns, rate }] }

analyticsRouter.get('/manager-effectiveness', async (req: Request, res: Response) => {
  const parsed = managerEffectivenessSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }

  const { quarter, department } = parsed.data;

  // Fetch all managers who have subordinates
  const managers = await prisma.user.findMany({
    where: {
      role: 'MANAGER',
      subordinates: {
        some: department ? { department } : {},
      },
    },
    select: {
      id: true,
      name: true,
      subordinates: {
        where: department ? { department } : {},
        select: {
          id: true,
          goalSheets: {
            select: {
              checkIns: quarter
                ? { where: { quarter }, select: { quarter: true } }
                : { select: { quarter: true } },
            },
          },
        },
      },
    },
  });

  const result = managers.map((manager) => {
    const directReports = manager.subordinates.length;
    let completedCheckIns = 0;

    for (const sub of manager.subordinates) {
      for (const sheet of sub.goalSheets) {
        if (sheet.checkIns.length > 0) {
          completedCheckIns += 1;
        }
      }
    }

    // Total possible check-ins = directReports × sheets per employee
    // We count total sheets across all subordinates as the denominator
    const totalSheets = manager.subordinates.reduce(
      (sum, sub) => sum + sub.goalSheets.length,
      0
    );
    const pendingCheckIns = Math.max(0, totalSheets - completedCheckIns);
    const rate = totalSheets > 0 ? Math.round((completedCheckIns / totalSheets) * 100) : 0;

    return {
      name: manager.name,
      directReports,
      completedCheckIns,
      pendingCheckIns,
      rate,
    };
  });

  // Sort by rate descending
  result.sort((a, b) => b.rate - a.rate);

  res.json({ managers: result });
});
