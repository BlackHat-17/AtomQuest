import { useState, useCallback } from 'react';
import api from '../lib/api';
import type { Achievement, Goal, GoalStatus, Quarter } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalWithAchievements extends Goal {
  achievements: Achievement[];
}

interface AchievementsResponse {
  goals: GoalWithAchievements[];
}

interface UseAchievementsReturn {
  goals: GoalWithAchievements[];
  loading: boolean;
  error: string | null;
  fetchAchievements: (sheetId: string) => Promise<void>;
  updateAchievement: (
    goalId: string,
    quarter: Quarter,
    actual: string,
    status?: GoalStatus
  ) => Promise<Achievement>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages achievement state for a goal sheet.
 * Fetches all goals with their achievements and provides an update function.
 */
export function useAchievements(): UseAchievementsReturn {
  const [goals, setGoals] = useState<GoalWithAchievements[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Fetch achievements for a sheet ─────────────────────────────────────────

  const fetchAchievements = useCallback(async (sheetId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AchievementsResponse>(`/achievements/${sheetId}`);
      setGoals(data.goals);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load achievements';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Update a single achievement ─────────────────────────────────────────────

  const updateAchievement = useCallback(
    async (
      goalId: string,
      quarter: Quarter,
      actual: string,
      status?: GoalStatus
    ): Promise<Achievement> => {
      const { data: achievement } = await api.put<Achievement>(
        `/achievements/${goalId}/${quarter}`,
        { actual, ...(status ? { status } : {}) }
      );

      // Optimistically update local state
      setGoals((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;

          const existingIdx = goal.achievements.findIndex((a) => a.quarter === quarter);
          const updatedAchievements =
            existingIdx >= 0
              ? goal.achievements.map((a, i) => (i === existingIdx ? achievement : a))
              : [...goal.achievements, achievement];

          return {
            ...goal,
            achievements: updatedAchievements,
            ...(status ? { status } : {}),
          };
        })
      );

      return achievement;
    },
    []
  );

  return {
    goals,
    loading,
    error,
    fetchAchievements,
    updateAchievement,
  };
}
