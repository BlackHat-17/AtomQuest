import { prisma } from '../lib/prisma.js';
import { GoalStatus } from '@prisma/client';

export interface SharedGoalSyncResult {
  success: boolean;
  syncedGoals: number;
  updatedSheets: number;
  errors: SyncError[];
  summary: SyncSummary;
}

export interface SyncError {
  sharedGoalId: string;
  targetEmployeeId: string;
  error: string;
  suggestion: string;
}

export interface SyncSummary {
  totalSharedGoals: number;
  successfulSyncs: number;
  failedSyncs: number;
  orphanedGoals: number;
  syncDuration: number;
}

export interface SharedGoalRelationship {
  id: string;
  sourceGoalId: string;
  targetEmployeeId: string;
  cycleId: string;
  weightage: number;
  isActive: boolean;
  lastSyncedAt: Date | null;
  sourceGoal: {
    id: string;
    title: string;
    description: string;
    target: string;
    status: GoalStatus;
    thrustArea: string;
  };
  targetEmployee: {
    id: string;
    name: string;
    email: string;
    department: string;
  };
}

export interface OrphanedGoal {
  sharedGoalId: string;
  targetEmployeeId: string;
  reason: string;
  cycleId: string;
  lastValidSourceId?: string;
}

export class SharedGoalManagerService {
  /**
   * Synchronize shared goals across stage transitions
   */
  async synchronizeSharedGoals(cycleId: string): Promise<SharedGoalSyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let syncedGoals = 0;
    let updatedSheets = 0;

    try {
      // Get all shared goals for the cycle
      const sharedGoals = await prisma.sharedGoal.findMany({
        where: { newCycleId: cycleId },
        include: {
          sourceGoal: {
            include: {
              goalSheet: {
                include: {
                  employee: true,
                },
              },
            },
          },
          targetEmployee: true,
        },
      });

      const totalSharedGoals = sharedGoals.length;
      let successfulSyncs = 0;
      let failedSyncs = 0;
      let orphanedGoals = 0;

      // Group shared goals by target employee for batch processing
      const goalsByEmployee = this.groupSharedGoalsByEmployee(sharedGoals);

      for (const [employeeId, employeeSharedGoals] of Object.entries(goalsByEmployee)) {
        try {
          const syncResult = await this.syncEmployeeSharedGoals(
            employeeId,
            employeeSharedGoals,
            cycleId
          );

          if (syncResult.success) {
            successfulSyncs += syncResult.syncedGoals;
            syncedGoals += syncResult.syncedGoals;
            updatedSheets += syncResult.updatedSheets;
          } else {
            failedSyncs += syncResult.failedGoals;
            orphanedGoals += syncResult.orphanedGoals;
            errors.push(...syncResult.errors);
          }
        } catch (error) {
          failedSyncs += employeeSharedGoals.length;
          errors.push({
            sharedGoalId: 'batch',
            targetEmployeeId: employeeId,
            error: error instanceof Error ? error.message : 'Unknown sync error',
            suggestion: 'Review employee shared goals and retry sync',
          });
        }
      }

      // Clean up orphaned goals
      const cleanupResult = await this.cleanupOrphanedGoals(cycleId);
      orphanedGoals += cleanupResult.cleanedUp;

      // Create sync audit log
      await this.createSyncAuditLog({
        cycleId,
        totalSharedGoals,
        successfulSyncs,
        failedSyncs,
        orphanedGoals,
        syncedGoals,
        updatedSheets,
        errors,
        duration: Date.now() - startTime,
      });

      return {
        success: errors.length === 0,
        syncedGoals,
        updatedSheets,
        errors,
        summary: {
          totalSharedGoals,
          successfulSyncs,
          failedSyncs,
          orphanedGoals,
          syncDuration: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Create error audit log
      await this.createSyncAuditLog({
        cycleId,
        totalSharedGoals: 0,
        successfulSyncs: 0,
        failedSyncs: 1,
        orphanedGoals: 0,
        syncedGoals: 0,
        updatedSheets: 0,
        errors: [{
          sharedGoalId: 'system',
          targetEmployeeId: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system logs and database connectivity',
        }],
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        syncedGoals: 0,
        updatedSheets: 0,
        errors: [{
          sharedGoalId: 'system',
          targetEmployeeId: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system logs and database connectivity',
        }],
        summary: {
          totalSharedGoals: 0,
          successfulSyncs: 0,
          failedSyncs: 1,
          orphanedGoals: 0,
          syncDuration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Propagate changes from source goal to all linked employee sheets
   */
  async propagateGoalChanges(
    sourceGoalId: string,
    changes: {
      title?: string;
      description?: string;
      target?: string;
      thrustArea?: string;
      status?: GoalStatus;
    }
  ): Promise<{
    success: boolean;
    updatedGoals: number;
    affectedEmployees: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    let updatedGoals = 0;
    const affectedEmployees: string[] = [];

    try {
      // Get source goal and its shared relationships
      const sourceGoal = await prisma.goal.findUnique({
        where: { id: sourceGoalId },
        include: {
          sharedCopies: {
            include: {
              goalSheet: {
                include: {
                  employee: true,
                },
              },
            },
          },
        },
      });

      if (!sourceGoal) {
        throw new Error('Source goal not found');
      }

      // Update all shared copies in a transaction
      await prisma.$transaction(async (tx) => {
        for (const sharedGoal of sourceGoal.sharedCopies) {
          try {
            await tx.goal.update({
              where: { id: sharedGoal.id },
              data: {
                ...changes,
                // Preserve shared goal specific fields
                isShared: true,
                sharedFromId: sourceGoalId,
              },
            });

            updatedGoals++;
            if (!affectedEmployees.includes(sharedGoal.goalSheet.employee.id)) {
              affectedEmployees.push(sharedGoal.goalSheet.employee.id);
            }
          } catch (error) {
            errors.push(
              `Failed to update shared goal ${sharedGoal.id}: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`
            );
          }
        }

        // Create propagation audit log
        await tx.auditLog.create({
          data: {
            entityType: 'SharedGoalPropagation',
            entityId: sourceGoalId,
            userId: 'system',
            action: 'PROPAGATE_CHANGES',
            oldValue: {
              sourceGoalId,
              sharedCopies: sourceGoal.sharedCopies.length,
            },
            newValue: {
              changes,
              updatedGoals,
              affectedEmployees: affectedEmployees.length,
              errors: errors.length,
            },
            reason: 'Automatic propagation of source goal changes to shared copies',
          },
        });
      });

      return {
        success: errors.length === 0,
        updatedGoals,
        affectedEmployees,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        updatedGoals: 0,
        affectedEmployees: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Prevent orphaned shared goals and cleanup existing ones
   */
  async cleanupOrphanedGoals(cycleId: string): Promise<{
    cleanedUp: number;
    orphanedGoals: OrphanedGoal[];
    errors: string[];
  }> {
    const errors: string[] = [];
    let cleanedUp = 0;
    const orphanedGoals: OrphanedGoal[] = [];

    try {
      // Find shared goals with missing or invalid source goals
      const potentialOrphans = await prisma.sharedGoal.findMany({
        where: { newCycleId: cycleId },
        include: {
          sourceGoal: {
            include: {
              goalSheet: true,
            },
          },
          targetEmployee: true,
        },
      });

      for (const sharedGoal of potentialOrphans) {
        let isOrphaned = false;
        let reason = '';

        // Check if source goal exists
        if (!sharedGoal.sourceGoal) {
          isOrphaned = true;
          reason = 'Source goal no longer exists';
        }
        // Check if source goal is in the same cycle
        else if (sharedGoal.sourceGoal.goalSheet.newCycleId !== cycleId) {
          isOrphaned = true;
          reason = 'Source goal is in a different cycle';
        }
        // Check if target employee still exists
        else if (!sharedGoal.targetEmployee) {
          isOrphaned = true;
          reason = 'Target employee no longer exists';
        }

        if (isOrphaned) {
          orphanedGoals.push({
            sharedGoalId: sharedGoal.id,
            targetEmployeeId: sharedGoal.targetEmployeeId,
            reason,
            cycleId,
            lastValidSourceId: sharedGoal.sourceGoalId,
          });

          try {
            // Remove the orphaned shared goal
            await prisma.sharedGoal.delete({
              where: { id: sharedGoal.id },
            });
            cleanedUp++;
          } catch (error) {
            errors.push(
              `Failed to cleanup orphaned goal ${sharedGoal.id}: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`
            );
          }
        }
      }

      // Create cleanup audit log
      if (orphanedGoals.length > 0) {
        await prisma.auditLog.create({
          data: {
            entityType: 'OrphanedGoalCleanup',
            entityId: cycleId,
            userId: 'system',
            action: 'CLEANUP_ORPHANED_GOALS',
            oldValue: {
              orphanedGoals: orphanedGoals.length,
              reasons: orphanedGoals.map(og => og.reason),
            },
            newValue: {
              cleanedUp,
              errors: errors.length,
            },
            reason: 'Automatic cleanup of orphaned shared goals',
          },
        });
      }

      return {
        cleanedUp,
        orphanedGoals,
        errors,
      };
    } catch (error) {
      return {
        cleanedUp: 0,
        orphanedGoals: [],
        errors: [error instanceof Error ? error.message : 'Unknown cleanup error'],
      };
    }
  }

  /**
   * Get shared goal relationships for a cycle
   */
  async getSharedGoalRelationships(cycleId: string): Promise<SharedGoalRelationship[]> {
    const sharedGoals = await prisma.sharedGoal.findMany({
      where: { newCycleId: cycleId },
      include: {
        sourceGoal: {
          select: {
            id: true,
            title: true,
            description: true,
            target: true,
            status: true,
            thrustArea: true,
          },
        },
        targetEmployee: {
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
          },
        },
      },
    });

    return sharedGoals.map((sg) => ({
      id: sg.id,
      sourceGoalId: sg.sourceGoalId,
      targetEmployeeId: sg.targetEmployeeId,
      cycleId: sg.newCycleId!,
      weightage: Number(sg.weightage),
      isActive: true, // Could be determined by business logic
      lastSyncedAt: sg.createdAt, // Simplified - could track actual sync times
      sourceGoal: sg.sourceGoal,
      targetEmployee: sg.targetEmployee,
    }));
  }

  /**
   * Validate shared goal integrity
   */
  async validateSharedGoalIntegrity(cycleId: string): Promise<{
    isValid: boolean;
    issues: Array<{
      type: string;
      description: string;
      affectedGoals: string[];
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  }> {
    const issues: Array<{
      type: string;
      description: string;
      affectedGoals: string[];
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
    }> = [];

    try {
      // Check for orphaned shared goals
      const orphanedResult = await this.cleanupOrphanedGoals(cycleId);
      if (orphanedResult.orphanedGoals.length > 0) {
        issues.push({
          type: 'ORPHANED_GOALS',
          description: `${orphanedResult.orphanedGoals.length} orphaned shared goals found`,
          affectedGoals: orphanedResult.orphanedGoals.map(og => og.sharedGoalId),
          severity: 'HIGH',
        });
      }

      // Check for duplicate shared goals
      const duplicates = await prisma.$queryRaw<Array<{
        sourceGoalId: string;
        targetEmployeeId: string;
        count: number;
      }>>`
        SELECT "sourceGoalId", "targetEmployeeId", COUNT(*) as count
        FROM "SharedGoal"
        WHERE "newCycleId" = ${cycleId}
        GROUP BY "sourceGoalId", "targetEmployeeId"
        HAVING COUNT(*) > 1
      `;

      if (duplicates.length > 0) {
        issues.push({
          type: 'DUPLICATE_SHARED_GOALS',
          description: `${duplicates.length} duplicate shared goal relationships found`,
          affectedGoals: duplicates.map(d => `${d.sourceGoalId}-${d.targetEmployeeId}`),
          severity: 'MEDIUM',
        });
      }

      // Check for weightage inconsistencies
      const weightageIssues = await this.checkWeightageConsistency(cycleId);
      if (weightageIssues.length > 0) {
        issues.push({
          type: 'WEIGHTAGE_INCONSISTENCY',
          description: `${weightageIssues.length} shared goals with weightage issues`,
          affectedGoals: weightageIssues,
          severity: 'MEDIUM',
        });
      }

      return {
        isValid: issues.length === 0,
        issues,
      };
    } catch (error) {
      issues.push({
        type: 'VALIDATION_ERROR',
        description: error instanceof Error ? error.message : 'Unknown validation error',
        affectedGoals: [],
        severity: 'HIGH',
      });

      return {
        isValid: false,
        issues,
      };
    }
  }

  /**
   * Get shared goal statistics for a cycle
   */
  async getSharedGoalStatistics(cycleId: string) {
    const [
      totalSharedGoals,
      uniqueSourceGoals,
      affectedEmployees,
      departmentStats,
    ] = await Promise.all([
      prisma.sharedGoal.count({ where: { newCycleId: cycleId } }),
      prisma.sharedGoal.groupBy({
        by: ['sourceGoalId'],
        where: { newCycleId: cycleId },
        _count: { sourceGoalId: true },
      }),
      prisma.sharedGoal.groupBy({
        by: ['targetEmployeeId'],
        where: { newCycleId: cycleId },
        _count: { targetEmployeeId: true },
      }),
      prisma.sharedGoal.findMany({
        where: { newCycleId: cycleId },
        include: {
          targetEmployee: {
            select: { department: true },
          },
        },
      }),
    ]);

    const departmentCounts = departmentStats.reduce((acc, sg) => {
      const dept = sg.targetEmployee.department;
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalSharedGoals,
      uniqueSourceGoals: uniqueSourceGoals.length,
      affectedEmployees: affectedEmployees.length,
      averageSharesPerGoal: uniqueSourceGoals.length > 0 
        ? totalSharedGoals / uniqueSourceGoals.length 
        : 0,
      departmentDistribution: departmentCounts,
      mostSharedGoal: uniqueSourceGoals.reduce((max, current) => 
        current._count.sourceGoalId > max._count.sourceGoalId ? current : max,
        uniqueSourceGoals[0] || { sourceGoalId: null, _count: { sourceGoalId: 0 } }
      ),
    };
  }

  /**
   * Private helper methods
   */
  private groupSharedGoalsByEmployee(sharedGoals: any[]): Record<string, any[]> {
    return sharedGoals.reduce((acc, sharedGoal) => {
      const employeeId = sharedGoal.targetEmployeeId;
      if (!acc[employeeId]) {
        acc[employeeId] = [];
      }
      acc[employeeId].push(sharedGoal);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private async syncEmployeeSharedGoals(
    employeeId: string,
    sharedGoals: any[],
    cycleId: string
  ): Promise<{
    success: boolean;
    syncedGoals: number;
    failedGoals: number;
    orphanedGoals: number;
    updatedSheets: number;
    errors: SyncError[];
  }> {
    const errors: SyncError[] = [];
    let syncedGoals = 0;
    let failedGoals = 0;
    let orphanedGoals = 0;
    let updatedSheets = 0;

    try {
      // Get employee's goal sheet for this cycle
      const goalSheet = await prisma.goalSheet.findFirst({
        where: {
          employeeId,
          newCycleId: cycleId,
        },
      });

      if (!goalSheet) {
        // Employee doesn't have a goal sheet for this cycle
        orphanedGoals = sharedGoals.length;
        return {
          success: false,
          syncedGoals: 0,
          failedGoals: 0,
          orphanedGoals,
          updatedSheets: 0,
          errors: [{
            sharedGoalId: 'employee-sheet',
            targetEmployeeId: employeeId,
            error: 'Employee goal sheet not found for cycle',
            suggestion: 'Create goal sheet for employee or remove shared goals',
          }],
        };
      }

      // Sync each shared goal
      for (const sharedGoal of sharedGoals) {
        try {
          if (!sharedGoal.sourceGoal) {
            orphanedGoals++;
            continue;
          }

          // Update shared goal metadata (could include sync timestamp)
          await prisma.sharedGoal.update({
            where: { id: sharedGoal.id },
            data: {
              // Could add lastSyncedAt field if needed
            },
          });

          syncedGoals++;
        } catch (error) {
          failedGoals++;
          errors.push({
            sharedGoalId: sharedGoal.id,
            targetEmployeeId: employeeId,
            error: error instanceof Error ? error.message : 'Unknown sync error',
            suggestion: 'Review shared goal data and retry',
          });
        }
      }

      if (syncedGoals > 0) {
        updatedSheets = 1;
      }

      return {
        success: errors.length === 0,
        syncedGoals,
        failedGoals,
        orphanedGoals,
        updatedSheets,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        syncedGoals: 0,
        failedGoals: sharedGoals.length,
        orphanedGoals: 0,
        updatedSheets: 0,
        errors: [{
          sharedGoalId: 'employee-sync',
          targetEmployeeId: employeeId,
          error: error instanceof Error ? error.message : 'Unknown employee sync error',
          suggestion: 'Review employee data and retry sync',
        }],
      };
    }
  }

  private async checkWeightageConsistency(cycleId: string): Promise<string[]> {
    // Check for shared goals with invalid weightages
    const invalidWeightages = await prisma.sharedGoal.findMany({
      where: {
        newCycleId: cycleId,
        OR: [
          { weightage: { lt: 0 } },
          { weightage: { gt: 100 } },
        ],
      },
      select: { id: true },
    });

    return invalidWeightages.map(sg => sg.id);
  }

  private async createSyncAuditLog(data: {
    cycleId: string;
    totalSharedGoals: number;
    successfulSyncs: number;
    failedSyncs: number;
    orphanedGoals: number;
    syncedGoals: number;
    updatedSheets: number;
    errors: SyncError[];
    duration: number;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        entityType: 'SharedGoalSync',
        entityId: data.cycleId,
        userId: 'system',
        action: 'SYNCHRONIZE_SHARED_GOALS',
        oldValue: {
          totalSharedGoals: data.totalSharedGoals,
        },
        newValue: {
          syncResults: {
            successfulSyncs: data.successfulSyncs,
            failedSyncs: data.failedSyncs,
            orphanedGoals: data.orphanedGoals,
            syncedGoals: data.syncedGoals,
            updatedSheets: data.updatedSheets,
            duration: data.duration,
            errors: data.errors.length,
          },
        },
        reason: 'Automatic shared goal synchronization during stage transition',
      },
    });
  }
}

// Export singleton instance
export const sharedGoalManagerService = new SharedGoalManagerService();