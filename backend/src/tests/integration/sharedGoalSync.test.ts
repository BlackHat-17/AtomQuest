/**
 * Integration tests for shared goal achievement sync (P8).
 * Validates: Requirements US-E6, US-M6, P8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-at-least-32-chars!!';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    goal: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    goalCycle: { findFirst: vi.fn() },
    achievement: { upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../services/notifyService.js', () => ({
  notifyService: { achievementUpdated: vi.fn().mockResolvedValue(undefined) },
}));

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
const PRIMARY_OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LINKED_EMPLOYEE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PRIMARY_GOAL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const LINKED_GOAL_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PRIMARY_SHEET_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeToken(id: string, role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN') {
  return jwt.sign({ id, email: `${role.toLowerCase()}@test.com`, role }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Shared goal achievement sync integration tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('PUT /api/achievements/:goalId/:quarter — shared goal sync', () => {
    it('syncs achievement to linked employee when primary owner updates (P8)', async () => {
      const now = new Date();
      vi.mocked(prisma.goal.findUnique).mockResolvedValue({
        id: PRIMARY_GOAL_ID, isLocked: true, isShared: false,
        uomType: 'NUMERIC_MIN', target: '100',
        goalSheet: { id: PRIMARY_SHEET_ID, employeeId: PRIMARY_OWNER_ID },
      } as any);
      vi.mocked(prisma.goalCycle.findFirst).mockResolvedValue({
        id: 'c1', phase: 'Q2', isActive: true,
        windowOpen: new Date(now.getTime() - 86400000),
        windowClose: new Date(now.getTime() + 86400000),
      } as any);
      vi.mocked(prisma.achievement.upsert).mockResolvedValue({ id: 'a1', goalId: PRIMARY_GOAL_ID, quarter: 'Q2', actual: '75', score: 0.75 } as any);
      vi.mocked(prisma.goal.findMany).mockResolvedValue([{
        id: LINKED_GOAL_ID, isShared: true, sharedFromId: PRIMARY_GOAL_ID,
        goalSheet: { employeeId: LINKED_EMPLOYEE_ID },
      }] as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: PRIMARY_OWNER_ID, managerId: null } as any);

      const primaryToken = makeToken(PRIMARY_OWNER_ID, 'EMPLOYEE');
      const res = await request(app).put(`/api/achievements/${PRIMARY_GOAL_ID}/Q2`).set('Authorization', `Bearer ${primaryToken}`).send({ actual: '75' });

      expect(res.status).toBe(200);
      expect(res.body.actual).toBe('75');

      const upsertCalls = vi.mocked(prisma.achievement.upsert).mock.calls;
      expect(upsertCalls.length).toBe(2);
      expect(upsertCalls[0][0].where).toEqual({ goalId_quarter: { goalId: PRIMARY_GOAL_ID, quarter: 'Q2' } });
      expect(upsertCalls[1][0].where).toEqual({ goalId_quarter: { goalId: LINKED_GOAL_ID, quarter: 'Q2' } });
      expect(upsertCalls[1][0].create.actual).toBe('75');
    });

    it('does NOT sync when the goal is a shared copy (not the primary owner)', async () => {
      const now = new Date();
      vi.mocked(prisma.goal.findUnique).mockResolvedValue({
        id: LINKED_GOAL_ID, isLocked: true, isShared: true,
        uomType: 'NUMERIC_MIN', target: '100',
        goalSheet: { id: 'linked-sheet', employeeId: LINKED_EMPLOYEE_ID },
      } as any);
      vi.mocked(prisma.goalCycle.findFirst).mockResolvedValue({
        id: 'c1', phase: 'Q2', isActive: true,
        windowOpen: new Date(now.getTime() - 86400000),
        windowClose: new Date(now.getTime() + 86400000),
      } as any);
      vi.mocked(prisma.achievement.upsert).mockResolvedValue({ id: 'a2', goalId: LINKED_GOAL_ID, quarter: 'Q2', actual: '60', score: 0.6 } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: LINKED_EMPLOYEE_ID, managerId: null } as any);

      const linkedToken = makeToken(LINKED_EMPLOYEE_ID, 'EMPLOYEE');
      const res = await request(app).put(`/api/achievements/${LINKED_GOAL_ID}/Q2`).set('Authorization', `Bearer ${linkedToken}`).send({ actual: '60' });

      expect(res.status).toBe(200);
      const upsertCalls = vi.mocked(prisma.achievement.upsert).mock.calls;
      expect(upsertCalls.length).toBe(1);
      expect(upsertCalls[0][0].where).toEqual({ goalId_quarter: { goalId: LINKED_GOAL_ID, quarter: 'Q2' } });
    });
  });
});
