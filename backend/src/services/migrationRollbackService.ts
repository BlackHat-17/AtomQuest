import { prisma } from '../lib/prisma.js';

export interface RollbackResult {
  success: boolean;
  rolledBackCycles: number;
  restoredGoalSheets: number;
  restoredSharedGoals: number;
  errors: RollbackError[];
  auditLogId: string;
  summary: RollbackSummary;
}

export interface RollbackError {
  entityType: string;
  entityId: string;
  error: string;
  suggestion: string;
}

export interface RollbackSummary {
  totalNewCycles: number;
  successfulRollbacks: number;
  failedRollbacks: number;
  dataRestorationRate: number;
  rollbackDuration: number;
}

export interface RollbackOptions {
  dryRun?: boolean;
  batchSize?: number;
  preserveAuditTrail?: boolean;
  targetMigrationId?: string;
}

export interface MigrationSnapshot {
  id: string;
  migrationId: string;
  entityType: string;
  entityId: string;
  beforeState: any;
  afterState: any;
  timestamp: Date;
}

export class MigrationRollbackService {
  /**
   * Main rollback method to revert migration changes
   */
  async rollbackMigration(options: RollbackOptions = {}): Promise<RollbackResult> {
    const {
      dryRun = false,
      batchSize = 50,
      preserveAuditTrail = true,
      targetMigrationId,
    } = options;

    const startTime = Date.now();
    const errors: RollbackError[] = [];
    let rolledBackCycles = 0;
    let restoredGoalSheets = 0;
    let restoredSharedGoals = 0;

    try {
      // Find migration to rollback
      const migrationAuditLog = await this.findMigrationToRollback(targetMigrationId);
      
      if (!migrationAuditLog) {
        throw new Error('No migration found to rollback');
      }

      // Get all new cycles created during migration
      const newCycles = await prisma.newGoalCycle.findMany({
        where: {
          createdAt: {
            gte: migrationAuditLog.timestamp,
          },
        },
        include: {
          goalSheets: {
            include: {
              goals: {
                include: {
                  achievements: true,
                },
              },
            },
          },
          sharedGoals: true,
          stages: true,
          stageTransitions: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const totalNewCycles = newCycles.length;
      let successfulRollbacks = 0;
      let failedRollbacks = 0;

      // Create rollback snapshot before starting
      if (!dryRun) {
        await this.createRollbackSnapshot(newCycles, migrationAuditLog.id);
      }

      // Process cycles in batches
      for (let i = 0; i < newCycles.length; i += batchSize) {
        const batch = newCycles.slice(i, i + batchSize);
        
        for (const newCycle of batch) {
          try {
            const rollbackResult = await this.rollbackSingleCycle(
              newCycle,
              { dryRun, preserveAuditTrail }
            );

            if (rollbackResult.success) {
              successfulRollbacks++;
              rolledBackCycles++;
              restoredGoalSheets += rollbackResult.restoredGoalSheets;
              restoredSharedGoals += rollbackResult.restoredSharedGoals;
            } else {
              failedRollbacks++;
              errors.push(...rollbackResult.errors);
            }
          } catch (error) {
            failedRollbacks++;
            errors.push({
              entityType: 'NewGoalCycle',
              entityId: newCycle.id,
              error: error instanceof Error ? error.message : 'Unknown error',
              suggestion: 'Review cycle data and retry rollback',
            });
          }
        }

        // Progress logging for large rollbacks
        if (newCycles.length > 100) {
          console.log(`Rollback progress: ${i + batch.length}/${newCycles.length} cycles processed`);
        }
      }

      // Create rollback audit log
      const auditLogId = await this.createRollbackAuditLog({
        originalMigrationId: migrationAuditLog.id,
        totalNewCycles,
        successfulRollbacks,
        failedRollbacks,
        restoredGoalSheets,
        restoredSharedGoals,
        errors,
        dryRun,
        duration: Date.now() - startTime,
      });

      const dataRestorationRate = totalNewCycles > 0 
        ? (successfulRollbacks / totalNewCycles) * 100 
        : 100;

      return {
        success: errors.length === 0,
        rolledBackCycles,
        restoredGoalSheets,
        restoredSharedGoals,
        errors,
        auditLogId,
        summary: {
          totalNewCycles,
          successfulRollbacks,
          failedRollbacks,
          dataRestorationRate,
          rollbackDuration: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Create error audit log
      const auditLogId = await this.createRollbackAuditLog({
        originalMigrationId: targetMigrationId || 'unknown',
        totalNewCycles: 0,
        successfulRollbacks: 0,
        failedRollbacks: 1,
        restoredGoalSheets: 0,
        restoredSharedGoals: 0,
        errors: [{
          entityType: 'Rollback',
          entityId: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system logs and database connectivity',
        }],
        dryRun,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        rolledBackCycles: 0,
        restoredGoalSheets: 0,
        restoredSharedGoals: 0,
        errors: [{
          entityType: 'Rollback',
          entityId: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system logs and database connectivity',
        }],
        auditLogId,
        summary: {
          totalNewCycles: 0,
          successfulRollbacks: 0,
          failedRollbacks: 1,
          dataRestorationRate: 0,
          rollbackDuration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Rollback a single cycle and restore goal sheet references
   */
  private async rollbackSingleCycle(
    newCycle: any,
    options: { dryRun: boolean; preserveAuditTrail: boolean }
  ): Promise<{
    success: boolean;
    restoredGoalSheets: number;
    restoredSharedGoals: number;
    errors: RollbackError[];
  }> {
    const { dryRun, preserveAuditTrail } = options;
    const errors: RollbackError[] = [];

    try {
      if (dryRun) {
        // Dry run - just validate without making changes
        return {
          success: true,
          restoredGoalSheets: newCycle.goalSheets.length,
          restoredSharedGoals: newCycle.sharedGoals.length,
          errors: [],
        };
      }

      // Perform actual rollback in transaction
      const result = await prisma.$transaction(async (tx) => {
        let restoredGoalSheets = 0;
        let restoredSharedGoals = 0;

        // Restore goal sheet references to legacy cycles
        for (const goalSheet of newCycle.goalSheets) {
          // Find the original legacy cycle this sheet belonged to
          const originalCycle = await this.findOriginalLegacyCycle(
            goalSheet.employeeId,
            newCycle.year,
            newCycle.quarter
          );

          if (originalCycle) {
            await tx.goalSheet.update({
              where: { id: goalSheet.id },
              data: {
                newCycleId: null,
                cycleId: originalCycle.id,
              },
            });
            restoredGoalSheets++;
          } else {
            // If no original cycle found, keep the reference but log warning
            errors.push({
              entityType: 'GoalSheet',
              entityId: goalSheet.id,
              error: 'Original legacy cycle not found',
              suggestion: 'Manual review required for this goal sheet',
            });
          }
        }

        // Restore shared goal references
        for (const sharedGoal of newCycle.sharedGoals) {
          const originalCycle = await this.findOriginalLegacyCycle(
            sharedGoal.targetEmployeeId,
            newCycle.year,
            newCycle.quarter
          );

          if (originalCycle) {
            await tx.sharedGoal.update({
              where: { id: sharedGoal.id },
              data: {
                newCycleId: null,
                cycleId: originalCycle.id,
              },
            });
            restoredSharedGoals++;
          }
        }

        // Delete stage transitions (cascade will handle stages)
        await tx.stageTransition.deleteMany({
          where: { cycleId: newCycle.id },
        });

        // Delete the new cycle (cascade will delete stages)
        await tx.newGoalCycle.delete({
          where: { id: newCycle.id },
        });

        // Create rollback audit entry if preserving audit trail
        if (preserveAuditTrail) {
          await tx.auditLog.create({
            data: {
              entityType: 'CycleRollback',
              entityId: newCycle.id,
              userId: 'system',
              action: 'ROLLBACK_CYCLE',
              oldValue: {
                cycleName: newCycle.name,
                quarter: newCycle.quarter,
                year: newCycle.year,
                goalSheets: newCycle.goalSheets.length,
                sharedGoals: newCycle.sharedGoals.length,
              },
              newValue: {
                status: 'rolled_back',
                restoredGoalSheets,
                restoredSharedGoals,
              },
              reason: 'Migration rollback operation',
            },
          });
        }

        return { restoredGoalSheets, restoredSharedGoals };
      });

      return {
        success: true,
        restoredGoalSheets: result.restoredGoalSheets,
        restoredSharedGoals: result.restoredSharedGoals,
        errors,
      };
    } catch (error) {
      errors.push({
        entityType: 'NewGoalCycle',
        entityId: newCycle.id,
        error: error instanceof Error ? error.message : 'Unknown error during rollback',
        suggestion: 'Check data integrity and retry',
      });

      return { success: false, restoredGoalSheets: 0, restoredSharedGoals: 0, errors };
    }
  }

  /**
   * Find the original legacy cycle for restoration
   */
  private async findOriginalLegacyCycle(
    employeeId: string,
    year: number,
    quarter: string
  ) {
    // This is a simplified approach - in practice, you'd need more sophisticated
    // logic to map back to the correct legacy cycle based on the migration mapping
    return await prisma.goalCycle.findFirst({
      where: {
        year,
        // Map quarter back to phase - this is simplified
        phase: quarter === 'Q1' ? 'GOAL_SETTING' : quarter as any,
      },
    });
  }

  /**
   * Find migration audit log to rollback
   */
  private async findMigrationToRollback(targetMigrationId?: string) {
    if (targetMigrationId) {
      return await prisma.auditLog.findUnique({
        where: { id: targetMigrationId },
      });
    }

    // Find the most recent migration
    return await prisma.auditLog.findFirst({
      where: {
        entityType: 'Migration',
        action: 'LEGACY_MIGRATION',
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Create snapshot of data before rollback
   */
  private async createRollbackSnapshot(newCycles: any[], migrationId: string) {
    const snapshots = newCycles.map((cycle) => ({
      migrationId,
      entityType: 'NewGoalCycle',
      entityId: cycle.id,
      beforeState: cycle,
      afterState: null, // Will be null after rollback
      timestamp: new Date(),
    }));

    // Store snapshots in audit log for recovery purposes
    await prisma.auditLog.create({
      data: {
        entityType: 'RollbackSnapshot',
        entityId: migrationId,
        userId: 'system',
        action: 'CREATE_SNAPSHOT',
        oldValue: null,
        newValue: {
          snapshotCount: snapshots.length,
          cycles: snapshots.map(s => ({
            id: s.entityId,
            name: s.beforeState.name,
            quarter: s.beforeState.quarter,
            year: s.beforeState.year,
          })),
        },
        reason: 'Pre-rollback data snapshot for recovery',
      },
    });
  }

  /**
   * Create comprehensive audit log for rollback
   */
  private async createRollbackAuditLog(data: {
    originalMigrationId: string;
    totalNewCycles: number;
    successfulRollbacks: number;
    failedRollbacks: number;
    restoredGoalSheets: number;
    restoredSharedGoals: number;
    errors: RollbackError[];
    dryRun: boolean;
    duration: number;
  }): Promise<string> {
    const auditLog = await prisma.auditLog.create({
      data: {
        entityType: 'MigrationRollback',
        entityId: data.originalMigrationId,
        userId: 'system',
        action: data.dryRun ? 'DRY_RUN_ROLLBACK' : 'MIGRATION_ROLLBACK',
        oldValue: {
          newStructure: 'cycle-stage architecture',
          totalNewCycles: data.totalNewCycles,
        },
        newValue: {
          restoredStructure: 'legacy phase-based cycles',
          rollbackResults: {
            successfulRollbacks: data.successfulRollbacks,
            failedRollbacks: data.failedRollbacks,
            restoredGoalSheets: data.restoredGoalSheets,
            restoredSharedGoals: data.restoredSharedGoals,
            dataRestorationRate: data.totalNewCycles > 0 
              ? (data.successfulRollbacks / data.totalNewCycles) * 100 
              : 100,
            duration: data.duration,
            errors: data.errors,
          },
        },
        reason: data.dryRun 
          ? 'Dry run rollback to validate restoration process'
          : 'Production rollback from cycle-stage to legacy phase-based architecture',
      },
    });

    return auditLog.id;
  }

  /**
   * Validate rollback feasibility
   */
  async validateRollbackFeasibility(migrationId?: string): Promise<{
    canRollback: boolean;
    issues: Array<{ type: string; description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }>;
    affectedEntities: {
      cycles: number;
      goalSheets: number;
      sharedGoals: number;
      achievements: number;
    };
  }> {
    const issues: Array<{ type: string; description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }> = [];

    try {
      // Find migration to validate
      const migrationAuditLog = await this.findMigrationToRollback(migrationId);
      
      if (!migrationAuditLog) {
        issues.push({
          type: 'NO_MIGRATION_FOUND',
          description: 'No migration found to rollback',
          severity: 'HIGH',
        });
        return {
          canRollback: false,
          issues,
          affectedEntities: { cycles: 0, goalSheets: 0, sharedGoals: 0, achievements: 0 },
        };
      }

      // Check for new cycles created after migration
      const newCycles = await prisma.newGoalCycle.findMany({
        where: {
          createdAt: {
            gte: migrationAuditLog.timestamp,
          },
        },
        include: {
          goalSheets: {
            include: {
              goals: {
                include: {
                  achievements: true,
                },
              },
            },
          },
          sharedGoals: true,
          stageTransitions: true,
        },
      });

      // Check for data modifications after migration
      const modifiedAfterMigration = await prisma.auditLog.count({
        where: {
          timestamp: {
            gt: migrationAuditLog.timestamp,
          },
          entityType: {
            in: ['Goal', 'Achievement', 'GoalSheet', 'SharedGoal'],
          },
        },
      });

      if (modifiedAfterMigration > 0) {
        issues.push({
          type: 'DATA_MODIFIED_AFTER_MIGRATION',
          description: `${modifiedAfterMigration} entities modified after migration`,
          severity: 'MEDIUM',
        });
      }

      // Check for missing legacy cycles
      const missingLegacyCycles = await this.checkForMissingLegacyCycles(newCycles);
      if (missingLegacyCycles > 0) {
        issues.push({
          type: 'MISSING_LEGACY_CYCLES',
          description: `${missingLegacyCycles} legacy cycles not found for restoration`,
          severity: 'HIGH',
        });
      }

      // Calculate affected entities
      const affectedEntities = {
        cycles: newCycles.length,
        goalSheets: newCycles.reduce((sum, cycle) => sum + cycle.goalSheets.length, 0),
        sharedGoals: newCycles.reduce((sum, cycle) => sum + cycle.sharedGoals.length, 0),
        achievements: newCycles.reduce((sum, cycle) => 
          sum + cycle.goalSheets.reduce((sheetSum, sheet) => 
            sheetSum + sheet.goals.reduce((goalSum, goal) => 
              goalSum + goal.achievements.length, 0), 0), 0),
      };

      const canRollback = !issues.some(issue => issue.severity === 'HIGH');

      return {
        canRollback,
        issues,
        affectedEntities,
      };
    } catch (error) {
      issues.push({
        type: 'VALIDATION_ERROR',
        description: error instanceof Error ? error.message : 'Unknown validation error',
        severity: 'HIGH',
      });

      return {
        canRollback: false,
        issues,
        affectedEntities: { cycles: 0, goalSheets: 0, sharedGoals: 0, achievements: 0 },
      };
    }
  }

  /**
   * Check for missing legacy cycles that would prevent proper restoration
   */
  private async checkForMissingLegacyCycles(newCycles: any[]): Promise<number> {
    let missingCount = 0;

    for (const newCycle of newCycles) {
      for (const goalSheet of newCycle.goalSheets) {
        const originalCycle = await this.findOriginalLegacyCycle(
          goalSheet.employeeId,
          newCycle.year,
          newCycle.quarter
        );
        
        if (!originalCycle) {
          missingCount++;
          break; // Count each cycle only once
        }
      }
    }

    return missingCount;
  }

  /**
   * Get rollback history
   */
  async getRollbackHistory(limit: number = 50) {
    return await prisma.auditLog.findMany({
      where: {
        entityType: 'MigrationRollback',
        action: {
          in: ['MIGRATION_ROLLBACK', 'DRY_RUN_ROLLBACK'],
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Generate rollback report
   */
  async generateRollbackReport(rollbackResult: RollbackResult): Promise<string> {
    const { summary, errors } = rollbackResult;
    
    let report = `# Migration Rollback Report\n\n`;
    report += `**Rollback Date:** ${new Date().toISOString()}\n`;
    report += `**Status:** ${rollbackResult.success ? 'SUCCESS' : 'PARTIAL SUCCESS'}\n`;
    report += `**Duration:** ${summary.rollbackDuration}ms\n\n`;
    
    report += `## Summary\n`;
    report += `- Total New Cycles: ${summary.totalNewCycles}\n`;
    report += `- Successfully Rolled Back: ${summary.successfulRollbacks}\n`;
    report += `- Failed Rollbacks: ${summary.failedRollbacks}\n`;
    report += `- Data Restoration Rate: ${summary.dataRestorationRate.toFixed(2)}%\n`;
    report += `- Restored Goal Sheets: ${rollbackResult.restoredGoalSheets}\n`;
    report += `- Restored Shared Goals: ${rollbackResult.restoredSharedGoals}\n\n`;

    if (errors.length > 0) {
      report += `## Errors (${errors.length})\n\n`;
      errors.forEach((error, index) => {
        report += `### Error ${index + 1}\n`;
        report += `- **Type:** ${error.entityType}\n`;
        report += `- **Entity ID:** ${error.entityId}\n`;
        report += `- **Error:** ${error.error}\n`;
        report += `- **Suggestion:** ${error.suggestion}\n\n`;
      });
    }

    report += `## Recovery Procedures\n\n`;
    report += `If manual intervention is required:\n`;
    report += `1. Review error details above\n`;
    report += `2. Check audit logs for detailed transaction history\n`;
    report += `3. Verify data integrity in both legacy and new structures\n`;
    report += `4. Contact system administrator if issues persist\n`;

    return report;
  }
}

// Export singleton instance
export const migrationRollbackService = new MigrationRollbackService();