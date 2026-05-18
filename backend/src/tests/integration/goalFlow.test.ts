/**
 * Integration tests for goal submission → approval → lock flow.
 * Validates: Requirements US-E2, US-M2, US-M4, P10
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
    goalSheet: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    goal: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    goalCycle: { findFirst: vi.fn() },
  },
}));

vi.mock('../../services/notifyService.js', () => ({
  notifyService: {
    goalSubmitted: vi.fn().mockResolvedValue(undefined),
    goalApproved: vi.fn().mockResolvedValue(undefined),
    goalReworked: vi.fn().mockResolvedValue(undefined),
    achievementUpdated: vi.fn().mockResolvedValue(undefined),
  },
}));

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!';
const EMPLOYEE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MANAGER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SHEET_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeToken(id: string, role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN') {
  return jwt.sign({ id, email: `${role.toLowerCase()}@test.com`, role }, JWT_SECRET, { expiresIn: '1h' });
}

const employeeToken = makeToken(EMPLOYEE_ID, 'EMPLOYEE');
const managerToken = makeToken(MANAGER_ID, 'MANAGER');

describe('Goal flow integration tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('POST /api/goals/:sheetId/submit', () => {
    it('returns 200 with SUBMITTED status when sheet is valid', async () => {
      const mockSheet = {
        id: SHEET_ID, employeeId: EMPLOYEE_ID, status: 'DRAFT',
        goals: [{ id: 'g1', weightage: 60 }, { id: 'g2', weightage: 40 }],
      };
      const updatedSheet = { ...mockSheet, status: 'SUBMITTED', submittedAt: new Date().toISOString(), goals: mockSheet.goals, cycle: { id: 'c1', year: 2025, phase: 'GOAL_SETTING' } };

      vi.mocked(prisma.goalSheet.findUnique).mockResolvedValue(mockSheet as any);
      vi.mocked(prisma.goalSheet.update).mockResolvedValue(updatedSheet as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: EMPLOYEE_ID, managerId: MANAGER_ID } as any);

      const res = await request(app).post(`/api/goals/${SHEET_ID}/submit`).set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SUBMITTED');
    });

    it('returns 400 with errors when weightage is invalid', async () => {
      const mockSheet = {
        id: SHEET_ID, employeeId: EMPLOYEE_ID, status: 'DRAFT',
        goals: [{ id: 'g1', weightage: 5 }, { id: 'g2', weightage: 40 }],
      };
      vi.mocked(prisma.goalSheet.findUnique).mockResolvedValue(mockSheet as any);

      const res = await request(app).post(`/api/goals/${SHEET_ID}/submit`).set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(Array.isArray(res.body.errors)).toBe(true);
    });
  });

  describe('POST /api/goals/:sheetId/approve', () => {
    it('returns 200 with LOCKED status when sheet is SUBMITTED', async () => {
      const mockSheet = {
        id: SHEET_ID, status: 'SUBMITTED',
        employee: { id: EMPLOYEE_ID, managerId: MANAGER_ID },
        goals: [{ id: 'g1', weightage: 60 }, { id: 'g2', weightage: 40 }],
      };
      const updatedSheet = { ...mockSheet, status: 'LOCKED', approvedAt: new Date().toISOString(), approvedById: MANAGER_ID, goals: mockSheet.goals.map(g => ({ ...g, isLocked: true })), cycle: { id: 'c1', year: 2025, phase: 'GOAL_SETTING' } };

      vi.mocked(prisma.goalSheet.findUnique).mockResolvedValue(mockSheet as any);
      vi.mocked(prisma.goal.updateMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.goalSheet.update).mockResolvedValue(updatedSheet as any);

      const res = await request(app).post(`/api/goals/${SHEET_ID}/approve`).set('Authorization', `Bearer ${managerToken}`).send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('LOCKED');
    });

    it('returns 400 when sheet is already LOCKED (P10 idempotency)', async () => {
      const mockSheet = {
        id: SHEET_ID, status: 'LOCKED',
        employee: { id: EMPLOYEE_ID, managerId: MANAGER_ID },
        goals: [{ id: 'g1', weightage: 60 }, { id: 'g2', weightage: 40 }],
      };
      vi.mocked(prisma.goalSheet.findUnique).mockResolvedValue(mockSheet as any);

      const res = await request(app).post(`/api/goals/${SHEET_ID}/approve`).set('Authorization', `Bearer ${managerToken}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/SUBMITTED/i);
    });
  });

  describe('POST /api/goals/:sheetId/rework', () => {
    it('returns 200 with REWORK status when sheet is SUBMITTED', async () => {
      const mockSheet = { id: SHEET_ID, status: 'SUBMITTED', employee: { id: EMPLOYEE_ID, managerId: MANAGER_ID } };
      const updatedSheet = { ...mockSheet, status: 'REWORK', reworkComment: 'Please revise.', goals: [], cycle: { id: 'c1', year: 2025, phase: 'GOAL_SETTING' } };

      vi.mocked(prisma.goalSheet.findUnique).mockResolvedValue(mockSheet as any);
      vi.mocked(prisma.goalSheet.update).mockResolvedValue(updatedSheet as any);

      const res = await request(app).post(`/api/goals/${SHEET_ID}/rework`).set('Authorization', `Bearer ${managerToken}`).send({ comment: 'Please revise.' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REWORK');
    });
  });
});
