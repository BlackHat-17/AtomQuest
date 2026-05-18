/**
 * escalation.ts
 *
 * Routes for managing EscalationRules and EscalationLogs.
 * All routes require ADMIN role (enforced in app.ts mount).
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// ─── Routers ──────────────────────────────────────────────────────────────────

export const escalationRulesRouter = Router();
export const escalationLogsRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const chainLevelSchema = z.enum(['EMPLOYEE', 'MANAGER', 'SKIP_LEVEL', 'HR']);

const createRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  triggerType: z.enum(['GOAL_NOT_SUBMITTED', 'GOAL_NOT_APPROVED', 'CHECKIN_NOT_COMPLETED']),
  thresholdDays: z.number({ invalid_type_error: 'thresholdDays must be a number' }).int().min(1),
  intervalDays: z.number({ invalid_type_error: 'intervalDays must be a number' }).int().min(1).default(1),
  chain: z.array(chainLevelSchema).min(1, 'Chain must have at least one level'),
  isActive: z.boolean().optional().default(true),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  triggerType: z.enum(['GOAL_NOT_SUBMITTED', 'GOAL_NOT_APPROVED', 'CHECKIN_NOT_COMPLETED']).optional(),
  thresholdDays: z.number().int().min(1).optional(),
  intervalDays: z.number().int().min(1).optional(),
  chain: z.array(chainLevelSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});

// ─── GET /api/admin/escalation-rules ─────────────────────────────────────────

escalationRulesRouter.get('/', async (_req: Request, res: Response) => {
  const rules = await prisma.escalationRule.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  res.json(rules);
});

// ─── POST /api/admin/escalation-rules ────────────────────────────────────────

escalationRulesRouter.post('/', async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }

  const parsed = createRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { name, triggerType, thresholdDays, intervalDays, chain, isActive } = parsed.data;

  const rule = await prisma.escalationRule.create({
    data: {
      name,
      triggerType,
      thresholdDays,
      intervalDays,
      chain,
      isActive: isActive ?? true,
      createdById: req.user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.status(201).json(rule);
});

// ─── PUT /api/admin/escalation-rules/:id ─────────────────────────────────────

escalationRulesRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = updateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const existing = await prisma.escalationRule.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Escalation rule not found' }); return; }

  const updated = await prisma.escalationRule.update({
    where: { id },
    data: parsed.data,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.json(updated);
});

// ─── DELETE /api/admin/escalation-rules/:id ───────────────────────────────────

escalationRulesRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.escalationRule.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Escalation rule not found' }); return; }

  await prisma.escalationRule.delete({ where: { id } });
  res.status(204).send();
});

// ─── GET /api/admin/escalation-logs ──────────────────────────────────────────

escalationLogsRouter.get('/', async (req: Request, res: Response) => {
  const { status, ruleType, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where: Record<string, unknown> = {};

  if (status && typeof status === 'string' && ['PENDING', 'RESOLVED', 'IGNORED'].includes(status)) {
    where.status = status;
  }

  if (ruleType && typeof ruleType === 'string') {
    where.rule = { triggerType: ruleType };
  }

  const [logs, total] = await Promise.all([
    prisma.escalationLog.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { triggeredAt: 'desc' },
      include: {
        rule: { select: { id: true, name: true, triggerType: true } },
        targetUser: { select: { id: true, name: true, email: true } },
        notifiedUser: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.escalationLog.count({ where }),
  ]);

  res.json({ data: logs, total, page: pageNum, limit: limitNum });
});

// ─── PUT /api/admin/escalation-logs/:id/resolve ───────────────────────────────

escalationLogsRouter.put('/:id/resolve', async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.escalationLog.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Escalation log entry not found' }); return; }

  if (existing.status !== 'PENDING') {
    res.status(400).json({ error: 'Only PENDING log entries can be resolved' });
    return;
  }

  const updated = await prisma.escalationLog.update({
    where: { id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
    include: {
      rule: { select: { id: true, name: true, triggerType: true } },
      targetUser: { select: { id: true, name: true, email: true } },
      notifiedUser: { select: { id: true, name: true, email: true } },
    },
  });

  res.json(updated);
});
