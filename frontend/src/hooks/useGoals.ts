import { useState, useCallback } from 'react';
import api from '../lib/api';
import type { Goal, GoalSheet, GoalFormData } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseGoalsReturn {
  sheet: GoalSheet | null;
  loading: boolean;
  error: string | null;
  fetchMySheet: () => Promise<void>;
  fetchSheet: (sheetId: string) => Promise<void>;
  createGoal: (data: GoalFormData) => Promise<Goal>;
  updateGoal: (goalId: string, data: Partial<GoalFormData>) => Promise<Goal>;
  deleteGoal: (goalId: string) => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages goal CRUD state for the current user's goal sheet.
 * Calls the /api/goals endpoints and handles loading/error states.
 */
export function useGoals(): UseGoalsReturn {
  const [sheet, setSheet] = useState<GoalSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Fetch current user's active sheet ──────────────────────────────────────

  const fetchMySheet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<GoalSheet>('/goals/my-sheet');
      setSheet(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load goal sheet';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch a specific sheet by ID ────────────────────────────────────────────

  const fetchSheet = useCallback(async (sheetId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<GoalSheet>(`/goals/${sheetId}`);
      setSheet(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load goal sheet';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Create a goal ───────────────────────────────────────────────────────────

  const createGoal = useCallback(
    async (data: GoalFormData): Promise<Goal> => {
      setLoading(true);
      setError(null);
      try {
        const { data: goal } = await api.post<Goal>('/goals', data);
        // Optimistically update local sheet state
        setSheet((prev) =>
          prev ? { ...prev, goals: [...prev.goals, goal] } : prev
        );
        return goal;
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to create goal';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ─── Update a goal ───────────────────────────────────────────────────────────

  const updateGoal = useCallback(
    async (goalId: string, data: Partial<GoalFormData>): Promise<Goal> => {
      setLoading(true);
      setError(null);
      try {
        const { data: updated } = await api.put<Goal>(`/goals/${goalId}`, data);
        // Optimistically update local sheet state
        setSheet((prev) =>
          prev
            ? {
                ...prev,
                goals: prev.goals.map((g) => (g.id === goalId ? updated : g)),
              }
            : prev
        );
        return updated;
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to update goal';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ─── Delete a goal ───────────────────────────────────────────────────────────

  const deleteGoal = useCallback(async (goalId: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/goals/${goalId}`);
      // Optimistically remove from local sheet state
      setSheet((prev) =>
        prev
          ? { ...prev, goals: prev.goals.filter((g) => g.id !== goalId) }
          : prev
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to delete goal';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    sheet,
    loading,
    error,
    fetchMySheet,
    fetchSheet,
    createGoal,
    updateGoal,
    deleteGoal,
  };
}
