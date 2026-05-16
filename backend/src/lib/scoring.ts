// ─── Types ────────────────────────────────────────────────────────────────────

export type UomType = 'NUMERIC_MIN' | 'NUMERIC_MAX' | 'TIMELINE' | 'ZERO';

// ─── Score Computation ────────────────────────────────────────────────────────

/**
 * Computes a progress score (0.0 – 2.0) for a goal based on its UoM type,
 * target value, and actual achievement.
 *
 * - NUMERIC_MIN: higher actual is better (e.g. revenue). Score = actual / target, capped at 2.
 * - NUMERIC_MAX: lower actual is better (e.g. cost, TAT). Score = target / actual, capped at 2.
 * - TIMELINE: completed on or before deadline = 1.0; partial credit for late completion.
 * - ZERO: actual === 0 → 1.0 (success); actual > 0 → 0.0 (failure).
 */
export function computeScore(
  uomType: UomType,
  target: string,
  actual: string
): number {
  switch (uomType) {
    case 'NUMERIC_MIN': {
      // Higher is better: Sales Revenue, Units Sold
      const t = parseFloat(target);
      const a = parseFloat(actual);
      if (t === 0) return 0;
      return Math.min(a / t, 2); // cap at 200%
    }

    case 'NUMERIC_MAX': {
      // Lower is better: TAT, Cost
      const t = parseFloat(target);
      const a = parseFloat(actual);
      if (a === 0) return 1; // achieved zero cost = perfect
      return Math.min(t / a, 2);
    }

    case 'TIMELINE': {
      // Date-based: completed on or before deadline = 100%
      const deadline = new Date(target).getTime();
      const completed = new Date(actual).getTime();
      if (completed <= deadline) return 1;
      // Partial credit: penalise by days late
      const daysLate = (completed - deadline) / (1000 * 60 * 60 * 24);
      return Math.max(0, 1 - daysLate / 30); // lose ~3.3% per day late
    }

    case 'ZERO': {
      // Zero = success (e.g., safety incidents)
      const a = parseFloat(actual);
      return a === 0 ? 1 : 0;
    }

    default:
      return 0;
  }
}
