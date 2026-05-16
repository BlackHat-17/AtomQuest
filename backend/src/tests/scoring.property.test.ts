/**
 * Property-based tests for computeScore()
 *
 * **Validates: Requirements P4, P5, P6, P9**
 *
 * Uses fast-check to verify universal properties hold across all inputs.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeScore } from '../lib/scoring.js';

describe('computeScore — property-based tests', () => {
  // P4: NUMERIC_MIN monotonicity — higher actual → higher or equal score
  it('P4: NUMERIC_MIN — score increases as actual increases', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.01, max: 1000, noNaN: true }),  // target
        fc.float({ min: 0, max: 2000, noNaN: true }),      // actual1
        fc.float({ min: 0, max: 2000, noNaN: true }),      // actual2
        (target, a1, a2) => {
          const score1 = computeScore('NUMERIC_MIN', String(target), String(a1));
          const score2 = computeScore('NUMERIC_MIN', String(target), String(a2));
          if (a2 > a1) {
            expect(score2).toBeGreaterThanOrEqual(score1 - 0.0001);
          }
        }
      )
    );
  });

  // P5: NUMERIC_MAX monotonicity — lower actual → higher or equal score
  it('P5: NUMERIC_MAX — score increases as actual decreases', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.01, max: 1000, noNaN: true }),
        fc.float({ min: 0.01, max: 2000, noNaN: true }),
        fc.float({ min: 0.01, max: 2000, noNaN: true }),
        (target, a1, a2) => {
          const score1 = computeScore('NUMERIC_MAX', String(target), String(a1));
          const score2 = computeScore('NUMERIC_MAX', String(target), String(a2));
          if (a2 < a1) {
            expect(score2).toBeGreaterThanOrEqual(score1 - 0.0001);
          }
        }
      )
    );
  });

  // P6: ZERO binary — score is exactly 1 when actual=0, exactly 0 when actual>0
  it('P6: ZERO — binary score', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.01, max: 1000, noNaN: true }),
        (actual) => {
          expect(computeScore('ZERO', '0', String(actual))).toBe(0);
        }
      )
    );
    expect(computeScore('ZERO', '0', '0')).toBe(1);
  });

  // Score is always in [0, 2] range for all UoM types
  it('score is always in [0, 2] range', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('NUMERIC_MIN', 'NUMERIC_MAX', 'TIMELINE', 'ZERO' as const),
        fc.float({ min: 0.01, max: 1000, noNaN: true }),
        fc.float({ min: 0, max: 2000, noNaN: true }),
        (uomType, target, actual) => {
          const score = computeScore(uomType as any, String(target), String(actual));
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(2);
        }
      )
    );
  });

  // TIMELINE: on-time completion always scores 1.0
  it('TIMELINE — on-time completion scores exactly 1.0', () => {
    const deadline = '2025-12-31';
    expect(computeScore('TIMELINE', deadline, '2025-12-31')).toBe(1);
    expect(computeScore('TIMELINE', deadline, '2025-01-01')).toBe(1);
  });
});
