import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth.js';
import { goalsRouter } from './routes/goals.js';
import { managerRouter } from './routes/manager.js';
import { sharedGoalsRouter } from './routes/shared-goals.js';
import { achievementsRouter } from './routes/achievements.js';
import { checkinsRouter } from './routes/checkins.js';
import { reportsRouter } from './routes/reports.js';
import { adminRouter } from './routes/admin.js';
import { notificationsRouter } from './routes/notifications.js';
import { escalationRulesRouter, escalationLogsRouter } from './routes/escalation.js';
import analyticsRouter from './routes/analytics.js';
import { cyclesRouter } from './routes/cycles.js';
import { stagesRouter } from './routes/stages.js';
import { cycleGoalsRouter } from './routes/cycle-goals.js';
import { migrationRouter } from './routes/migration.js';
import { authenticate } from './middleware/authenticate.js';
import { requireManagerOrAdmin, requireAdmin } from './middleware/authorize.js';

/**
 * Creates and configures the Express application.
 * Separated from the server entry point to allow testing without starting a server.
 */
// Rate limiters (disabled in test/development so they don't break local dev)
const isProductionLike = process.env.NODE_ENV === 'production';

/** General API limiter: 100 requests per 15 minutes per IP */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProductionLike ? 100 : 0, // 0 = unlimited in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** Auth limiter: 10 requests per 15 minutes per IP (brute-force protection) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProductionLike ? 10 : 0,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

export function createApp(): express.Application {
  const app = express();

  // Trust the first proxy (Nginx) — required for correct IP in rate limiting
  if (isProductionLike) {
    app.set('trust proxy', 1);
  }

  // Security headers
  app.use(helmet());

  // CORS — restrict to known frontend origins.
  // FRONTEND_URL may be a comma-separated list of allowed origins, e.g.:
  //   http://65.2.129.60,http://ec2-65-2-129-60.ap-south-1.compute.amazonaws.com
  const rawOrigins = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const allowedOrigins = rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g., server-to-server, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // HTTP request logging
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Parse JSON request bodies
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded bodies
  app.use(express.urlencoded({ extended: true }));

  // Parse cookies (required for httpOnly refresh token cookie)
  app.use(cookieParser());

  // Health check endpoint — no auth required
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Apply rate limiting to all API routes
  app.use('/api/', apiLimiter);

  // API routes
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/goals', authenticate, goalsRouter);
  app.use('/api/manager', authenticate, requireManagerOrAdmin, managerRouter);
  app.use('/api/shared-goals', authenticate, sharedGoalsRouter);
  app.use('/api/checkins', authenticate, checkinsRouter);
  app.use('/api/achievements', authenticate, achievementsRouter);
  app.use('/api/reports', authenticate, reportsRouter);
  app.use('/api/admin', authenticate, adminRouter);
  app.use('/api/admin/notifications', authenticate, requireAdmin, notificationsRouter);
  app.use('/api/admin/escalation-rules', authenticate, requireAdmin, escalationRulesRouter);
  app.use('/api/admin/escalation-logs', authenticate, requireAdmin, escalationLogsRouter);
  app.use('/api/admin/analytics', authenticate, requireAdmin, analyticsRouter);
  app.use('/api', authenticate, cyclesRouter);
  app.use('/api', authenticate, stagesRouter);
  app.use('/api/cycle-goals', authenticate, cycleGoalsRouter);
  app.use('/api/admin/migration', authenticate, migrationRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  });

  return app;
}
