/**
 * Integration tests for quarterly window enforcement (P9).
 * Validates: Requirements NFR-3, P9
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
    achievement: { upsert: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../services/notifyService.js', () => ({
  notifyService: { achievementUpdated: vi.fn().mockResolvedValue(undefined) },
}));

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
const EMPLOYEE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GOAL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SHEET_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeToken(id: string, role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN') {
  return jwt.sign({ id, email: `${role.toLowerCase()}@test.com`, role }, JWT_SECRET, { expiresIn: '1h' });
}

const employeeToken = makeToken(EMPLOYEE_ID, 'EMPLOYEE');

describe('Window enforcement integration tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('PUT /api/achievements/:goalId/:quarter', () => {
    it('returns 400 when no active window exists for the quarter (P9)', async () => {
      vi.mocked(prisma.goal.findUnique).mockResolvedValue({
        id: GOAL_ID, isLocked: true, uomType: 'NUMERIC_MIN', target: '100',
        goalSheet: { id: SHEET_ID, employeeId: EMPLOYEE_ID },
      } as any);
      vi.mocked(prisma.goalCycle.findFirst).mockResolvedValue(null);

      const res = await request(app).put(`/api/achievements/${GOAL_ID}/Q1`).set('Authorization', `Bearer ${employeeToken}`).send({ actual: '80' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/window.*not open|not open/i);
    });

    it('returns 200 when an active window exists for the quarter', async () => {
      const now = new Date();
      vi.mocked(prisma.goal.findUnique).mockResolvedValue({
        id: GOAL_ID, isLocked: true, uomType: 'NUMERIC_MIN', target: '100', isShared: false,
        goalSheet: { id: SHEET_ID, employeeId: EMPLOYEE_ID },
      } as any);
      vi.mocked(prisma.goalCycle.findFirst).mockResolvedValue({
        id: 'c1', phase: 'Q1', isActive: true,
        windowOpen: new Date(now.getTime() - 86400000),
        windowClose: new Date(now.getTime() + 86400000),
      } as any);
      vi.mocked(prisma.achievement.upsert).mockResolvedValue({ id: 'a1', goalId: GOAL_ID, quarter: 'Q1', actual: '80', score: 0.8 } as any);
      vi.mocked(prisma.goal.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: EMPLOYEE_ID, managerId: null } as any);

      const res = await request(app).put(`/api/achievements/${GOAL_ID}/Q1`).set('Authorization', `Bearer ${employeeToken}`).send({ actual: '80' });
      expect(res.status).toBe(200);
      expect(res.body.actual).toBe('80');
    });

    it('returns 400 for an invalid quarter value', async () => {
      const res = await request(app).put(`/api/achievements/${GOAL_ID}/Q5`).set('Authorization', `Bearer ${employeeToken}`).send({ actual: '80' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid quarter/i);
    });
  });
});
