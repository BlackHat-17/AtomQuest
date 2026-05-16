// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalInput {
  weightage: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a goal sheet's goals against the business rules:
 * - Maximum 8 goals per employee
 * - Each goal weightage must be between 10% and 100%
 * - Total weightage must equal exactly 100% (±0.01 tolerance)
 */
export function validateGoalSheet(goals: GoalInput[]): ValidationResult {
  const errors: string[] = [];

  if (goals.length > 8) {
    errors.push('Maximum 8 goals allowed per employee.');
  }

  for (const [i, goal] of goals.entries()) {
    if (goal.weightage < 10) {
      errors.push(`Goal ${i + 1}: Minimum weightage is 10%.`);
    }
    if (goal.weightage > 100) {
      errors.push(`Goal ${i + 1}: Weightage cannot exceed 100%.`);
    }
  }

  const total = goals.reduce((sum, g) => sum + g.weightage, 0);
  if (Math.abs(total - 100) > 0.01) {
    errors.push(`Total weightage must equal 100%. Current total: ${total.toFixed(2)}%.`);
  }

  return { valid: errors.length === 0, errors };
}
