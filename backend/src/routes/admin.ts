import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../middleware/authorize.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// ─── Validation schemas ───────────────────────────────────────────────────────

const createCycleSchema = z.object({
  year: z.number({ invalid_type_error: 'Year must be a number' }).int().min(2000).max(2100),
  phase: z.enum(['GOAL_SETTING', 'Q1', 'Q2', 'Q3', 'Q4']),
  windowOpen: z.string().min(1, 'Window open date is required'),
  windowClose: z.string().min(1, 'Window close date is required'),
  isActive: z.boolean().optional().default(false),
});

const updateCycleSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  phase: z.enum(['GOAL_SETTING', 'Q1', 'Q2', 'Q3', 'Q4']).optional(),
  windowOpen: z.string().min(1).optional(),
  windowClose: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const updateUserRoleSchema = z.object({
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']).optional(),
  managerId: z.string().uuid('Invalid manager ID').nullable().optional(),
});

// ─── POST /api/admin/cycles ───────────────────────────────────────────────────

adminRouter.post('/cycles', async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }

  const parsed = createCycleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }); return; }

  const { year, phase, windowOpen, windowClose, isActive } = parsed.data;

  if (isActive) {
    await prisma.goalCycle.updateMany({ where: { phase, isActive: true }, data: { isActive: false } });
  }

  const cycle = await prisma.goalCycle.create({
    data: { year, phase, windowOpen: new Date(windowOpen), windowClose: new Date(windowClose), isActive: isActive ?? false, createdById: req.user.id },
  });

  res.status(201).json(cycle);
});

// ─── PUT /api/admin/cycles/:id ────────────────────────────────────────────────

adminRouter.put('/cycles/:id', async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }

  const { id } = req.params;
  const parsed = updateCycleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }); return; }

  const existing = await prisma.goalCycle.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Cycle not found' }); return; }

  const { year, phase, windowOpen, windowClose, isActive } = parsed.data;
  const effectivePhase = phase ?? existing.phase;

  if (isActive === true) {
    await prisma.goalCycle.updateMany({ where: { phase: effectivePhase, isActive: true, id: { not: id } }, data: { isActive: false } });
  }

  const updateData: Record<string, unknown> = {};
  if (year !== undefined) updateData.year = year;
  if (phase !== undefined) updateData.phase = phase;
  if (windowOpen !== undefined) updateData.windowOpen = new Date(windowOpen);
  if (windowClose !== undefined) updateData.windowClose = new Date(windowClose);
  if (isActive !== undefined) updateData.isActive = isActive;

  if (existing.isActive || isActive === true) {
    await prisma.auditLog.create({
      data: { entityType: 'GoalCycle', entityId: id, userId: req.user.id, action: 'UPDATE', oldValue: existing as object, newValue: { ...existing, ...updateData } as object, timestamp: new Date() },
    });
  }

  const updated = await prisma.goalCycle.update({ where: { id }, data: updateData });
  res.json(updated);
});

// ─── GET /api/admin/cycles ────────────────────────────────────────────────────

adminRouter.get('/cycles', async (_req: Request, res: Response) => {
  const cycles = await prisma.goalCycle.findMany({ orderBy: [{ year: 'desc' }, { phase: 'asc' }] });
  res.json(cycles);
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

adminRouter.get('/users', async (req: Request, res: Response) => {
  const { role, department } = req.query;
  const where: Record<string, unknown> = {};
  if (role && typeof role === 'string' && ['EMPLOYEE', 'MANAGER', 'ADMIN'].includes(role)) where.role = role;
  if (department && typeof department === 'string') where.department = department;

  const users = await prisma.user.findMany({
    where,
    include: { manager: { select: { id: true, name: true, email: true } } },
    orderBy: [{ department: 'asc' }, { name: 'asc' }],
  });

  res.json(users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, department: u.department,
    managerId: u.managerId, managerName: u.manager?.name ?? null, managerEmail: u.manager?.email ?? null,
    azureAdId: u.azureAdId, createdAt: u.createdAt, updatedAt: u.updatedAt,
  })));
});

// ─── PUT /api/admin/users/:id/role ────────────────────────────────────────────

adminRouter.put('/users/:id/role', async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = updateUserRoleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }); return; }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'User not found' }); return; }

  const { role, managerId } = parsed.data;

  if (managerId) {
    const manager = await prisma.user.findUnique({ where: { id: managerId } });
    if (!manager) { res.status(400).json({ error: 'Manager not found' }); return; }
    if (managerId === id) { res.status(400).json({ error: 'A user cannot be their own manager' }); return; }
  }

  const updateData: Record<string, unknown> = {};
  if (role !== undefined) updateData.role = role;
  if (managerId !== undefined) updateData.managerId = managerId;

  const updated = await prisma.user.update({
    where: { id }, data: updateData,
    include: { manager: { select: { id: true, name: true, email: true } } },
  });

  res.json({
    id: updated.id, name: updated.name, email: updated.email, role: updated.role,
    department: updated.department, managerId: updated.managerId,
    managerName: updated.manager?.name ?? null, managerEmail: updated.manager?.email ?? null,
    azureAdId: updated.azureAdId, createdAt: updated.createdAt, updatedAt: updated.updatedAt,
  });
});
