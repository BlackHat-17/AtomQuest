import { prisma } from '../lib/prisma.js';
import { StageName, GoalStatus, SheetStatus } from '@prisma/client';
import { stageManagerService } from './stageManagerService.js';

export interface VisibilityRules {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUpdateAchievements: boolean;
  canApprove: boolean;
  canSubmit: boolean;
  reason?: string;
}

export interface StagePermissions {
  canEdit: boolean;
  canDelete: boolean;
  canUpdateAchievements: boolean;
  canView: boolean;
  canApprove: boolean;
}

export interface GoalWithPermissions {
  id: string;
  title: string;
  description: string;
  target: string;
  weightage: number;
  status: GoalStatus;
  isShared: boolean;
  isLocked: boolean;
  stageCreated?: string;
  lastModifiedStage?: string;
  permissions: StagePermissions;
}

export class GoalTrackerService {
  /**
   * Get goals for a cycle with stage-appropriate visibility
   */
  async getGoalsByCycle(cycleId: string, userId?: string) {
    const goals = await prisma.goal.findMany({
      where: {
        goalSheet: {
          newCycleId: cycleId,
          ...(userId && { employeeId: userId }),
        },
      },
      include: {
        goalSheet: {
          include: {
            employee: {
              select: { id: true, name: true, email: true },
            },
            newCycle: {
              include: {
                stages: {
                  where: { isActive: true },
                },
              },
            },
          },
        },
        achievements: true,
        sharedFrom: true,
        sharedCopies: true,
      },
    });

    // Get current stage for permissions
    const currentStage = await stageManagerService.getCurrentStage(cycleId);

    return goals.map((goal) => ({
      ...goal,
      permissions: this.calculateStagePermissions(goal, currentStage, userId),
    }));
  }

  /**
   * Preserve goal data during stage transitions
   */
  async preserveGoalDataOnStageTransition(
    cycleId: string,
    fromStage: string,
    toStage: string
  ): Promise<void> {
    // Get all goal sheets for this cycle
    const goalSheets = await prisma.goalSheet.findMany({
      where: { newCycleId: cycleId },
      include: {
        goals: {
          include: {
            achievements: true,
            sharedCopies: true,
          },
        },
      },
    });

    // Update goals with stage transition metadata
    const updatePromises = goalSheets.flatMap((sheet) =>
      sheet.goals.map((goal) =>
        prisma.goal.update({
          where: { id: goal.id },
          data: {
            // Track when goal was last modified in which stage
            updatedAt: new Date(),
            // Could add custom fields for stage tracking if needed
          },
        })
      )
    );

    await Promise.all(updatePromises);

    // Log stage transition for audit trail
    await prisma.auditLog.create({
      data: {
        entityType: 'StageTransition',
        entityId: cycleId,
        userId: 'system', // System-initiated preservation
        action: 'PRESERVE_GOALS',
        oldValue: { stage: fromStage },
        newValue: { stage: toStage },
        reason: 'Goal data preservation during stage transition',
      },
    });
  }

  /**
   * Validate if an action is appropriate for the current stage
   */
  async validateStageAppropriateActions(
    cycleId: string,
    action: string,
    userId: string
  ): Promise<boolean> {
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return false;
    }

    return await stageManagerService.isActionAllowed(cycleId, action);
  }

  /**
   * Maintain goal relationships during stage transitions
   */
  async maintainGoalRelationships(cycleId: string): Promise<void> {
    // Get all shared goals for this cycle
    const sharedGoals = await prisma.sharedGoal.findMany({
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

    // Verify all relationships are intact
    const brokenRelationships = sharedGoals.filter(
      (sg) => !sg.sourceGoal || sg.sourceGoal.goalSheet.newCycleId !== cycleId
    );

    if (brokenRelationships.length > 0) {
      // Log broken relationships
      await prisma.auditLog.create({
        data: {
          entityType: 'SharedGoal',
          entityId: cycleId,
          userId: 'system',
          action: 'BROKEN_RELATIONSHIPS_DETECTED',
          oldValue: null,
          newValue: {
            brokenCount: brokenRelationships.length,
            brokenIds: brokenRelationships.map((br) => br.id),
          },
          reason: 'Broken goal relationships detected during stage transition',
        },
      });

      // Could implement auto-repair logic here if needed
    }

    // Update shared goal synchronization timestamps
    await prisma.sharedGoal.updateMany({
      where: { newCycleId: cycleId },
      data: {
        // Could add lastSyncedAt field if needed
      },
    });
  }

  /**
   * Get visibility rules for a user in a specific cycle
   */
  async getGoalVisibilityRules(cycleId: string, userId: string): Promise<VisibilityRules> {
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return {
        canView: false,
        canEdit: false,
        canDelete: false,
        canUpdateAchievements: false,
        canApprove: false,
        canSubmit: false,
        reason: 'No active stage found',
      };
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        canView: false,
        canEdit: false,
        canDelete: false,
        canUpdateAchievements: false,
        canApprove: false,
        canSubmit: false,
        reason: 'User not found',
      };
    }

    // Calculate permissions based on stage and role
    return this.calculateVisibilityRules(currentStage.stageName, user.role, userId);
  }

  /**
   * Get goals with stage-appropriate filtering
   */
  async getFilteredGoals(
    cycleId: string,
    userId: string,
    filters: {
      status?: GoalStatus;
      isShared?: boolean;
      thrustArea?: string;
    } = {}
  ) {
    const visibilityRules = await this.getGoalVisibilityRules(cycleId, userId);
    
    if (!visibilityRules.canView) {
      return [];
    }

    const where: any = {
      goalSheet: {
        newCycleId: cycleId,
      },
    };

    // Apply filters
    if (filters.status) where.status = filters.status;
    if (filters.isShared !== undefined) where.isShared = filters.isShared;
    if (filters.thrustArea) where.thrustArea = filters.thrustArea;

    // Role-based filtering
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === 'EMPLOYEE') {
      where.goalSheet.employeeId = userId;
    } else if (user?.role === 'MANAGER') {
      where.goalSheet.employee = {
        OR: [
          { id: userId }, // Own goals
          { managerId: userId }, // Subordinate goals
        ],
      };
    }
    // ADMIN can see all goals (no additional filtering)

    return await prisma.goal.findMany({
      where,
      include: {
        goalSheet: {
          include: {
            employee: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        achievements: true,
        sharedFrom: true,
        sharedCopies: {
          include: {
            goalSheet: {
              include: {
                employee: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Update goal with stage validation
   */
  async updateGoalWithStageValidation(
    goalId: string,
    updates: any,
    userId: string
  ) {
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        goalSheet: {
          include: {
            newCycle: true,
          },
        },
      },
    });

    if (!goal || !goal.goalSheet.newCycle) {
      throw new Error('Goal or cycle not found');
    }

    const canEdit = await this.validateStageAppropriateActions(
      goal.goalSheet.newCycle.id,
      'edit_goals',
      userId
    );

    if (!canEdit) {
      const currentStage = await stageManagerService.getCurrentStage(
        goal.goalSheet.newCycle.id
      );
      throw new Error(
        `Cannot edit goals in ${currentStage?.stageName} stage`
      );
    }

    return await prisma.goal.update({
      where: { id: goalId },
      data: updates,
    });
  }

  /**
   * Calculate stage-based permissions for a goal
   */
  private calculateStagePermissions(
    goal: any,
    currentStage: any,
    userId?: string
  ): StagePermissions {
    if (!currentStage) {
      return {
        canEdit: false,
        canDelete: false,
        canUpdateAchievements: false,
        canView: false,
        canApprove: false,
      };
    }

    const stageName = currentStage.stageName;
    const allowedActions = currentStage.allowedActions;

    return {
      canEdit: allowedActions.includes('edit_goals') && !goal.isLocked,
      canDelete: allowedActions.includes('delete_goals') && !goal.isLocked,
      canUpdateAchievements: allowedActions.includes('update_achievements'),
      canView: allowedActions.includes('view_goals'),
      canApprove: allowedActions.includes('approve_goals'),
    };
  }

  /**
   * Calculate visibility rules based on stage and user role
   */
  private calculateVisibilityRules(
    stageName: StageName,
    userRole: string,
    userId: string
  ): VisibilityRules {
    const baseRules: VisibilityRules = {
      canView: true,
      canEdit: false,
      canDelete: false,
      canUpdateAchievements: false,
      canApprove: false,
      canSubmit: false,
    };

    switch (stageName) {
      case StageName.Planning:
        return {
          ...baseRules,
          canEdit: true,
          canDelete: true,
          canSubmit: userRole === 'EMPLOYEE',
        };

      case StageName.Approval:
        return {
          ...baseRules,
          canEdit: userRole === 'MANAGER' || userRole === 'ADMIN',
          canApprove: userRole === 'MANAGER' || userRole === 'ADMIN',
        };

      case StageName.Locked:
        return {
          ...baseRules,
          // Only view access in locked stage
        };

      case StageName.Execution:
        return {
          ...baseRules,
          canUpdateAchievements: true,
        };

      case StageName.Review:
        return {
          ...baseRules,
          canUpdateAchievements: userRole === 'EMPLOYEE',
        };

      default:
        return baseRules;
    }
  }

  /**
   * Get goal statistics for a cycle
   */
  async getGoalStatistics(cycleId: string) {
    const goals = await prisma.goal.findMany({
      where: {
        goalSheet: {
          newCycleId: cycleId,
        },
      },
      include: {
        achievements: true,
        goalSheet: {
          include: {
            employee: {
              select: { id: true, name: true, department: true },
            },
          },
        },
      },
    });

    const totalGoals = goals.length;
    const sharedGoals = goals.filter((g) => g.isShared).length;
    const lockedGoals = goals.filter((g) => g.isLocked).length;

    const statusCounts = goals.reduce(
      (acc, goal) => {
        acc[goal.status] = (acc[goal.status] || 0) + 1;
        return acc;
      },
      {} as Record<GoalStatus, number>
    );

    const departmentCounts = goals.reduce(
      (acc, goal) => {
        const dept = goal.goalSheet.employee.department;
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalGoals,
      sharedGoals,
      lockedGoals,
      statusCounts,
      departmentCounts,
      averageWeightage: goals.length > 0 
        ? goals.reduce((sum, g) => sum + Number(g.weightage), 0) / goals.length 
        : 0,
    };
  }
}

// Export singleton instance
export const goalTrackerService = new GoalTrackerService();