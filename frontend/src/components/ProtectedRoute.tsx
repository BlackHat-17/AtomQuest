import { Navigate, Outlet } from 'react-router-dom';
import type { AuthUser } from '../hooks/useAuth';

// ─── Role-based default routes ────────────────────────────────────────────────

function getDefaultRoute(role: AuthUser['role']): string {
  switch (role) {
    case 'EMPLOYEE':
      return '/employee/goals';
    case 'MANAGER':
      return '/manager/dashboard';
    case 'ADMIN':
      return '/admin/cycles';
    default:
      return '/login';
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  /** If provided, only users with one of these roles can access the route. */
  allowedRoles?: AuthUser['role'][];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Wraps a set of routes with authentication and optional role-based access control.
 *
 * - If no `accessToken` is in localStorage → redirect to `/login`
 * - If `allowedRoles` is provided and the user's role is not in the list
 *   → redirect to the user's default page
 * - Otherwise → render `<Outlet />`
 */
export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const token = localStorage.getItem('accessToken');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    let user: AuthUser | null = null;
    try {
      const raw = localStorage.getItem('user');
      user = raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return <Navigate to="/login" replace />;
    }

    if (!user) {
      return <Navigate to="/login" replace />;
    }

    if (!allowedRoles.includes(user.role)) {
      return <Navigate to={getDefaultRoute(user.role)} replace />;
    }
  }

  return <Outlet />;
}
