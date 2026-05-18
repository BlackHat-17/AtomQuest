/**
 * Unit tests for validateGoalSheet()
 * Validates: Requirements P1, P2, P3 (NFR-1)
 */

import { describe, it, expect } from 'vitest';
import { validateGoalSheet } from '../lib/validation.js';

describe('validateGoalSheet', () => {
  // ─── Happy path ─────────────────────────────────────────────────────────────

  it('passes with valid goals summing to 100%', () => {
    const result = validateGoalSheet([{ weightage: 40 }, { weightage: 35 }, { weightage: 25 }]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes with exactly 8 goals', () => {
    const result = validateGoalSheet(Array.from({ length: 8 }, () => ({ weightage: 12.5 })));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes with exactly 1 goal at 100%', () => {
    const result = validateGoalSheet([{ weightage: 100 }]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ─── Goal count ──────────────────────────────────────────────────────────────

  it('fails when more than 8 goals', () => {
    const goals = Array.from({ length: 9 }, (_, i) => ({ weightage: i < 8 ? 11 : 12 }));
    const result = validateGoalSheet(goals);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Maximum 8 goals allowed per employee.');
  });

  it('fails when 0 goals (total = 0, not 100)', () => {
    const result = validateGoalSheet([]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Total weightage must equal 100%'))).toBe(true);
  });

  // ─── Minimum weightage ───────────────────────────────────────────────────────

  it('fails when any goal has weightage < 10%', () => {
    const result = validateGoalSheet([{ weightage: 5 }, { weightage: 95 }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Minimum weightage is 10%'))).toBe(true);
  });

  it('fails when any goal has weightage = 9.99%', () => {
    const result = validateGoalSheet([{ weightage: 9.99 }, { weightage: 90.01 }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Minimum weightage is 10%'))).toBe(true);
  });

  it('passes when all goals have weightage = 10%', () => {
    const result = validateGoalSheet([
      { weightage: 10 }, { weightage: 10 }, { weightage: 10 },
      { weightage: 10 }, { weightage: 10 }, { weightage: 50 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ─── Total weightage ─────────────────────────────────────────────────────────

  it('fails when total < 100%', () => {
    const result = validateGoalSheet([{ weightage: 40 }, { weightage: 40 }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Total weightage must equal 100%'))).toBe(true);
  });

  it('fails when total > 100%', () => {
    const result = validateGoalSheet([{ weightage: 60 }, { weightage: 60 }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Total weightage must equal 100%'))).toBe(true);
  });

  it('passes when total is exactly 100% (floating point tolerance)', () => {
    const result = validateGoalSheet([
      { weightage: 33.33 }, { weightage: 33.33 }, { weightage: 33.34 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes when total is 100.005% (within tolerance)', () => {
    const result = validateGoalSheet([{ weightage: 50 }, { weightage: 50.005 }]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when total is 100.02% (outside tolerance)', () => {
    const result = validateGoalSheet([{ weightage: 50 }, { weightage: 50.02 }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Total weightage must equal 100%'))).toBe(true);
  });

  // ─── Multiple errors ─────────────────────────────────────────────────────────

  it('returns multiple errors when multiple rules violated', () => {
    const goals = Array.from({ length: 9 }, (_, i) => ({ weightage: i === 0 ? 5 : 10 }));
    const result = validateGoalSheet(goals);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toContain('Maximum 8 goals allowed per employee.');
    expect(result.errors.some((e) => e.includes('Minimum weightage is 10%'))).toBe(true);
  });
});
