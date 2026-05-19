import { prisma } from '../lib/prisma.js';
import { StageName } from '@prisma/client';

export interface StageTransitionOptions {
  reason?: string;
  adminOverride?: boolean;
  initiatedBy: string;
}

export interface StageTransitionResult {
  success: boolean;
  newStage: {
    id: string;
    stageName: StageName;
    isActive: boolean;
    sequenceOrder: number;
  };
  transitionId: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  allowedTransitions?: StageName[];
}

export interface CycleStage {
  id: string;
  cycleId: string;
  stageName: StageName;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  sequenceOrder: number;
  allowedActions: string[];
}

export interface StageTransition {
  id: string;
  cycleId: string;
  fromStageId: string | null;
  toStageId: string;
  initiatedById: string;
  reason: string | null;
  isAdminOverride: boolean;
  transitionTimestamp: Date;
}

export class StageManagerService {
  // Define the stage sequence
  private readonly STAGE_SEQUENCE: StageName[] = [
    StageName.Planning,
    StageName.Approval,
    StageName.Locked,
    StageName.Execution,
    StageName.Review,
  ];

  // Define stage-specific allowed actions
  private readonly STAGE_ACTIONS: Record<StageName, string[]> = {
    [StageName.Planning]: [
      'create_goals',
      'edit_goals',
      'delete_goals',
      'view_goals',
      'submit_sheet',
    ],
    [StageName.Approval]: [
      'view_goals',
      'approve_goals',
      'reject_goals',
      'edit_goals', // Managers can edit during approval
      'manager_checkin',
    ],
    [StageName.Locked]: [
      'view_goals', // Read-only access
    ],
    [StageName.Execution]: [
      'view_goals',
      'update_achievements',
      'manager_checkin',
    ],
    [StageName.Review]: [
      'view_goals',
      'manager_checkin',
      'final_evaluation',
    ],
  };

  /**
   * Transition a cycle to a new stage
   */
  async transitionStage(
    cycleId: string,
    toStageId: string,
    options: StageTransitionOptions
  ): Promise<StageTransitionResult> {
    const { reason, adminOverride = false, initiatedBy } = options;

    // Get current stage and target stage
    const [currentStage, targetStage] = await Promise.all([
      this.getCurrentStage(cycleId),
      prisma.cycleStage.findUnique({ where: { id: toStageId } }),
    ]);

    if (!targetStage || targetStage.cycleId !== cycleId) {
      throw new Error('Invalid target stage');
    }

    // Validate transition unless admin override
    if (!adminOverride) {
      const validation = await this.validateStageTransition(cycleId, toStageId);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }

    // Perform transition in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Deactivate current stage if exists
      if (currentStage) {
        await tx.cycleStage.update({
          where: { id: currentStage.id },
          data: {
            isActive: false,
            endDate: new Date(),
          },
        });
      }

      // Activate target stage
      const updatedStage = await tx.cycleStage.update({
        where: { id: toStageId },
        data: {
          isActive: true,
          startDate: new Date(),
          endDate: null,
        },
      });

      // Create transition record
      const transition = await tx.stageTransition.create({
        data: {
          cycleId,
          fromStageId: currentStage?.id || null,
          toStageId,
          initiatedById: initiatedBy,
          reason,
          isAdminOverride: adminOverride,
        },
      });

      return { updatedStage, transition };
    });

    return {
      success: true,
      newStage: {
        id: result.updatedStage.id,
        stageName: result.updatedStage.stageName,
        isActive: result.updatedStage.isActive,
        sequenceOrder: result.updatedStage.sequenceOrder,
      },
      transitionId: result.transition.id,
      message: `Successfully transitioned to ${result.updatedStage.stageName} stage`,
    };
  }

  /**
   * Validate if a stage transition is allowed
   */
  async validateStageTransition(cycleId: string, toStageId: string): Promise<ValidationResult> {
    const [currentStage, targetStage] = await Promise.all([
      this.getCurrentStage(cycleId),
      prisma.cycleStage.findUnique({ where: { id: toStageId } }),
    ]);

    if (!targetStage) {
      return {
        isValid: false,
        error: 'Target stage not found',
      };
    }

    if (targetStage.cycleId !== cycleId) {
      return {
        isValid: false,
        error: 'Target stage does not belong to this cycle',
      };
    }

    // If no current stage, can only transition to Planning
    if (!currentStage) {
      if (targetStage.stageName !== StageName.Planning) {
        return {
          isValid: false,
          error: 'First stage must be Planning',
          allowedTransitions: [StageName.Planning],
        };
      }
      return { isValid: true };
    }

    // Check if transition follows the sequence
    const currentIndex = this.STAGE_SEQUENCE.indexOf(currentStage.stageName);
    const targetIndex = this.STAGE_SEQUENCE.indexOf(targetStage.stageName);

    // Allow moving to next stage or staying in current stage
    if (targetIndex === currentIndex + 1 || targetIndex === currentIndex) {
      return { isValid: true };
    }

    // Don't allow skipping stages or going backwards
    const allowedTransitions: StageName[] = [];
    if (currentIndex < this.STAGE_SEQUENCE.length - 1) {
      allowedTransitions.push(this.STAGE_SEQUENCE[currentIndex + 1]);
    }
    allowedTransitions.push(currentStage.stageName); // Can stay in current stage

    return {
      isValid: false,
      error: `Cannot transition from ${currentStage.stageName} to ${targetStage.stageName}. Must follow sequence: ${this.STAGE_SEQUENCE.join(' → ')}`,
      allowedTransitions,
    };
  }

  /**
   * Get the current active stage for a cycle
   */
  async getCurrentStage(cycleId: string): Promise<CycleStage | null> {
    const stage = await prisma.cycleStage.findFirst({
      where: {
        cycleId,
        isActive: true,
      },
    });

    if (!stage) return null;

    return {
      id: stage.id,
      cycleId: stage.cycleId,
      stageName: stage.stageName,
      isActive: stage.isActive,
      startDate: stage.startDate,
      endDate: stage.endDate,
      sequenceOrder: stage.sequenceOrder,
      allowedActions: this.STAGE_ACTIONS[stage.stageName] || [],
    };
  }

  /**
   * Get all stages for a cycle
   */
  async getStagesByCycle(cycleId: string) {
    const stages = await prisma.cycleStage.findMany({
      where: { cycleId },
      orderBy: { sequenceOrder: 'asc' },
    });

    return stages.map((stage) => ({
      id: stage.id,
      cycleId: stage.cycleId,
      stageName: stage.stageName,
      isActive: stage.isActive,
      startDate: stage.startDate,
      endDate: stage.endDate,
      sequenceOrder: stage.sequenceOrder,
      allowedActions: this.STAGE_ACTIONS[stage.stageName] || [],
    }));
  }

  /**
   * Get stage transition history for a cycle
   */
  async getStageHistory(cycleId: string): Promise<StageTransition[]> {
    const transitions = await prisma.stageTransition.findMany({
      where: { cycleId },
      include: {
        fromStage: true,
        toStage: true,
        initiatedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { transitionTimestamp: 'desc' },
    });

    return transitions.map((t) => ({
      id: t.id,
      cycleId: t.cycleId,
      fromStageId: t.fromStageId,
      toStageId: t.toStageId,
      initiatedById: t.initiatedById,
      reason: t.reason,
      isAdminOverride: t.isAdminOverride,
      transitionTimestamp: t.transitionTimestamp,
    }));
  }

  /**
   * Admin override to force stage transition
   */
  async adminOverrideStage(
    cycleId: string,
    toStageId: string,
    reason: string,
    adminId: string
  ): Promise<StageTransitionResult> {
    if (!reason.trim()) {
      throw new Error('Reason is required for admin override');
    }

    return await this.transitionStage(cycleId, toStageId, {
      reason,
      adminOverride: true,
      initiatedBy: adminId,
    });
  }

  /**
   * Get allowed transitions for current stage
   */
  async getAllowedTransitions(cycleId: string): Promise<StageName[]> {
    const currentStage = await this.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return [StageName.Planning];
    }

    const currentIndex = this.STAGE_SEQUENCE.indexOf(currentStage.stageName);
    const allowedTransitions: StageName[] = [];

    // Can stay in current stage
    allowedTransitions.push(currentStage.stageName);

    // Can move to next stage if not at the end
    if (currentIndex < this.STAGE_SEQUENCE.length - 1) {
      allowedTransitions.push(this.STAGE_SEQUENCE[currentIndex + 1]);
    }

    return allowedTransitions;
  }

  /**
   * Check if a specific action is allowed in the current stage
   */
  async isActionAllowed(cycleId: string, action: string): Promise<boolean> {
    const currentStage = await this.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return false;
    }

    return currentStage.allowedActions.includes(action);
  }

  /**
   * Get stage by ID
   */
  async getStageById(stageId: string): Promise<CycleStage | null> {
    const stage = await prisma.cycleStage.findUnique({
      where: { id: stageId },
    });

    if (!stage) return null;

    return {
      id: stage.id,
      cycleId: stage.cycleId,
      stageName: stage.stageName,
      isActive: stage.isActive,
      startDate: stage.startDate,
      endDate: stage.endDate,
      sequenceOrder: stage.sequenceOrder,
      allowedActions: this.STAGE_ACTIONS[stage.stageName] || [],
    };
  }

  /**
   * Get stage performance metrics
   */
  async getStageMetrics(cycleId: string) {
    const stages = await this.getStagesByCycle(cycleId);
    const transitions = await this.getStageHistory(cycleId);

    return stages.map((stage) => {
      const stageTransitions = transitions.filter(
        (t) => t.toStageId === stage.id
      );
      
      const entryTransition = stageTransitions[stageTransitions.length - 1];
      const exitTransition = transitions.find(
        (t) => t.fromStageId === stage.id
      );

      let duration: number | null = null;
      if (entryTransition && exitTransition) {
        duration = exitTransition.transitionTimestamp.getTime() - entryTransition.transitionTimestamp.getTime();
      } else if (entryTransition && stage.isActive) {
        duration = Date.now() - entryTransition.transitionTimestamp.getTime();
      }

      return {
        stage: stage.stageName,
        sequenceOrder: stage.sequenceOrder,
        isActive: stage.isActive,
        startDate: stage.startDate,
        endDate: stage.endDate,
        duration: duration ? Math.round(duration / (1000 * 60 * 60 * 24)) : null, // Duration in days
        transitionCount: stageTransitions.length,
      };
    });
  }
}

// Export singleton instance
export const stageManagerService = new StageManagerService();