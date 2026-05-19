import { prisma } from '../lib/prisma.js';
import { Quarter, StageName } from '@prisma/client';

export interface CreateCycleRequest {
  quarter: Quarter;
  year: number;
  isActive?: boolean;
}

export interface CreateCycleResponse {
  id: string;
  name: string;
  quarter: Quarter;
  year: number;
  isActive: boolean;
  stages: Array<{
    id: string;
    stageName: StageName;
    sequenceOrder: number;
    isActive: boolean;
  }>;
  createdAt: Date;
}

export interface CycleValidationResult {
  isValid: boolean;
  error?: string;
}

export class CycleManagerService {
  /**
   * Create a new cycle with automatic name generation and default stages
   */
  async createCycle(request: CreateCycleRequest, createdById: string): Promise<CreateCycleResponse> {
    const { quarter, year, isActive = false } = request;

    // Generate cycle name in format "Q1 2026"
    const name = `${quarter} ${year}`;

    // Validate cycle uniqueness
    const validation = await this.validateCycleName(quarter, year);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // If this cycle should be active, deactivate all other cycles
    if (isActive) {
      await this.deactivateAllCycles();
    }

    // Create cycle with default stages in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the cycle
      const cycle = await tx.newGoalCycle.create({
        data: {
          name,
          quarter,
          year,
          isActive,
          createdById,
        },
      });

      // Create default stages
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
              cycleId: cycle.id,
              stageName: stage.stageName,
              sequenceOrder: stage.sequenceOrder,
              isActive: stage.sequenceOrder === 1, // Planning stage is active by default
            },
          })
        )
      );

      return { cycle, stages };
    });

    return {
      id: result.cycle.id,
      name: result.cycle.name,
      quarter: result.cycle.quarter,
      year: result.cycle.year,
      isActive: result.cycle.isActive,
      stages: result.stages.map((stage) => ({
        id: stage.id,
        stageName: stage.stageName,
        sequenceOrder: stage.sequenceOrder,
        isActive: stage.isActive,
      })),
      createdAt: result.cycle.createdAt,
    };
  }

  /**
   * Activate a cycle (deactivates all others)
   */
  async activateCycle(cycleId: string): Promise<void> {
    // First deactivate all cycles
    await this.deactivateAllCycles();

    // Then activate the specified cycle
    await prisma.newGoalCycle.update({
      where: { id: cycleId },
      data: { isActive: true },
    });
  }

  /**
   * Deactivate a specific cycle
   */
  async deactivateCycle(cycleId: string): Promise<void> {
    await prisma.newGoalCycle.update({
      where: { id: cycleId },
      data: { isActive: false },
    });
  }

  /**
   * Get the currently active cycle
   */
  async getActiveCycle() {
    return await prisma.newGoalCycle.findFirst({
      where: { isActive: true },
      include: {
        stages: {
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });
  }

  /**
   * Get all cycles for a specific year
   */
  async getCyclesByYear(year: number) {
    return await prisma.newGoalCycle.findMany({
      where: { year },
      include: {
        stages: {
          orderBy: { sequenceOrder: 'asc' },
        },
      },
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
    });
  }

  /**
   * Validate cycle name uniqueness
   */
  async validateCycleName(quarter: Quarter, year: number): Promise<CycleValidationResult> {
    // Check for existing cycle with same quarter and year
    const existing = await prisma.newGoalCycle.findUnique({
      where: {
        quarter_year: {
          quarter,
          year,
        },
      },
    });

    if (existing) {
      return {
        isValid: false,
        error: `A cycle for ${quarter} ${year} already exists`,
      };
    }

    // Validate year range
    if (year < 2000 || year > 2100) {
      return {
        isValid: false,
        error: 'Year must be between 2000 and 2100',
      };
    }

    return { isValid: true };
  }

  /**
   * Get all cycles with pagination and filtering
   */
  async getCycles(options: {
    page?: number;
    limit?: number;
    year?: number;
    isActive?: boolean;
  } = {}) {
    const { page = 1, limit = 10, year, isActive } = options;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (year !== undefined) where.year = year;
    if (isActive !== undefined) where.isActive = isActive;

    const [cycles, total] = await Promise.all([
      prisma.newGoalCycle.findMany({
        where,
        include: {
          stages: {
            orderBy: { sequenceOrder: 'asc' },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.newGoalCycle.count({ where }),
    ]);

    return {
      cycles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Delete a cycle (only if no goal sheets are associated)
   */
  async deleteCycle(cycleId: string): Promise<void> {
    // Check if cycle has any goal sheets
    const goalSheetCount = await prisma.goalSheet.count({
      where: { newCycleId: cycleId },
    });

    if (goalSheetCount > 0) {
      throw new Error('Cannot delete cycle with existing goal sheets');
    }

    // Check if cycle has any shared goals
    const sharedGoalCount = await prisma.sharedGoal.count({
      where: { newCycleId: cycleId },
    });

    if (sharedGoalCount > 0) {
      throw new Error('Cannot delete cycle with existing shared goals');
    }

    // Delete cycle (stages and transitions will be cascade deleted)
    await prisma.newGoalCycle.delete({
      where: { id: cycleId },
    });
  }

  /**
   * Private helper to deactivate all cycles
   */
  private async deactivateAllCycles(): Promise<void> {
    await prisma.newGoalCycle.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  /**
   * Get cycle by ID with full details
   */
  async getCycleById(cycleId: string) {
    return await prisma.newGoalCycle.findUnique({
      where: { id: cycleId },
      include: {
        stages: {
          orderBy: { sequenceOrder: 'asc' },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        stageTransitions: {
          include: {
            fromStage: true,
            toStage: true,
            initiatedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { transitionTimestamp: 'desc' },
        },
      },
    });
  }

  /**
   * Update cycle details (name cannot be changed, but other fields can)
   */
  async updateCycle(
    cycleId: string,
    updates: {
      isActive?: boolean;
    }
  ) {
    // If setting to active, deactivate all other cycles first
    if (updates.isActive === true) {
      await this.deactivateAllCycles();
    }

    return await prisma.newGoalCycle.update({
      where: { id: cycleId },
      data: updates,
      include: {
        stages: {
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });
  }
}

// Export singleton instance
export const cycleManagerService = new CycleManagerService();