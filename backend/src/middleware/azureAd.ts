import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { BearerStrategy, type IBearerStrategyOptionWithRequest } from 'passport-azure-ad';
import type { AzureADProfile } from '../services/ssoService.js';

// ─── Extend Express Request ───────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      azureProfile?: AzureADProfile;
    }
  }
}

// ─── Configure BearerStrategy ─────────────────────────────────────────────────

const tenantId = process.env.AAD_TENANT_ID;
const clientId = process.env.AAD_CLIENT_ID;

let strategyConfigured = false;

if (tenantId && clientId) {
  const options: IBearerStrategyOptionWithRequest = {
    identityMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
    clientID: clientId,
    validateIssuer: true,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    passReqToCallback: true,
    loggingLevel: 'warn',
  };

  passport.use(
    new BearerStrategy(options, (req: Request, token: AzureADProfile, done: Function) => {
      req.azureProfile = token;
      return done(null, token);
    })
  );

  strategyConfigured = true;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Validates the Bearer token from the Authorization header using Azure AD.
 * On success, attaches the decoded profile to `req.azureProfile`.
 * Returns 503 if SSO is not configured, 401 if the token is invalid.
 */
export function validateAzureToken(req: Request, res: Response, next: NextFunction): void {
  if (!strategyConfigured) {
    res.status(503).json({ error: 'SSO is not configured on this server' });
    return;
  }

  passport.authenticate('oauth-bearer', { session: false }, (err: unknown, user: unknown) => {
    if (err || !user) {
      res.status(401).json({ error: 'Invalid or expired Azure AD token' });
      return;
    }
    next();
  })(req, res, next);
}
