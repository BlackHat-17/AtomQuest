import { type Request, type Response, type NextFunction } from 'express';
import type { Role } from '@prisma/client';

// ─── Core authorize factory ───────────────────────────────────────────────────

/**
 * Returns middleware that checks `req.user.role` is in the allowed roles list.
 * Returns 403 if the role is not permitted.
 *
 * Must be used after the `authenticate` middleware.
 */
export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

// ─── Convenience guards ───────────────────────────────────────────────────────

/** Allows only EMPLOYEE role. */
export const requireEmployee = authorize('EMPLOYEE');

/** Allows only MANAGER role. */
export const requireManager = authorize('MANAGER');

/** Allows only ADMIN role. */
export const requireAdmin = authorize('ADMIN');

/** Allows MANAGER or ADMIN roles. */
export const requireManagerOrAdmin = authorize('MANAGER', 'ADMIN');
