import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import type { Role } from '@prisma/client';

// ─── Type augmentation ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
      };
    }
  }
}

// ─── JWT payload shape ────────────────────────────────────────────────────────

interface JwtPayload {
  id: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Reads the `Authorization: Bearer <token>` header, verifies the JWT,
 * and attaches the decoded payload to `req.user`.
 *
 * Returns 401 if the token is missing or invalid.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
