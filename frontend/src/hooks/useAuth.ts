import { useState, useCallback } from 'react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  department: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function readUserFromStorage(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Provides authentication state and actions.
 *
 * - `user`: the currently authenticated user (from localStorage), or null
 * - `login(email, password)`: POST to /api/auth/login, stores token + user
 * - `logout()`: POST to /api/auth/logout, clears localStorage
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(readUserFromStorage);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors — clear local state regardless
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      setUser(null);
    }
  }, []);

  return { user, login, logout };
}
