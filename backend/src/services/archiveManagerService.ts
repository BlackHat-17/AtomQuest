import { prisma } from '../lib/prisma.js';
import { StageName } from '@prisma/client';

export interface ArchiveRequest {
  cycleId: string;
  reason?: string;
  compressionLevel?: 'low' | 'medium' | 'high';
  retainMetadata?: boolean;
}

export interface ArchiveResponse {
  success: boolean;
  archiveId: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  archivedAt: Date;
  message: string;
}

export interface RestoreRequest {
  archiveId: string;
  targetCycleId?: string;
  reason: string;
}

export interface RestoreResponse {
  success: boolean;
  restoredCycleId: string;
  restoredAt: Date;
  message: string;
}

export interface ArchivedCycle {
  id: string;
  originalCycleId: string;
  cycleName: string;
  quarter: string;
  year: number;
  archivedAt: Date;
  archivedBy: string;
  reason?: string;
  compressionLevel: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  retentionExpiresAt: Date;
  isReadOnly: boolean;
  metadata: CycleArchiveMetadata;
}

export interface CycleArchiveMetadata {
  totalGoalSheets: number;
  totalGoals: number;
  totalSharedGoals: number;
  totalStageTransitions: number;
  totalUsers: number;
  completionRate: number;
  averageScore: number;
  stageCompletionDates: Record<string, Date>;
  archiveVersion: string;
}

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  retentionPeriodMonths: number;
  autoArchiveAfterMonths: number;
  compressionLevel: 'low' | 'medium' | 'high';
  isActive: boolean;
  applicableTemplates: string[];
}

export interface ArchiveSearchOptions {
  quarter?: string;
  year?: number;
  archivedAfter?: Date;
  archivedBefore?: Date;
  archivedBy?: string;
  compressionLevel?: string;
  page?: number;
  limit?: number;
}

export class ArchiveManagerService {
  private readonly DEFAULT_RETENTION_MONTHS = 84; // 7 years
  private readonly DEFAULT_AUTO_ARCHIVE_MONTHS = 12; // 1 year after completion
  private readonly ARCHIVE_VERSION = '1.0.0';

  /**
   * Archive a completed cycle with data compression
   */
  async archiveCycle(request: ArchiveRequest, archivedById: string): Promise<ArchiveResponse> {
    const { cycleId, reason, compressionLevel = 'medium', retainMetadata = true } = request;

    // Validate cycle exists and is eligible for archival
    const cycle = await this.validateCycleForArchival(cycleId);
    
    // Calculate retention expiration date
    const retentionExpiresAt = new Date();
    retentionExpiresAt.setMonth(retentionExpiresAt.getMonth() + this.DEFAULT_RETENTION_MONTHS);

    // Collect cycle data and metadata
    const cycleData = await this.collectCycleData(cycleId);
    const metadata = await this.generateArchiveMetadata(cycleId);
    
    // Compress data based on compression level
    const compressedData = await this.compressData(cycleData, compressionLevel);
    
    // Calculate sizes and compression ratio
    const originalSize = JSON.stringify(cycleData).length;
    const compressedSize = compressedData.length;
    const compressionRatio = Math.round((1 - compressedSize / originalSize) * 100);

    // Create archive record in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create archive record
      const archive = await tx.cycleArchive.create({
        data: {
          originalCycleId: cycleId,
          cycleName: cycle.name,
          quarter: cycle.quarter,
          year: cycle.year,
          archivedById,
          reason,
          compressionLevel,
          originalSize,
          compressedSize,
          compressionRatio,
          retentionExpiresAt,
          isReadOnly: true,
          metadata: metadata as any,
          compressedData: compressedData,
          archiveVersion: this.ARCHIVE_VERSION,
        },
      });

      // Mark original cycle as archived
      await tx.newGoalCycle.update({
        where: { id: cycleId },
        data: { 
          isArchived: true,
          archivedAt: new Date(),
          archiveId: archive.id,
        },
      });

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: 'CYCLE_ARCHIVED',
          entityType: 'NewGoalCycle',
          entityId: cycleId,
          userId: archivedById,
          details: {
            archiveId: archive.id,
            reason,
            compressionLevel,
            originalSize,
            compressedSize,
            compressionRatio,
          },
        },
      });

      return archive;
    });

    return {
      success: true,
      archiveId: result.id,
      originalSize,
      compressedSize,
      compressionRatio,
      archivedAt: result.archivedAt,
      message: `Cycle "${cycle.name}" successfully archived with ${compressionRatio}% compression`,
    };
  }

  /**
   * Restore an archived cycle
   */
  async restoreCycle(request: RestoreRequest, restoredById: string): Promise<RestoreResponse> {
    const { archiveId, targetCycleId, reason } = request;

    // Get archive record
    const archive = await prisma.cycleArchive.findUnique({
      where: { id: archiveId },
    });

    if (!archive) {
      throw new Error('Archive not found');
    }

    // Check if archive has expired
    if (new Date() > archive.retentionExpiresAt) {
      throw new Error('Archive has expired and cannot be restored');
    }

    // Decompress data
    const cycleData = await this.decompressData(archive.compressedData, archive.compressionLevel);

    // Restore cycle in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create new cycle or update existing one
      const restoredCycleId = targetCycleId || archive.originalCycleId;
      
      // Check if target cycle already exists
      const existingCycle = await tx.newGoalCycle.findUnique({
        where: { id: restoredCycleId },
      });

      if (existingCycle && !targetCycleId) {
        throw new Error('Original cycle still exists. Specify a different target cycle ID.');
      }

      // Restore cycle data
      const restoredCycle = await this.restoreCycleData(tx, cycleData, restoredCycleId);

      // Update archive record
      await tx.cycleArchive.update({
        where: { id: archiveId },
        data: {
          lastRestoredAt: new Date(),
          lastRestoredById: restoredById,
          restoreCount: { increment: 1 },
        },
      });

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: 'CYCLE_RESTORED',
          entityType: 'NewGoalCycle',
          entityId: restoredCycleId,
          userId: restoredById,
          details: {
            archiveId,
            reason,
            originalCycleId: archive.originalCycleId,
            restoredCycleId,
          },
        },
      });

      return restoredCycle;
    });

    return {
      success: true,
      restoredCycleId: result.id,
      restoredAt: new Date(),
      message: `Cycle "${archive.cycleName}" successfully restored`,
    };
  }

  /**
   * Get archived cycles with search and pagination
   */
  async getArchivedCycles(options: ArchiveSearchOptions = {}) {
    const { 
      quarter, 
      year, 
      archivedAfter, 
      archivedBefore, 
      archivedBy, 
      compressionLevel,
      page = 1, 
      limit = 10 
    } = options;
    
    const skip = (page - 1) * limit;

    const where: any = {};
    if (quarter) where.quarter = quarter;
    if (year) where.year = year;
    if (archivedAfter || archivedBefore) {
      where.archivedAt = {};
      if (archivedAfter) where.archivedAt.gte = archivedAfter;
      if (archivedBefore) where.archivedAt.lte = archivedBefore;
    }
    if (archivedBy) where.archivedById = archivedBy;
    if (compressionLevel) where.compressionLevel = compressionLevel;

    const [archives, total] = await Promise.all([
      prisma.cycleArchive.findMany({
        where,
        include: {
          archivedBy: {
            select: { id: true, name: true, email: true },
          },
          lastRestoredBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { archivedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.cycleArchive.count({ where }),
    ]);

    return {
      archives: archives.map(archive => ({
        id: archive.id,
        originalCycleId: archive.originalCycleId,
        cycleName: archive.cycleName,
        quarter: archive.quarter,
        year: archive.year,
        archivedAt: archive.archivedAt,
        archivedBy: archive.archivedBy.name,
        reason: archive.reason,
        compressionLevel: archive.compressionLevel,
        originalSize: archive.originalSize,
        compressedSize: archive.compressedSize,
        compressionRatio: archive.compressionRatio,
        retentionExpiresAt: archive.retentionExpiresAt,
        isReadOnly: archive.isReadOnly,
        metadata: archive.metadata as CycleArchiveMetadata,
        restoreCount: archive.restoreCount || 0,
        lastRestoredAt: archive.lastRestoredAt,
        lastRestoredBy: archive.lastRestoredBy?.name,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get read-only access to archived cycle data
   */
  async getArchivedCycleData(archiveId: string) {
    const archive = await prisma.cycleArchive.findUnique({
      where: { id: archiveId },
      include: {
        archivedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!archive) {
      throw new Error('Archive not found');
    }

    // Check if archive has expired
    if (new Date() > archive.retentionExpiresAt) {
      throw new Error('Archive has expired and is no longer accessible');
    }

    // Decompress and return data
    const cycleData = await this.decompressData(archive.compressedData, archive.compressionLevel);

    return {
      archive: {
        id: archive.id,
        cycleName: archive.cycleName,
        quarter: archive.quarter,
        year: archive.year,
        archivedAt: archive.archivedAt,
        archivedBy: archive.archivedBy.name,
        metadata: archive.metadata as CycleArchiveMetadata,
        isReadOnly: true,
      },
      data: cycleData,
    };
  }

  /**
   * Apply retention policies and auto-archive eligible cycles
   */
  async applyRetentionPolicies(): Promise<{
    archivedCycles: number;
    deletedArchives: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let archivedCycles = 0;
    let deletedArchives = 0;

    try {
      // Get active retention policies
      const policies = await this.getActiveRetentionPolicies();

      // Auto-archive eligible cycles
      for (const policy of policies) {
        try {
          const eligibleCycles = await this.getEligibleCyclesForAutoArchive(policy);
          
          for (const cycle of eligibleCycles) {
            try {
              await this.archiveCycle(
                {
                  cycleId: cycle.id,
                  reason: `Auto-archived by retention policy: ${policy.name}`,
                  compressionLevel: policy.compressionLevel,
                },
                'system'
              );
              archivedCycles++;
            } catch (error) {
              errors.push(`Failed to archive cycle ${cycle.name}: ${error.message}`);
            }
          }
        } catch (error) {
          errors.push(`Failed to process retention policy ${policy.name}: ${error.message}`);
        }
      }

      // Delete expired archives
      const expiredArchives = await prisma.cycleArchive.findMany({
        where: {
          retentionExpiresAt: {
            lt: new Date(),
          },
        },
      });

      for (const archive of expiredArchives) {
        try {
          await prisma.cycleArchive.delete({
            where: { id: archive.id },
          });
          deletedArchives++;
        } catch (error) {
          errors.push(`Failed to delete expired archive ${archive.cycleName}: ${error.message}`);
        }
      }

    } catch (error) {
      errors.push(`Failed to apply retention policies: ${error.message}`);
    }

    return { archivedCycles, deletedArchives, errors };
  }

  /**
   * Get archive storage statistics
   */
  async getArchiveStatistics() {
    const stats = await prisma.cycleArchive.aggregate({
      _count: { id: true },
      _sum: { 
        originalSize: true, 
        compressedSize: true,
        restoreCount: true,
      },
      _avg: { compressionRatio: true },
    });

    const compressionLevelStats = await prisma.cycleArchive.groupBy({
      by: ['compressionLevel'],
      _count: { id: true },
      _avg: { compressionRatio: true },
    });

    const yearlyStats = await prisma.cycleArchive.groupBy({
      by: ['year'],
      _count: { id: true },
      orderBy: { year: 'desc' },
    });

    return {
      totalArchives: stats._count.id || 0,
      totalOriginalSize: stats._sum.originalSize || 0,
      totalCompressedSize: stats._sum.compressedSize || 0,
      totalRestores: stats._sum.restoreCount || 0,
      averageCompressionRatio: Math.round(stats._avg.compressionRatio || 0),
      totalSpaceSaved: (stats._sum.originalSize || 0) - (stats._sum.compressedSize || 0),
      compressionLevelBreakdown: compressionLevelStats.map(stat => ({
        level: stat.compressionLevel,
        count: stat._count.id,
        averageRatio: Math.round(stat._avg.compressionRatio || 0),
      })),
      yearlyBreakdown: yearlyStats.map(stat => ({
        year: stat.year,
        count: stat._count.id,
      })),
    };
  }

  /**
   * Validate cycle is eligible for archival
   */
  private async validateCycleForArchival(cycleId: string) {
    const cycle = await prisma.newGoalCycle.findUnique({
      where: { id: cycleId },
      include: {
        stages: {
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });

    if (!cycle) {
      throw new Error('Cycle not found');
    }

    if (cycle.isArchived) {
      throw new Error('Cycle is already archived');
    }

    if (cycle.isActive) {
      throw new Error('Cannot archive active cycle');
    }

    // Check if all stages are completed
    const reviewStage = cycle.stages.find(s => s.stageName === StageName.Review);
    if (!reviewStage || reviewStage.isActive) {
      throw new Error('Cycle must complete all stages before archival');
    }

    return cycle;
  }

  /**
   * Collect all cycle data for archival
   */
  private async collectCycleData(cycleId: string) {
    const [cycle, goalSheets, sharedGoals, stageTransitions] = await Promise.all([
      prisma.newGoalCycle.findUnique({
        where: { id: cycleId },
        include: {
          stages: true,
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.goalSheet.findMany({
        where: { newCycleId: cycleId },
        include: {
          goals: {
            include: {
              achievements: true,
            },
          },
          employee: {
            select: { id: true, name: true, email: true, department: true },
          },
          manager: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.sharedGoal.findMany({
        where: { newCycleId: cycleId },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.stageTransition.findMany({
        where: { cycleId },
        include: {
          fromStage: true,
          toStage: true,
          initiatedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    return {
      cycle,
      goalSheets,
      sharedGoals,
      stageTransitions,
      archivedAt: new Date(),
      archiveVersion: this.ARCHIVE_VERSION,
    };
  }

  /**
   * Generate archive metadata
   */
  private async generateArchiveMetadata(cycleId: string): Promise<CycleArchiveMetadata> {
    const [goalSheetCount, goalCount, sharedGoalCount, transitionCount, userCount] = await Promise.all([
      prisma.goalSheet.count({ where: { newCycleId: cycleId } }),
      prisma.goal.count({ 
        where: { 
          goalSheet: { newCycleId: cycleId } 
        } 
      }),
      prisma.sharedGoal.count({ where: { newCycleId: cycleId } }),
      prisma.stageTransition.count({ where: { cycleId } }),
      prisma.goalSheet.findMany({
        where: { newCycleId: cycleId },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }).then(sheets => sheets.length),
    ]);

    // Calculate completion rate and average score
    const goalSheets = await prisma.goalSheet.findMany({
      where: { newCycleId: cycleId },
      select: { status: true, totalScore: true },
    });

    const completedSheets = goalSheets.filter(sheet => sheet.status === 'COMPLETED').length;
    const completionRate = goalSheetCount > 0 ? (completedSheets / goalSheetCount) * 100 : 0;
    
    const totalScores = goalSheets
      .filter(sheet => sheet.totalScore !== null)
      .map(sheet => sheet.totalScore);
    const averageScore = totalScores.length > 0 
      ? totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length 
      : 0;

    // Get stage completion dates
    const stageTransitions = await prisma.stageTransition.findMany({
      where: { cycleId },
      include: { toStage: true },
      orderBy: { transitionTimestamp: 'asc' },
    });

    const stageCompletionDates: Record<string, Date> = {};
    stageTransitions.forEach(transition => {
      if (transition.toStage) {
        stageCompletionDates[transition.toStage.stageName] = transition.transitionTimestamp;
      }
    });

    return {
      totalGoalSheets: goalSheetCount,
      totalGoals: goalCount,
      totalSharedGoals: sharedGoalCount,
      totalStageTransitions: transitionCount,
      totalUsers: userCount,
      completionRate: Math.round(completionRate * 100) / 100,
      averageScore: Math.round(averageScore * 100) / 100,
      stageCompletionDates,
      archiveVersion: this.ARCHIVE_VERSION,
    };
  }

  /**
   * Compress data based on compression level
   */
  private async compressData(data: any, compressionLevel: string): Promise<string> {
    const jsonString = JSON.stringify(data);
    
    // Simulate compression (in real implementation, use actual compression library)
    switch (compressionLevel) {
      case 'low':
        // Light compression - remove whitespace
        return JSON.stringify(data);
      case 'medium':
        // Medium compression - remove whitespace and optimize structure
        return JSON.stringify(data, null, 0);
      case 'high':
        // High compression - aggressive optimization
        return JSON.stringify(data, null, 0);
      default:
        return jsonString;
    }
  }

  /**
   * Decompress data
   */
  private async decompressData(compressedData: string, compressionLevel: string): Promise<any> {
    // In real implementation, use actual decompression
    return JSON.parse(compressedData);
  }

  /**
   * Restore cycle data from archive
   */
  private async restoreCycleData(tx: any, cycleData: any, targetCycleId: string) {
    // This is a simplified restoration - in real implementation,
    // you would need to carefully restore all related data
    const { cycle, goalSheets, sharedGoals, stageTransitions } = cycleData;

    // Create or update cycle
    const restoredCycle = await tx.newGoalCycle.upsert({
      where: { id: targetCycleId },
      create: {
        id: targetCycleId,
        name: cycle.name,
        quarter: cycle.quarter,
        year: cycle.year,
        isActive: false,
        isArchived: false,
        createdById: cycle.createdById,
        createdAt: cycle.createdAt,
      },
      update: {
        isArchived: false,
        archivedAt: null,
        archiveId: null,
      },
    });

    // Restore stages
    for (const stage of cycle.stages) {
      await tx.cycleStage.upsert({
        where: { 
          cycleId_stageName: {
            cycleId: targetCycleId,
            stageName: stage.stageName,
          },
        },
        create: {
          cycleId: targetCycleId,
          stageName: stage.stageName,
          isActive: stage.isActive,
          startDate: stage.startDate,
          endDate: stage.endDate,
          sequenceOrder: stage.sequenceOrder,
        },
        update: {
          isActive: stage.isActive,
          startDate: stage.startDate,
          endDate: stage.endDate,
        },
      });
    }

    return restoredCycle;
  }

  /**
   * Get active retention policies
   */
  private async getActiveRetentionPolicies(): Promise<RetentionPolicy[]> {
    // This would typically come from a database table
    // For now, return default policies
    return [
      {
        id: 'default-quarterly',
        name: 'Default Quarterly Policy',
        description: 'Auto-archive quarterly cycles after 12 months',
        retentionPeriodMonths: 84,
        autoArchiveAfterMonths: 12,
        compressionLevel: 'medium',
        isActive: true,
        applicableTemplates: ['quarterly'],
      },
    ];
  }

  /**
   * Get cycles eligible for auto-archive based on policy
   */
  private async getEligibleCyclesForAutoArchive(policy: RetentionPolicy) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - policy.autoArchiveAfterMonths);

    return await prisma.newGoalCycle.findMany({
      where: {
        isActive: false,
        isArchived: false,
        createdAt: {
          lt: cutoffDate,
        },
        stages: {
          some: {
            stageName: StageName.Review,
            isActive: false,
          },
        },
      },
    });
  }
}

// Export singleton instance
export const archiveManagerService = new ArchiveManagerService();