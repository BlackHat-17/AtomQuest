/**
 * notifyService.ts
 *
 * Handles email (via nodemailer) and Microsoft Teams (via Adaptive Cards)
 * notifications for goal lifecycle events.
 *
 * All notification functions are designed to be fire-and-forget:
 *   notifyService.goalSubmitted(...).catch(() => {});
 *
 * Both email and Teams notifications are silently skipped when the
 * respective environment variables are not configured.
 */

import nodemailer from 'nodemailer';
import axios from 'axios';
import { prisma } from '../lib/prisma.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamsAdaptiveCard {
  type: 'message';
  attachments: Array<{
    contentType: 'application/vnd.microsoft.card.adaptive';
    content: object;
  }>;
}

// ─── Transporter (lazy-initialised) ──────────────────────────────────────────

function createTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: parseInt(process.env.SMTP_PORT ?? '587', 10) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

// ─── Deep-link helper ─────────────────────────────────────────────────────────

function goalDeepLink(sheetId: string): string {
  const base = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  return `${base}/goals/${sheetId}`;
}

// ─── HTML email templates ─────────────────────────────────────────────────────

function emailWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1e40af; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { padding: 24px 32px; color: #333; line-height: 1.6; }
    .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #1e40af; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .footer { padding: 16px 32px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${title}</h1></div>
    <div class="content">${body}</div>
    <div class="footer">Goal Setting &amp; Tracking Portal — automated notification</div>
  </div>
</body>
</html>`;
}

function goalSubmittedTemplate(employeeName: string, deepLink: string): string {
  return emailWrapper(
    'New Goal Sheet Submitted',
    `<p>Hi,</p>
    <p><strong>${employeeName}</strong> has submitted their goal sheet for your review.</p>
    <p>Please review and either approve or return it for rework.</p>
    <a class="btn" href="${deepLink}">View Goal Sheet</a>`
  );
}

function goalApprovedTemplate(employeeName: string, deepLink: string): string {
  return emailWrapper(
    'Your Goal Sheet Has Been Approved',
    `<p>Hi ${employeeName},</p>
    <p>Great news — your goal sheet has been <strong>approved</strong> and is now locked.</p>
    <p>You can view your approved goals using the link below.</p>
    <a class="btn" href="${deepLink}">View Goal Sheet</a>`
  );
}

function goalReworkedTemplate(
  employeeName: string,
  comment: string,
  deepLink: string
): string {
  return emailWrapper(
    'Your Goal Sheet Needs Rework',
    `<p>Hi ${employeeName},</p>
    <p>Your goal sheet has been returned for <strong>rework</strong> with the following comment:</p>
    <blockquote style="border-left:4px solid #1e40af;margin:16px 0;padding:8px 16px;background:#f0f4ff;color:#333;">${comment}</blockquote>
    <p>Please update your goals and resubmit.</p>
    <a class="btn" href="${deepLink}">Update Goal Sheet</a>`
  );
}

function achievementUpdatedTemplate(
  employeeName: string,
  deepLink: string
): string {
  return emailWrapper(
    'Achievement Update Submitted',
    `<p>Hi,</p>
    <p><strong>${employeeName}</strong> has updated their achievement data.</p>
    <p>Please review the latest progress on their goal sheet.</p>
    <a class="btn" href="${deepLink}">View Goal Sheet</a>`
  );
}

function checkinReminderTemplate(employeeName: string, quarter: string): string {
  return emailWrapper(
    `Check-In Reminder — ${quarter}`,
    `<p>Hi ${employeeName},</p>
    <p>This is a reminder that the <strong>${quarter}</strong> check-in window is now open.</p>
    <p>Please log in to the portal and update your achievement data before the window closes.</p>
    <a class="btn" href="${process.env.FRONTEND_URL ?? 'http://localhost:5173'}">Open Portal</a>`
  );
}

// ─── Email sender ─────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) return; // SMTP not configured — skip silently

  const from = process.env.SMTP_FROM ?? 'noreply@goalportal.com';
  await transporter.sendMail({ from, to, subject, html });
}

// ─── Teams Adaptive Card sender ───────────────────────────────────────────────

async function sendTeamsCard(webhookUrl: string, card: TeamsAdaptiveCard): Promise<void> {
  await axios.post(webhookUrl, card, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10_000,
  });
}

function buildTeamsCard(employeeName: string, action: string, deepLink: string): TeamsAdaptiveCard {
  return {
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
              text: 'Goal Sheet Update',
              weight: 'Bolder',
              size: 'Medium',
            },
            {
              type: 'TextBlock',
              text: `${employeeName} has ${action}`,
              wrap: true,
            },
            {
              type: 'ActionSet',
              actions: [
                {
                  type: 'Action.OpenUrl',
                  title: 'View Goal Sheet',
                  url: deepLink,
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

async function sendTeamsNotification(
  employeeName: string,
  action: string,
  deepLink: string
): Promise<void> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) return; // Teams not configured — skip silently

  const card = buildTeamsCard(employeeName, action, deepLink);
  await sendTeamsCard(webhookUrl, card);
}

// ─── Notification functions ───────────────────────────────────────────────────

/**
 * Notify the employee's manager that a goal sheet has been submitted.
 * Also sends a Teams Adaptive Card to the manager.
 */
async function goalSubmitted(
  sheetId: string,
  employeeId: string,
  managerId: string
): Promise<void> {
  const [employee, manager] = await Promise.all([
    prisma.user.findUnique({ where: { id: employeeId }, select: { name: true, email: true } }),
    prisma.user.findUnique({ where: { id: managerId }, select: { name: true, email: true } }),
  ]);

  if (!employee || !manager) return;

  const deepLink = goalDeepLink(sheetId);

  await Promise.all([
    sendEmail(
      manager.email,
      `Goal Sheet Submitted — ${employee.name}`,
      goalSubmittedTemplate(employee.name, deepLink)
    ),
    sendTeamsNotification(employee.name, 'submitted their goal sheet for review', deepLink),
  ]);
}

/**
 * Notify the employee that their goal sheet has been approved.
 */
async function goalApproved(sheetId: string, employeeId: string): Promise<void> {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { name: true, email: true },
  });

  if (!employee) return;

  const deepLink = goalDeepLink(sheetId);

  await sendEmail(
    employee.email,
    'Your Goal Sheet Has Been Approved',
    goalApprovedTemplate(employee.name, deepLink)
  );
}

/**
 * Notify the employee that their goal sheet has been returned for rework.
 */
async function goalReworked(
  sheetId: string,
  employeeId: string,
  comment: string
): Promise<void> {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { name: true, email: true },
  });

  if (!employee) return;

  const deepLink = goalDeepLink(sheetId);

  await sendEmail(
    employee.email,
    'Your Goal Sheet Needs Rework',
    goalReworkedTemplate(employee.name, comment, deepLink)
  );
}

/**
 * Notify the employee's manager that achievement data has been updated.
 * Also sends a Teams Adaptive Card to the manager.
 */
async function achievementUpdated(
  sheetId: string,
  employeeId: string,
  managerId: string
): Promise<void> {
  const [employee, manager] = await Promise.all([
    prisma.user.findUnique({ where: { id: employeeId }, select: { name: true, email: true } }),
    prisma.user.findUnique({ where: { id: managerId }, select: { name: true, email: true } }),
  ]);

  if (!employee || !manager) return;

  const deepLink = goalDeepLink(sheetId);

  await Promise.all([
    sendEmail(
      manager.email,
      `Achievement Update — ${employee.name}`,
      achievementUpdatedTemplate(employee.name, deepLink)
    ),
    sendTeamsNotification(employee.name, 'updated their achievement data', deepLink),
  ]);
}

/**
 * Send a check-in reminder to an employee for the given quarter.
 */
async function checkinReminder(employeeId: string, quarter: string): Promise<void> {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { name: true, email: true },
  });

  if (!employee) return;

  await sendEmail(
    employee.email,
    `Check-In Reminder — ${quarter}`,
    checkinReminderTemplate(employee.name, quarter)
  );
}

// ─── Exported service ─────────────────────────────────────────────────────────

export const notifyService = {
  goalSubmitted,
  goalApproved,
  goalReworked,
  achievementUpdated,
  checkinReminder,
};
