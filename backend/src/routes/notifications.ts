/**
 * notifications.ts
 *
 * Admin-only routes for viewing and testing notification configuration.
 *
 * GET  /api/admin/notifications/config  — return current SMTP & Teams config (password masked)
 * PUT  /api/admin/notifications/config  — accept config values (read-only; env vars must be set manually)
 * POST /api/admin/notifications/test    — send a test email and/or Teams message
 */

import { Router, type Request, type Response } from 'express';
import { notifyService } from '../services/notifyService.js';

export const notificationsRouter = Router();

// ─── GET /api/admin/notifications/config ─────────────────────────────────────

notificationsRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    smtp: {
      host: process.env.SMTP_HOST ?? null,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      user: process.env.SMTP_USER ?? null,
      // Mask password — only indicate whether it is set
      pass: process.env.SMTP_PASS ? '••••••••' : null,
      from: process.env.SMTP_FROM ?? null,
      configured: Boolean(process.env.SMTP_HOST),
    },
    teams: {
      webhookUrl: process.env.TEAMS_WEBHOOK_URL
        ? process.env.TEAMS_WEBHOOK_URL.replace(/\/[^/]+$/, '/***')
        : null,
      configured: Boolean(process.env.TEAMS_WEBHOOK_URL),
    },
  });
});

// ─── PUT /api/admin/notifications/config ─────────────────────────────────────
// Read-only for runtime — env vars must be updated manually.
// Accepts the payload and echoes it back with a note.

notificationsRouter.put('/config', (req: Request, res: Response) => {
  const { smtp, teams } = req.body as {
    smtp?: {
      host?: string;
      port?: number;
      user?: string;
      pass?: string;
      from?: string;
    };
    teams?: { webhookUrl?: string };
  };

  res.json({
    message:
      'Configuration received. To apply changes, update the corresponding environment variables ' +
      '(SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, TEAMS_WEBHOOK_URL) and restart the server.',
    received: {
      smtp: smtp
        ? {
            host: smtp.host ?? null,
            port: smtp.port ?? null,
            user: smtp.user ?? null,
            pass: smtp.pass ? '••••••••' : null,
            from: smtp.from ?? null,
          }
        : null,
      teams: teams ? { webhookUrl: teams.webhookUrl ?? null } : null,
    },
  });
});

// ─── POST /api/admin/notifications/test ──────────────────────────────────────

notificationsRouter.post('/test', async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const results: { email?: string; teams?: string } = {};

  // Send a test check-in reminder to the requesting admin
  try {
    await notifyService.checkinReminder(req.user.id, 'Q1');
    results.email = process.env.SMTP_HOST
      ? 'Test email sent successfully'
      : 'Skipped — SMTP not configured';
  } catch (err) {
    results.email = `Failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Send a test Teams card
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const axios = (await import('axios')).default;
      await axios.post(
        webhookUrl,
        {
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: {
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                type: 'AdaptiveCard',
                version: '1.4',
                body: [
                  {
                    type: 'TextBlock',
                    text: 'Goal Portal — Test Notification',
                    weight: 'Bolder',
                    size: 'Medium',
                  },
                  {
                    type: 'TextBlock',
                    text: 'This is a test notification from the Goal Setting & Tracking Portal.',
                    wrap: true,
                  },
                ],
              },
            },
          ],
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 }
      );
      results.teams = 'Test Teams card sent successfully';
    } catch (err) {
      results.teams = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    results.teams = 'Skipped — TEAMS_WEBHOOK_URL not configured';
  }

  res.json({ results });
});
