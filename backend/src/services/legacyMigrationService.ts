import { prisma } from '../lib/prisma.js';
import { Phase, Quarter, StageName } from '@prisma/client';

export interface MigrationResult {
  success: boolean;
  migratedCycles: number;
  migratedGoals: number;
  migratedSharedGoals: number;
  errors: MigrationError[];
  auditLogId: string;
  summary: MigrationSummary;
}

export interface MigrationError {
  entityType: string;
  entityId: string;
  error: string;
  suggestion: string;
}

export interface MigrationSummary {
  totalLegacyCycles: number;
  successfulMigrations: number;
  failedMigrations: number;
  skippedCycles: number;
  dataPreservationRate: number;
}

export interface MigrationOptions {
  dryRun?: boolean;
  batchSize?: number;
  skipExisting?: boolean;
  preserveTimestamps?: boolean;
}

export class LegacyMigrationService {
  // Mapping from legacy phases to cycle-stage combinations
  private readonly PHASE_TO_CYCLE_STAGE_MAPPING = {
    [Phase.GOAL_SETTING]: {
      quarter: Quarter.Q1,
      stage: StageName.Planning,
      description: 'Goal setting phase mapped to Q1 Planning stage',
    },
    [Phase.Q1]: {
      quarter: Quarter.Q1,
      stage: StageName.Execution,
      description: 'Q1 execution phase',
    },
    [Phase.Q2]: {
      quarter: Quarter.Q2,
      stage: StageName.Execution,
      description: 'Q2 execution phase',
    },
    [Phase.Q3]: {
      quarter: Quarter.Q3,
      stage: StageName.Execution,
      description: 'Q3 execution phase',
    },
    [Phase.Q4]: {
      quarter: Quarter.Q4,
      stage: StageName.Review,
      description: 'Q4 review phase',
    },
  };

  /**
   * Main migration method to convert legacy GoalCycle records to cycle-stage structure
   */
  async migrateLegacyData(options: MigrationOptions = {}): Promise<MigrationResult> {
    const {
      dryRun = false,
      batchSize = 50,
      skipExisting = true,
      preserveTimestamps = true,
    } = options;

    const startTime = Date.now();
    const errors: MigrationError[] = [];
    let migratedCycles = 0;
    let migratedGoals = 0;
    let migratedSharedGoals = 0;

    try {
      // Get all legacy cycles
      const legacyCycles = await prisma.goalCycle.findMany({
        include: {
          goalSheets: {
            include: {
              goals: {
                include: {
                  achievements: true,
                  sharedCopies: true,
                },
              },
              employee: true,
            },
          },
          sharedGoals: {
            include: {
              sourceGoal: true,
              targetEmployee: true,
            },
          },
          createdBy: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      const totalLegacyCycles = legacyCycles.length;
      let successfulMigrations = 0;
      let failedMigrations = 0;
      let skippedCycles = 0;

      // Process cycles in batches
      for (let i = 0; i < legacyCycles.length; i += batchSize) {
        const batch = legacyCycles.slice(i, i + batchSize);
        
        for (const legacyCycle of batch) {
          try {
            const migrationResult = await this.migrateSingleCycle(
              legacyCycle,
              { dryRun, skipExisting, preserveTimestamps }
            );

            if (migrationResult.success) {
              successfulMigrations++;
              migratedCycles++;
              migratedGoals += migrationResult.migratedGoals;
              migratedSharedGoals += migrationResult.migratedSharedGoals;
            } else if (migrationResult.skipped) {
              skippedCycles++;
            } else {
              failedMigrations++;
              errors.push(...migrationResult.errors);
            }
          } catch (error) {
            failedMigrations++;
            errors.push({
              entityType: 'GoalCycle',
              entityId: legacyCycle.id,
              error: error instanceof Error ? error.message : 'Unknown error',
              suggestion: 'Review cycle data and retry migration',
            });
          }
        }

        // Progress logging for large migrations
        if (legacyCycles.length > 100) {
          console.log(`Migration progress: ${i + batch.length}/${legacyCycles.length} cycles processed`);
        }
      }

      // Create audit log
      const auditLogId = await this.createMigrationAuditLog({
        totalLegacyCycles,
        successfulMigrations,
        failedMigrations,
        skippedCycles,
        migratedGoals,
        migratedSharedGoals,
        errors,
        dryRun,
        duration: Date.now() - startTime,
      });

      const dataPreservationRate = totalLegacyCycles > 0 
        ? (successfulMigrations / totalLegacyCycles) * 100 
        : 100;

      return {
        success: errors.length === 0,
        migratedCycles,
        migratedGoals,
        migratedSharedGoals,
        errors,
        auditLogId,
        summary: {
          totalLegacyCycles,
          successfulMigrations,
          failedMigrations,
          skippedCycles,
          dataPreservationRate,
        },
      };
    } catch (error) {
      // Create error audit log
      const auditLogId = await this.createMigrationAuditLog({
        totalLegacyCycles: 0,
        successfulMigrations: 0,
        failedMigrations: 1,
        skippedCycles: 0,
        migratedGoals: 0,
        migratedSharedGoals: 0,
        errors: [{
          entityType: 'Migration',
          entityId: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system logs and database connectivity',
        }],
        dryRun,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        migratedCycles: 0,
        migratedGoals: 0,
        migratedSharedGoals: 0,
        errors: [{
          entityType: 'Migration',
          entityId: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system logs and database connectivity',
        }],
        auditLogId,
        summary: {
          totalLegacyCycles: 0,
          successfulMigrations: 0,
          failedMigrations: 1,
          skippedCycles: 0,
          dataPreservationRate: 0,
        },
      };
    }
  }

  /**
   * Migrate a single legacy cycle to the new structure
   */
  private async migrateSingleCycle(
    legacyCycle: any,
    options: { dryRun: boolean; skipExisting: boolean; preserveTimestamps: boolean }
  ): Promise<{
    success: boolean;
    skipped?: boolean;
    migratedGoals: number;
    migratedSharedGoals: number;
    errors: MigrationError[];
  }> {
    const { dryRun, skipExisting, preserveTimestamps } = options;
    const errors: MigrationError[] = [];

    try {
      // Map legacy phase to cycle-stage combination
      const mapping = this.PHASE_TO_CYCLE_STAGE_MAPPING[legacyCycle.phase];
      if (!mapping) {
        errors.push({
          entityType: 'GoalCycle',
          entityId: legacyCycle.id,
          error: `Unknown legacy phase: ${legacyCycle.phase}`,
          suggestion: 'Update phase mapping configuration',
        });
        return { success: false, migratedGoals: 0, migratedSharedGoals: 0, errors };
      }

      // Generate new cycle name
      const cycleName = `${mapping.quarter} ${legacyCycle.year}`;

      // Check if cycle already exists
      if (skipExisting) {
        const existingCycle = await prisma.newGoalCycle.findUnique({
          where: {
            quarter_year: {
              quarter: mapping.quarter,
              year: legacyCycle.year,
            },
          },
        });

        if (existingCycle) {
          return { success: true, skipped: true, migratedGoals: 0, migratedSharedGoals: 0, errors: [] };
        }
      }

      if (dryRun) {
        // Dry run - just validate without creating
        return {
          success: true,
          migratedGoals: legacyCycle.goalSheets.reduce((sum: number, sheet: any) => sum + sheet.goals.length, 0),
          migratedSharedGoals: legacyCycle.sharedGoals.length,
          errors: [],
        };
      }

      // Perform actual migration in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create new cycle
        const newCycle = await tx.newGoalCycle.create({
          data: {
            name: cycleName,
            quarter: mapping.quarter,
            year: legacyCycle.year,
            isActive: legacyCycle.isActive,
            createdById: legacyCycle.createdById,
            createdAt: preserveTimestamps ? legacyCycle.createdAt : undefined,
            updatedAt: preserveTimestamps ? legacyCycle.updatedAt : undefined,
          },
        });

        // Create default stages
        const stages = await this.createDefaultStages(tx, newCycle.id, mapping.stage);

        // Migrate goal sheets
        let migratedGoals = 0;
        for (const goalSheet of legacyCycle.goalSheets) {
          await tx.goalSheet.update({
            where: { id: goalSheet.id },
            data: { newCycleId: newCycle.id },
          });
          migratedGoals += goalSheet.goals.length;
        }

        // Migrate shared goals
        let migratedSharedGoals = 0;
        for (const sharedGoal of legacyCycle.sharedGoals) {
          await tx.sharedGoal.update({
            where: { id: sharedGoal.id },
            data: { newCycleId: newCycle.id },
          });
          migratedSharedGoals++;
        }

        return { migratedGoals, migratedSharedGoals };
      });

      return {
        success: true,
        migratedGoals: result.migratedGoals,
        migratedSharedGoals: result.migratedSharedGoals,
        errors: [],
      };
    } catch (error) {
      errors.push({
        entityType: 'GoalCycle',
        entityId: legacyCycle.id,
        error: error instanceof Error ? error.message : 'Unknown error during migration',
        suggestion: 'Check data integrity and retry',
      });

      return { success: false, migratedGoals: 0, migratedSharedGoals: 0, errors };
    }
  }

  /**
   * Create default stages for a new cycle
   */
  private async createDefaultStages(
    tx: any,
    cycleId: string,
    activeStage: StageName
  ) {
    const defaultStages = [
      { stageName: StageName.Planning, sequenceOrder: 1 },
      { stageName: StageName.Approval, sequenceOrder: 2 },
      { stageName: StageName.Locked, sequenceOrder: 3 },
      { stageName: StageName.Execution, sequenceOrder: 4 },
      { stageName: StageName.Review, sequenceOrder: 5 },
    ];

    const stages = await Promise.all(
      defaultStages.map((stage) =>
        tx.cycleStage.create({
          data: {
            cycleId,
            stageName: stage.stageName,
            sequenceOrder: stage.sequenceOrder,
            isActive: stage.stageName === activeStage,
            startDate: stage.stageName === activeStage ? new Date() : null,
          },
        })
      )
    );

    return stages;
  }

  /**
   * Validate legacy data before migration
   */
  async validateLegacyData(): Promise<{
    isValid: boolean;
    issues: Array<{ type: string; description: string; count: number }>;
  }> {
    const issues: Array<{ type: string; description: string; count: number }> = [];

    try {
      // Check for cycles with invalid phases
      const invalidPhases = await prisma.goalCycle.count({
        where: {
          phase: {
            notIn: Object.values(Phase),
          },
        },
      });

      if (invalidPhases > 0) {
        issues.push({
          type: 'INVALID_PHASE',
          description: 'Cycles with unrecognized phase values',
          count: invalidPhases,
        });
      }

      // Check for orphaned goal sheets
      const orphanedSheets = await prisma.goalSheet.count({
        where: {
          cycle: null,
        },
      });

      if (orphanedSheets > 0) {
        issues.push({
          type: 'ORPHANED_SHEETS',
          description: 'Goal sheets without valid cycle references',
          count: orphanedSheets,
        });
      }

      // Check for orphaned shared goals
      const orphanedSharedGoals = await prisma.sharedGoal.count({
        where: {
          cycle: null,
        },
      });

      if (orphanedSharedGoals > 0) {
        issues.push({
          type: 'ORPHANED_SHARED_GOALS',
          description: 'Shared goals without valid cycle references',
          count: orphanedSharedGoals,
        });
      }

      // Check for duplicate cycles (same year/phase)
      const duplicateCycles = await prisma.$queryRaw<Array<{ year: number; phase: Phase; count: number }>>`
        SELECT year, phase, COUNT(*) as count
        FROM "GoalCycle"
        GROUP BY year, phase
        HAVING COUNT(*) > 1
      `;

      if (duplicateCycles.length > 0) {
        const totalDuplicates = duplicateCycles.reduce((sum, dup) => sum + Number(dup.count) - 1, 0);
        issues.push({
          type: 'DUPLICATE_CYCLES',
          description: 'Multiple cycles with same year and phase',
          count: totalDuplicates,
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
        count: 1,
      });

      return {
        isValid: false,
        issues,
      };
    }
  }

  /**
   * Get migration status and progress
   */
  async getMigrationStatus(): Promise<{
    totalLegacyCycles: number;
    migratedCycles: number;
    pendingMigration: number;
    lastMigrationDate: Date | null;
    migrationProgress: number;
  }> {
    const [totalLegacy, totalNew, lastMigration] = await Promise.all([
      prisma.goalCycle.count(),
      prisma.newGoalCycle.count(),
      prisma.auditLog.findFirst({
        where: {
          entityType: 'Migration',
          action: 'LEGACY_MIGRATION',
        },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    const migrationProgress = totalLegacy > 0 ? (totalNew / totalLegacy) * 100 : 100;

    return {
      totalLegacyCycles: totalLegacy,
      migratedCycles: totalNew,
      pendingMigration: Math.max(0, totalLegacy - totalNew),
      lastMigrationDate: lastMigration?.timestamp || null,
      migrationProgress: Math.min(100, migrationProgress),
    };
  }

  /**
   * Create comprehensive audit log for migration
   */
  private async createMigrationAuditLog(data: {
    totalLegacyCycles: number;
    successfulMigrations: number;
    failedMigrations: number;
    skippedCycles: number;
    migratedGoals: number;
    migratedSharedGoals: number;
    errors: MigrationError[];
    dryRun: boolean;
    duration: number;
  }): Promise<string> {
    const auditLog = await prisma.auditLog.create({
      data: {
        entityType: 'Migration',
        entityId: 'legacy-to-cycle-stage',
        userId: 'system',
        action: data.dryRun ? 'DRY_RUN_MIGRATION' : 'LEGACY_MIGRATION',
        oldValue: {
          legacyStructure: 'phase-based cycles',
          totalLegacyCycles: data.totalLegacyCycles,
        },
        newValue: {
          newStructure: 'cycle-stage architecture',
          migrationResults: {
            successfulMigrations: data.successfulMigrations,
            failedMigrations: data.failedMigrations,
            skippedCycles: data.skippedCycles,
            migratedGoals: data.migratedGoals,
            migratedSharedGoals: data.migratedSharedGoals,
            dataPreservationRate: data.totalLegacyCycles > 0 
              ? (data.successfulMigrations / data.totalLegacyCycles) * 100 
              : 100,
            duration: data.duration,
            errors: data.errors,
          },
        },
        reason: data.dryRun 
          ? 'Dry run migration to validate legacy data conversion'
          : 'Production migration from legacy phase-based to cycle-stage architecture',
      },
    });

    return auditLog.id;
  }

  /**
   * Generate migration report
   */
  async generateMigrationReport(migrationResult: MigrationResult): Promise<string> {
    const { summary, errors } = migrationResult;
    
    let report = `# Legacy Data Migration Report\n\n`;
    report += `**Migration Date:** ${new Date().toISOString()}\n`;
    report += `**Status:** ${migrationResult.success ? 'SUCCESS' : 'PARTIAL SUCCESS'}\n\n`;
    
    report += `## Summary\n`;
    report += `- Total Legacy Cycles: ${summary.totalLegacyCycles}\n`;
    report += `- Successfully Migrated: ${summary.successfulMigrations}\n`;
    report += `- Failed Migrations: ${summary.failedMigrations}\n`;
    report += `- Skipped Cycles: ${summary.skippedCycles}\n`;
    report += `- Data Preservation Rate: ${summary.dataPreservationRate.toFixed(2)}%\n`;
    report += `- Migrated Goals: ${migrationResult.migratedGoals}\n`;
    report += `- Migrated Shared Goals: ${migrationResult.migratedSharedGoals}\n\n`;

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

    report += `## Phase to Cycle-Stage Mapping\n\n`;
    Object.entries(this.PHASE_TO_CYCLE_STAGE_MAPPING).forEach(([phase, mapping]) => {
      report += `- **${phase}** → ${mapping.quarter} ${mapping.stage} (${mapping.description})\n`;
    });

    return report;
  }
}

// Export singleton instance
export const legacyMigrationService = new LegacyMigrationService();