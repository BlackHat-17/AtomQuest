/**
 * escalationJob.ts
 *
 * Daily cron job (midnight) that evaluates all active EscalationRules and
 * sends notifications to the appropriate person in the escalation chain.
 *
 * Chain levels: EMPLOYEE → MANAGER → SKIP_LEVEL → HR
 * HR is resolved as the first ADMIN user in the system.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { notifyService } from '../services/notifyService.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChainLevel = 'EMPLOYEE' | 'MANAGER' | 'SKIP_LEVEL' | 'HR';

interface EscalationTarget {
  employeeId: string;
  cycleId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the number of days between a past date and now.
 */
function daysSince(date: Date): number {
  const ms = Date.now() - date.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Resolves the user ID to notify for a given chain level and employee.
 * Returns null if the level cannot be resolved (e.g. no manager set).
 */
async function resolveNotifyUserId(
  employeeId: string,
  level: ChainLevel
): Promise<string | null> {
  if (level === 'EMPLOYEE') {
    return employeeId;
  }

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      managerId: true,
      manager: {
        select: {
          managerId: true,
        },
      },
    },
  });

  if (!employee) return null;

  if (level === 'MANAGER') {
    return employee.managerId ?? null;
  }

  if (level === 'SKIP_LEVEL') {
    return employee.manager?.managerId ?? null;
  }

  if (level === 'HR') {
    // HR = first ADMIN user
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return admin?.id ?? null;
  }

  return null;
}

// ─── Trigger evaluators ───────────────────────────────────────────────────────

/**
 * GOAL_NOT_SUBMITTED: employees in an active GOAL_SETTING cycle who have no
 * sheet with status SUBMITTED, LOCKED, or APPROVED.
 */
async function getGoalNotSubmittedTargets(thresholdDays: number): Promise<EscalationTarget[]> {
  const activeCycle = await prisma.goalCycle.findFirst({
    where: { phase: 'GOAL_SETTING', isActive: true },
    select: { id: true, windowOpen: true },
  });

  if (!activeCycle) return [];
  if (daysSince(activeCycle.windowOpen) < thresholdDays) return [];

  // All employees
  const employees = await prisma.user.findMany({
    where: { role: 'EMPLOYEE' },
    select: { id: true },
  });

  // Employees who have already submitted/approved/locked
  const submittedSheets = await prisma.goalSheet.findMany({
    where: {
      cycleId: activeCycle.id,
      status: { in: ['SUBMITTED', 'LOCKED', 'APPROVED'] },
    },
    select: { employeeId: true },
  });

  const submittedIds = new Set(submittedSheets.map((s) => s.employeeId));

  return employees
    .filter((e) => !submittedIds.has(e.id))
    .map((e) => ({ employeeId: e.id, cycleId: activeCycle.id }));
}

/**
 * GOAL_NOT_APPROVED: sheets with status SUBMITTED where submittedAt is older
 * than thresholdDays.
 */
async function getGoalNotApprovedTargets(thresholdDays: number): Promise<EscalationTarget[]> {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  const sheets = await prisma.goalSheet.findMany({
    where: {
      status: 'SUBMITTED',
      submittedAt: { lte: cutoff },
    },
    select: { employeeId: true, cycleId: true },
  });

  return sheets.map((s) => ({ employeeId: s.employeeId, cycleId: s.cycleId }));
}

/**
 * CHECKIN_NOT_COMPLETED: employees with LOCKED sheets in an active quarterly
 * cycle who have no CheckIn for that quarter.
 */
async function getCheckinNotCompletedTargets(thresholdDays: number): Promise<EscalationTarget[]> {
  const quarterPhases = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

  const activeCycle = await prisma.goalCycle.findFirst({
    where: { phase: { in: quarterPhases }, isActive: true },
    select: { id: true, phase: true, windowOpen: true },
  });

  if (!activeCycle) return [];
  if (daysSince(activeCycle.windowOpen) < thresholdDays) return [];

  const quarter = activeCycle.phase as 'Q1' | 'Q2' | 'Q3' | 'Q4';

  // Employees with LOCKED sheets in this cycle
  const lockedSheets = await prisma.goalSheet.findMany({
    where: { cycleId: activeCycle.id, status: 'LOCKED' },
    select: { id: true, employeeId: true },
  });

  if (lockedSheets.length === 0) return [];

  // Sheets that already have a check-in for this quarter
  const completedCheckIns = await prisma.checkIn.findMany({
    where: {
      goalSheetId: { in: lockedSheets.map((s) => s.id) },
      quarter,
    },
    select: { goalSheetId: true },
  });

  const completedSheetIds = new Set(completedCheckIns.map((c) => c.goalSheetId));

  return lockedSheets
    .filter((s) => !completedSheetIds.has(s.id))
    .map((s) => ({ employeeId: s.employeeId, cycleId: activeCycle.id }));
}

// ─── Core escalation logic ────────────────────────────────────────────────────

/**
 * Determines the next escalation level for an employee under a given rule.
 * Level 0 = first chain entry (EMPLOYEE), level 1 = MANAGER, etc.
 */
async function getNextLevel(ruleId: string, employeeId: string, chain: string[]): Promise<number> {
  const lastLog = await prisma.escalationLog.findFirst({
    where: {
      ruleId,
      targetUserId: employeeId,
      status: 'PENDING',
    },
    orderBy: { triggeredAt: 'desc' },
    select: { level: true, triggeredAt: true },
  });

  if (!lastLog) return 0;

  // Already at max level
  if (lastLog.level >= chain.length - 1) return lastLog.level;

  return lastLog.level + 1;
}

/**
 * Sends an escalation notification email to the resolved user.
 */
async function sendEscalationNotification(
  targetEmployeeId: string,
  notifiedUserId: string,
  level: number,
  chainLevel: ChainLevel,
  triggerType: string
): Promise<void> {
  const [target, notified] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetEmployeeId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: notifiedUserId }, select: { name: true, email: true } }),
  ]);

  if (!target || !notified) return;

  const base = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const subject = `Escalation Alert (Level ${level + 1}): ${triggerType.replace(/_/g, ' ')} — ${target.name}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #dc2626; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { padding: 24px 32px; color: #333; line-height: 1.6; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; background: #fee2e2; color: #dc2626; font-size: 12px; font-weight: bold; }
    .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #1e40af; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .footer { padding: 16px 32px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Escalation Alert</h1></div>
    <div class="content">
      <p>Hi ${notified.name},</p>
      <p>This is an escalation notification (${chainLevel.replace('_', ' ')}) for:</p>
      <p><strong>Employee:</strong> ${target.name}</p>
      <p><strong>Issue:</strong> ${triggerType.replace(/_/g, ' ')}</p>
      <p><span class="badge">Level ${level + 1}</span></p>
      <p>Please take action in the portal.</p>
      <a class="btn" href="${base}/admin/escalation-logs">View Escalation Logs</a>
    </div>
    <div class="footer">Goal Setting &amp; Tracking Portal — automated escalation</div>
  </div>
</body>
</html>`;

  // Re-use the internal email sender via notifyService's underlying mechanism.
  // We call checkinReminder as a proxy — but since we need a custom email here,
  // we use nodemailer directly via the same pattern as notifyService.
  // For simplicity, we piggyback on the notifyService pattern by importing nodemailer.
  const nodemailer = await import('nodemailer');
  const host = process.env.SMTP_HOST;
  if (!host) return; // SMTP not configured — skip silently

  const transporter = nodemailer.default.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: parseInt(process.env.SMTP_PORT ?? '587', 10) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  const from = process.env.SMTP_FROM ?? 'noreply@goalportal.com';
  await transporter.sendMail({ from, to: notified.email, subject, html });
}

// ─── Main check function ──────────────────────────────────────────────────────

export async function runEscalationCheck(): Promise<void> {
  console.warn('[escalation] Running escalation check…');

  const rules = await prisma.escalationRule.findMany({
    where: { isActive: true },
  });

  for (const rule of rules) {
    let targets: EscalationTarget[] = [];

    try {
      if (rule.triggerType === 'GOAL_NOT_SUBMITTED') {
        targets = await getGoalNotSubmittedTargets(rule.thresholdDays);
      } else if (rule.triggerType === 'GOAL_NOT_APPROVED') {
        targets = await getGoalNotApprovedTargets(rule.thresholdDays);
      } else if (rule.triggerType === 'CHECKIN_NOT_COMPLETED') {
        targets = await getCheckinNotCompletedTargets(rule.thresholdDays);
      }
    } catch (err) {
      console.error(`[escalation] Error evaluating rule ${rule.id}:`, err);
      continue;
    }

    for (const target of targets) {
      try {
        const chain = rule.chain as ChainLevel[];
        const level = await getNextLevel(rule.id, target.employeeId, chain);
        const chainLevel = chain[level];
        if (!chainLevel) continue;

        // Check interval: don't re-escalate if last log for this level was too recent
        const lastLogAtLevel = await prisma.escalationLog.findFirst({
          where: { ruleId: rule.id, targetUserId: target.employeeId, level },
          orderBy: { triggeredAt: 'desc' },
          select: { triggeredAt: true },
        });

        if (lastLogAtLevel && daysSince(lastLogAtLevel.triggeredAt) < rule.intervalDays) {
          continue; // Too soon to re-escalate at this level
        }

        const notifiedUserId = await resolveNotifyUserId(target.employeeId, chainLevel);
        if (!notifiedUserId) continue;

        // Create log entry
        await prisma.escalationLog.create({
          data: {
            ruleId: rule.id,
            targetUserId: target.employeeId,
            notifiedUserId,
            level,
            status: 'PENDING',
          },
        });

        // Send notification (fire-and-forget)
        sendEscalationNotification(
          target.employeeId,
          notifiedUserId,
          level,
          chainLevel,
          rule.triggerType
        ).catch((err) => {
          console.error('[escalation] Notification error:', err);
        });
      } catch (err) {
        console.error(
          `[escalation] Error processing target ${target.employeeId} for rule ${rule.id}:`,
          err
        );
      }
    }
  }

  console.warn('[escalation] Escalation check complete.');
}

// ─── Cron job ─────────────────────────────────────────────────────────────────

export function startEscalationJob(): void {
  // Run daily at midnight
  cron.schedule('0 0 * * *', () => {
    runEscalationCheck().catch((err) => {
      console.error('[escalation] Unhandled error in escalation job:', err);
    });
  });

  console.warn('[escalation] Escalation job scheduled (daily at midnight).');
}
