import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/authorize.js';
import {
  generateAchievementExcel,
  generateAchievementCsv,
  type AchievementReportRow,
} from '../services/exportService.js';

export const reportsRouter = Router();

// All reports endpoints require ADMIN role
reportsRouter.use(requireAdmin);

// ─── Validation schemas ───────────────────────────────────────────────────────

const achievementQuerySchema = z.object({
  cycleId: z.string().uuid().optional(),
  department: z.string().optional(),
  managerId: z.string().uuid().optional(),
  format: z.enum(['json', 'excel', 'csv']).optional().default('json'),
});

const completionQuerySchema = z.object({
  cycleId: z.string().uuid().optional(),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
});

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  userId: z.string().uuid().optional(),
  entityType: z.string().optional(),
});

// ─── GET /api/reports/achievement ────────────────────────────────────────────
// Returns achievement data for all goal sheets, with optional filters.
// Supports ?format=excel and ?format=csv for file downloads.

reportsRouter.get('/achievement', async (req: Request, res: Response) => {
  const parsed = achievementQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }

  const { cycleId, department, managerId, format } = parsed.data;

  // Build where clause for GoalSheet
  const where: {
    cycleId?: string;
    employee?: {
      department?: string;
      managerId?: string;
    };
  } = {};

  if (cycleId) where.cycleId = cycleId;

  if (department || managerId) {
    where.employee = {};
    if (department) where.employee.department = department;
    if (managerId) where.employee.managerId = managerId;
  }

  const sheets = await prisma.goalSheet.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          department: true,
        },
      },
      goals: {
        include: {
          achievements: {
            orderBy: { quarter: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ employee: { department: 'asc' } }, { employee: { name: 'asc' } }],
  });

  // Build structured response
  const structured = sheets.map((sheet) => ({
    employee: sheet.employee.name,
    department: sheet.employee.department,
    employeeId: sheet.employee.id,
    goals: sheet.goals.map((goal) => {
      const byQ = Object.fromEntries(goal.achievements.map((a) => [a.quarter, a]));
      return {
        id: goal.id,
        title: goal.title,
        thrustArea: goal.thrustArea,
        uomType: goal.uomType,
        target: goal.target,
        weightage: Number(goal.weightage),
        achievements: {
          Q1: byQ['Q1']?.actual ?? null,
          Q2: byQ['Q2']?.actual ?? null,
          Q3: byQ['Q3']?.actual ?? null,
          Q4: byQ['Q4']?.actual ?? null,
        },
      };
    }),
  }));

  // Flatten to rows for export
  const rows: AchievementReportRow[] = [];
  for (const sheet of structured) {
    for (const goal of sheet.goals) {
      const q4Score = (() => {
        const q4Achievement = sheets
          .flatMap((s) => s.goals)
          .find((g) => g.id === goal.id)
          ?.achievements.find((a) => a.quarter === 'Q4');
        return q4Achievement
          ? `${(Number(q4Achievement.score) * 100).toFixed(1)}%`
          : undefined;
      })();

      rows.push({
        employee: sheet.employee,
        department: sheet.department,
        title: goal.title,
        thrustArea: goal.thrustArea,
        uomType: goal.uomType,
        target: goal.target,
        weightage: goal.weightage,
        achievements: {
          Q1: goal.achievements.Q1 ?? undefined,
          Q2: goal.achievements.Q2 ?? undefined,
          Q3: goal.achievements.Q3 ?? undefined,
          Q4: goal.achievements.Q4 ?? undefined,
          Q4Score: q4Score,
        },
      });
    }
  }

  if (format === 'excel') {
    const buffer = await generateAchievementExcel(rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="achievement-report-${Date.now()}.xlsx"`
    );
    res.send(buffer);
    return;
  }

  if (format === 'csv') {
    const csv = generateAchievementCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="achievement-report-${Date.now()}.csv"`
    );
    res.send(csv);
    return;
  }

  // Default: JSON response
  res.json(structured);
});

// ─── GET /api/reports/completion ─────────────────────────────────────────────
// Aggregate check-in completion rates by department and manager.

reportsRouter.get('/completion', async (req: Request, res: Response) => {
  const parsed = completionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }

  const { cycleId, quarter } = parsed.data;

  // Build where clause for GoalSheet
  const sheetWhere: { cycleId?: string } = {};
  if (cycleId) sheetWhere.cycleId = cycleId;

  // Fetch all goal sheets with employee and check-in data
  const sheets = await prisma.goalSheet.findMany({
    where: sheetWhere,
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          department: true,
          managerId: true,
          manager: {
            select: { id: true, name: true },
          },
        },
      },
      checkIns: quarter
        ? { where: { quarter } }
        : true,
    },
  });

  // ── By Department ──────────────────────────────────────────────────────────

  const deptMap = new Map<
    string,
    { total: number; completed: number }
  >();

  for (const sheet of sheets) {
    const dept = sheet.employee.department;
    if (!deptMap.has(dept)) {
      deptMap.set(dept, { total: 0, completed: 0 });
    }
    const entry = deptMap.get(dept)!;
    entry.total += 1;
    // A sheet is "completed" if it has at least one check-in (for the filtered quarter, if any)
    if (sheet.checkIns.length > 0) {
      entry.completed += 1;
    }
  }

  const byDepartment = Array.from(deptMap.entries())
    .map(([department, { total, completed }]) => ({
      department,
      total,
      completed,
      rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    }))
    .sort((a, b) => a.department.localeCompare(b.department));

  // ── By Manager ────────────────────────────────────────────────────────────

  const managerMap = new Map<
    string,
    { managerName: string; total: number; completed: number }
  >();

  for (const sheet of sheets) {
    const managerId = sheet.employee.managerId;
    const managerName = sheet.employee.manager?.name ?? 'No Manager';
    const key = managerId ?? 'no-manager';

    if (!managerMap.has(key)) {
      managerMap.set(key, { managerName, total: 0, completed: 0 });
    }
    const entry = managerMap.get(key)!;
    entry.total += 1;
    if (sheet.checkIns.length > 0) {
      entry.completed += 1;
    }
  }

  const byManager = Array.from(managerMap.entries())
    .map(([managerId, { managerName, total, completed }]) => ({
      managerId,
      managerName,
      total,
      completed,
      rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  res.json({ byDepartment, byManager });
});

// ─── GET /api/reports/audit ───────────────────────────────────────────────────
// Paginated, filterable audit log.

reportsRouter.get('/audit', async (req: Request, res: Response) => {
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }

  const { page, limit, startDate, endDate, userId, entityType } = parsed.data;

  // Build where clause
  const where: {
    userId?: string;
    entityType?: string;
    timestamp?: { gte?: Date; lte?: Date };
  } = {};

  if (userId) where.userId = userId;
  if (entityType) where.entityType = entityType;

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp.gte = new Date(startDate);
    if (endDate) {
      // Include the full end date by setting to end of day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.timestamp.lte = end;
    }
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ data, total, page, limit });
});
