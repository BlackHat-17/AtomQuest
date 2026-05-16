import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { goalsRouter } from './routes/goals.js';
import { managerRouter } from './routes/manager.js';
import { sharedGoalsRouter } from './routes/shared-goals.js';
import { achievementsRouter } from './routes/achievements.js';
import { checkinsRouter } from './routes/checkins.js';
import { reportsRouter } from './routes/reports.js';
import { adminRouter } from './routes/admin.js';
import { authenticate } from './middleware/authenticate.js';
import { requireManagerOrAdmin } from './middleware/authorize.js';

/**
 * Creates and configures the Express application.
 * Separated from the server entry point to allow testing without starting a server.
 */
export function createApp(): express.Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS — restrict to known frontend origin
  app.use(
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
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
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API routes
  app.use('/api/auth', authRouter);
  app.use('/api/goals', authenticate, goalsRouter);
  app.use('/api/manager', authenticate, requireManagerOrAdmin, managerRouter);
  app.use('/api/shared-goals', authenticate, sharedGoalsRouter);
  app.use('/api/checkins', authenticate, checkinsRouter);
  app.use('/api/achievements', authenticate, achievementsRouter);
  app.use('/api/reports', authenticate, reportsRouter);
  app.use('/api/admin', authenticate, adminRouter);
  // app.use('/api/analytics', analyticsRouter);

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
