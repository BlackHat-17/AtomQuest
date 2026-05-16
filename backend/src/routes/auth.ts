import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';

export const authRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signAccessToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
}

function signRefreshToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  // Store refresh token in httpOnly cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/api/auth',
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
    },
  });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

authRouter.post('/refresh', async (req: Request, res: Response) => {
  // Accept token from cookie or request body
  const tokenFromCookie = req.cookies?.refreshToken as string | undefined;
  const parsed = refreshSchema.safeParse(req.body);
  const tokenFromBody = parsed.success ? parsed.data.refreshToken : undefined;

  const token = tokenFromCookie ?? tokenFromBody;

  if (!token) {
    res.status(401).json({ error: 'Refresh token is required' });
    return;
  }

  let payload: { id: string; email: string; role: string };
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
      id: string;
      email: string;
      role: string;
    };
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }

  const accessToken = signAccessToken({
    id: payload.id,
    email: payload.email,
    role: payload.role,
  });

  res.json({ accessToken });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });

  res.status(200).json({ message: 'Logged out successfully' });
});
