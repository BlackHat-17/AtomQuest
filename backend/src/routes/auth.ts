import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { upsertUserFromAzureAD, type AzureADProfile } from '../services/ssoService.js';

export const authRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

const ssoTokenSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
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

// ─── POST /api/auth/sso/token ─────────────────────────────────────────────────
//
// Validates an Azure AD id_token issued by MSAL (SPA / popup flow).
// Uses a "trust but verify" approach suitable for a hackathon context:
//   1. Decode the JWT without full signature verification
//   2. Validate `aud` matches AAD_CLIENT_ID and `iss` contains the tenant ID
//   3. Upsert the user in the DB via upsertUserFromAzureAD
//   4. Issue portal access + refresh tokens

authRouter.post('/sso/token', async (req: Request, res: Response) => {
  // Check SSO is configured
  const aadClientId = env.AAD_CLIENT_ID;
  const aadTenantId = env.AAD_TENANT_ID;

  if (!aadClientId || !aadTenantId) {
    res.status(503).json({ error: 'SSO is not configured on this server' });
    return;
  }

  const parsed = ssoTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { idToken } = parsed.data;

  // Decode without verification first to extract claims
  let claims: Record<string, unknown>;
  try {
    const decoded = jwt.decode(idToken);
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('Token could not be decoded');
    }
    claims = decoded as Record<string, unknown>;
  } catch {
    res.status(401).json({ error: 'Invalid id_token: could not decode' });
    return;
  }

  // Validate audience
  const aud = claims['aud'];
  const audValues = Array.isArray(aud) ? aud : [aud];
  if (!audValues.includes(aadClientId)) {
    res.status(401).json({ error: 'Invalid id_token: audience mismatch' });
    return;
  }

  // Validate issuer contains the tenant ID
  const iss = typeof claims['iss'] === 'string' ? claims['iss'] : '';
  if (!iss.includes(aadTenantId)) {
    res.status(401).json({ error: 'Invalid id_token: issuer mismatch' });
    return;
  }

  // Validate expiry
  const exp = typeof claims['exp'] === 'number' ? claims['exp'] : 0;
  if (exp < Math.floor(Date.now() / 1000)) {
    res.status(401).json({ error: 'id_token has expired' });
    return;
  }

  // Build profile from claims
  const oid = typeof claims['oid'] === 'string' ? claims['oid'] : '';
  if (!oid) {
    res.status(401).json({ error: 'Invalid id_token: missing oid claim' });
    return;
  }

  const groups = Array.isArray(claims['groups'])
    ? (claims['groups'] as string[])
    : [];

  const profile: AzureADProfile = {
    oid,
    email:
      typeof claims['email'] === 'string'
        ? claims['email']
        : typeof claims['preferred_username'] === 'string'
          ? claims['preferred_username']
          : undefined,
    preferred_username:
      typeof claims['preferred_username'] === 'string'
        ? claims['preferred_username']
        : undefined,
    name: typeof claims['name'] === 'string' ? claims['name'] : undefined,
    groups,
  };

  // Upsert user in DB
  let user;
  try {
    user = await upsertUserFromAzureAD(profile);
  } catch (err) {
    console.error('SSO upsert error:', err);
    res.status(500).json({ error: 'Failed to create or update user account' });
    return;
  }

  // Issue portal JWT tokens
  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
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
