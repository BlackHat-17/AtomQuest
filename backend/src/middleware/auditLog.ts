import { type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

// ─── auditOnChange middleware factory ─────────────────────────────────────────

/**
 * Middleware factory that captures before/after values for locked entities
 * and writes an AuditLog record on successful mutation.
 *
 * Only fires when the entity's `isLocked` field is `true` — this implements
 * the post-lock audit trail requirement (NFR-4, US-A6).
 *
 * Usage:
 *   router.put('/:goalId', auditOnChange('goal'), handler)
 *
 * @param entityType - Prisma model name in camelCase (e.g. 'goal', 'achievement')
 */
export function auditOnChange(entityType: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Resolve entity ID from common param names
    const entityId =
      req.params.id ??
      req.params.goalId ??
      req.params.achievementId ??
      req.params.sheetId ??
      null;

    if (!entityId || !req.user) {
      next();
      return;
    }

    // Capture original value before mutation
    let original: Record<string, unknown> | null = null;
    try {
      // Dynamically access the Prisma model by name
      const model = (prisma as unknown as Record<string, { findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null> }>)[entityType];
      if (model?.findUnique) {
        original = await model.findUnique({ where: { id: entityId } });
      }
    } catch {
      // If the model doesn't exist or query fails, proceed without audit
      next();
      return;
    }

    // Only audit locked entities (post-lock audit trail)
    if (!original || !(original as { isLocked?: boolean }).isLocked) {
      next();
      return;
    }

    // Monkey-patch res.json to capture the response body
    const originalJson = res.json.bind(res) as (body: unknown) => Response;
    res.json = function (body: unknown): Response {
      // Write audit log asynchronously on successful response
      if (res.statusCode < 400 && original && req.user) {
        prisma.auditLog
          .create({
            data: {
              entityType,
              entityId,
              userId: req.user.id,
              action: req.method,
              oldValue: original as object,
              newValue: body as object,
              timestamp: new Date(),
            },
          })
          .catch((err: unknown) => {
            console.error('[auditOnChange] Failed to write audit log:', err);
          });
      }
      return originalJson(body);
    };

    next();
  };
}
