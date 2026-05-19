import { prisma } from '../lib/prisma.js';
import { StageName, Role, SheetStatus } from '@prisma/client';
import { stageManagerService } from './stageManagerService.js';
import { accessControllerService } from './accessControllerService.js';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  allowedActions?: string[];
  currentStage?: StageName;
  suggestions?: string[];
}

export interface WorkflowViolation {
  id: string;
  cycleId: string;
  userId: string;
  action: string;
  currentStage: StageName;
  reason: string;
  timestamp: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface WorkflowContext {
  cycleId: string;
  userId: string;
  userRole: Role;
  currentStage: StageName;
  targetResource?: string;
  additionalData?: Record<string, any>;
}

export class WorkflowValidatorService {
  // Define workflow rules for each stage
  private readonly STAGE_WORKFLOW_RULES = {
    [StageName.Planning]: {
      allowedActions: [
        'create_goals',
        'edit_goals',
        'delete_goals',
        'view_goals',
        'submit_sheet',
      ],
      requiredConditions: {
        submit_sheet: ['goals_exist', 'weightage_valid'],
      },
      blockedActions: [
        'approve_goals',
        'update_achievements',
        'final_evaluation',
      ],
    },
    [StageName.Approval]: {
      allowedActions: [
        'view_goals',
        'approve_goals',
        'reject_goals',
        'edit_goals', // Managers can edit during approval
        'manager_checkin',
      ],
      requiredConditions: {
        approve_goals: ['goals_submitted', 'manager_authority'],
        reject_goals: ['goals_submitted', 'manager_authority'],
      },
      blockedActions: [
        'create_goals',
        'delete_goals',
        'update_achievements',
        'submit_sheet',
      ],
    },
    [StageName.Locked]: {
      allowedActions: ['view_goals'],
      requiredConditions: {},
      blockedActions: [
        'create_goals',
        'edit_goals',
        'delete_goals',
        'submit_sheet',
        'approve_goals',
        'update_achievements',
        'manager_checkin',
      ],
    },
    [StageName.Execution]: {
      allowedActions: [
        'view_goals',
        'update_achievements',
        'manager_checkin',
      ],
      requiredConditions: {
        update_achievements: ['goals_approved'],
        manager_checkin: ['manager_authority'],
      },
      blockedActions: [
        'create_goals',
        'edit_goals',
        'delete_goals',
        'submit_sheet',
        'approve_goals',
      ],
    },
    [StageName.Review]: {
      allowedActions: [
        'view_goals',
        'manager_checkin',
        'final_evaluation',
        'update_achievements', // Employees can still update
      ],
      requiredConditions: {
        manager_checkin: ['manager_authority'],
        final_evaluation: ['manager_authority', 'execution_complete'],
      },
      blockedActions: [
        'create_goals',
        'edit_goals',
        'delete_goals',
        'submit_sheet',
        'approve_goals',
      ],
    },
  };

  /**
   * Validate if an action is allowed in the current workflow state
   */
  async validateWorkflowAction(
    cycleId: string,
    userId: string,
    action: string,
    targetResource?: string
  ): Promise<ValidationResult> {
    try {
      // Get workflow context
      const context = await this.getWorkflowContext(cycleId, userId, targetResource);
      
      if (!context) {
        return {
          isValid: false,
          error: 'Unable to determine workflow context',
        };
      }

      // Check if action is allowed in current stage
      const stageRules = this.STAGE_WORKFLOW_RULES[context.currentStage];
      
      if (!stageRules.allowedActions.includes(action)) {
        return {
          isValid: false,
          error: `Action '${action}' is not allowed in ${context.currentStage} stage`,
          allowedActions: stageRules.allowedActions,
          currentStage: context.currentStage,
          suggestions: this.generateActionSuggestions(action, context.currentStage),
        };
      }

      // Check required conditions for the action
      const requiredConditions = stageRules.requiredConditions[action] || [];
      const conditionCheck = await this.validateConditions(
        requiredConditions,
        context
      );

      if (!conditionCheck.isValid) {
        return conditionCheck;
      }

      // Check user permissions
      const hasPermission = await accessControllerService.isActionAllowed(
        cycleId,
        userId,
        action
      );

      if (!hasPermission) {
        return {
          isValid: false,
          error: `User does not have permission to perform '${action}'`,
          currentStage: context.currentStage,
        };
      }

      return { isValid: true };
    } catch (error) {
      await this.logWorkflowViolation(
        cycleId,
        userId,
        action,
        `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'HIGH'
      );

      return {
        isValid: false,
        error: 'Workflow validation failed due to system error',
      };
    }
  }

  /**
   * Prevent goal submissions outside of Planning and Approval stages
   */
  async validateGoalSubmission(
    cycleId: string,
    userId: string,
    sheetId: string
  ): Promise<ValidationResult> {
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return {
        isValid: false,
        error: 'No active stage found',
      };
    }

    // Goal submissions only allowed in Planning stage
    if (currentStage.stageName !== StageName.Planning) {
      await this.logWorkflowViolation(
        cycleId,
        userId,
        'submit_sheet',
        `Attempted goal submission in ${currentStage.stageName} stage`,
        'MEDIUM'
      );

      return {
        isValid: false,
        error: `Goal submissions are not allowed in ${currentStage.stageName} stage`,
        currentStage: currentStage.stageName,
        suggestions: ['Wait for Planning stage', 'Contact admin for stage transition'],
      };
    }

    // Validate sheet has goals and proper weightage
    const sheet = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { goals: true },
    });

    if (!sheet) {
      return {
        isValid: false,
        error: 'Goal sheet not found',
      };
    }

    if (sheet.goals.length === 0) {
      return {
        isValid: false,
        error: 'Cannot submit empty goal sheet',
        suggestions: ['Add at least one goal before submitting'],
      };
    }

    // Check total weightage
    const totalWeightage = sheet.goals.reduce(
      (sum, goal) => sum + Number(goal.weightage),
      0
    );

    if (Math.abs(totalWeightage - 100) > 0.01) {
      return {
        isValid: false,
        error: `Total weightage must equal 100%. Current total: ${totalWeightage}%`,
        suggestions: ['Adjust goal weightages to total 100%'],
      };
    }

    return { isValid: true };
  }

  /**
   * Prevent achievement updates outside of Execution stage
   */
  async validateAchievementUpdate(
    cycleId: string,
    userId: string,
    goalId: string
  ): Promise<ValidationResult> {
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return {
        isValid: false,
        error: 'No active stage found',
      };
    }

    // Achievement updates only allowed in Execution and Review stages
    if (![StageName.Execution, StageName.Review].includes(currentStage.stageName)) {
      await this.logWorkflowViolation(
        cycleId,
        userId,
        'update_achievements',
        `Attempted achievement update in ${currentStage.stageName} stage`,
        'MEDIUM'
      );

      return {
        isValid: false,
        error: `Achievement updates are not allowed in ${currentStage.stageName} stage`,
        currentStage: currentStage.stageName,
        suggestions: ['Wait for Execution stage'],
      };
    }

    // Validate goal exists and is approved
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        goalSheet: {
          include: { employee: true },
        },
      },
    });

    if (!goal) {
      return {
        isValid: false,
        error: 'Goal not found',
      };
    }

    // Check if goal sheet is approved
    if (goal.goalSheet.status !== SheetStatus.APPROVED) {
      return {
        isValid: false,
        error: 'Can only update achievements for approved goals',
        suggestions: ['Wait for goal sheet approval'],
      };
    }

    return { isValid: true };
  }

  /**
   * Prevent manager check-ins outside of Review stage
   */
  async validateManagerCheckIn(
    cycleId: string,
    userId: string,
    targetEmployeeId: string
  ): Promise<ValidationResult> {
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return {
        isValid: false,
        error: 'No active stage found',
      };
    }

    // Manager check-ins allowed in Approval, Execution, and Review stages
    if (![StageName.Approval, StageName.Execution, StageName.Review].includes(currentStage.stageName)) {
      await this.logWorkflowViolation(
        cycleId,
        userId,
        'manager_checkin',
        `Attempted manager check-in in ${currentStage.stageName} stage`,
        'LOW'
      );

      return {
        isValid: false,
        error: `Manager check-ins are not allowed in ${currentStage.stageName} stage`,
        currentStage: currentStage.stageName,
      };
    }

    // Validate manager relationship
    const hasRelationship = await accessControllerService.hasManagerRelationship(
      userId,
      targetEmployeeId
    );

    if (!hasRelationship) {
      return {
        isValid: false,
        error: 'You are not the manager of this employee',
      };
    }

    return { isValid: true };
  }

  /**
   * Get workflow violations for audit and monitoring
   */
  async getWorkflowViolations(
    cycleId?: string,
    userId?: string,
    severity?: 'LOW' | 'MEDIUM' | 'HIGH',
    limit: number = 50
  ) {
    const where: any = {};
    if (cycleId) where.entityId = cycleId;
    if (userId) where.userId = userId;

    const violations = await prisma.auditLog.findMany({
      where: {
        ...where,
        entityType: 'WorkflowViolation',
        ...(severity && {
          newValue: {
            path: ['severity'],
            equals: severity,
          },
        }),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return violations.map((v) => ({
      id: v.id,
      cycleId: v.entityId,
      userId: v.userId,
      user: v.user,
      action: (v.newValue as any)?.action || 'unknown',
      currentStage: (v.newValue as any)?.currentStage || 'unknown',
      reason: v.reason || 'No reason provided',
      timestamp: v.timestamp,
      severity: (v.newValue as any)?.severity || 'MEDIUM',
    }));
  }

  /**
   * Generate clear error messages for workflow violations
   */
  generateErrorMessage(
    action: string,
    currentStage: StageName,
    allowedActions: string[]
  ): string {
    const stageMessages = {
      [StageName.Planning]: 'During Planning, you can create, edit, and submit goals.',
      [StageName.Approval]: 'During Approval, managers can review and approve goal sheets.',
      [StageName.Locked]: 'During Locked stage, only viewing is allowed.',
      [StageName.Execution]: 'During Execution, you can update achievements and managers can perform check-ins.',
      [StageName.Review]: 'During Review, managers can perform final evaluations.',
    };

    const baseMessage = `Action '${action}' is not allowed in ${currentStage} stage.`;
    const stageInfo = stageMessages[currentStage];
    const allowedActionsText = allowedActions.length > 0 
      ? `Allowed actions: ${allowedActions.join(', ')}.`
      : '';

    return `${baseMessage} ${stageInfo} ${allowedActionsText}`.trim();
  }

  /**
   * Get workflow context for validation
   */
  private async getWorkflowContext(
    cycleId: string,
    userId: string,
    targetResource?: string
  ): Promise<WorkflowContext | null> {
    const [user, currentStage] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      stageManagerService.getCurrentStage(cycleId),
    ]);

    if (!user || !currentStage) {
      return null;
    }

    return {
      cycleId,
      userId,
      userRole: user.role,
      currentStage: currentStage.stageName,
      targetResource,
    };
  }

  /**
   * Validate required conditions for an action
   */
  private async validateConditions(
    conditions: string[],
    context: WorkflowContext
  ): Promise<ValidationResult> {
    for (const condition of conditions) {
      const isValid = await this.checkCondition(condition, context);
      
      if (!isValid.isValid) {
        return isValid;
      }
    }

    return { isValid: true };
  }

  /**
   * Check individual condition
   */
  private async checkCondition(
    condition: string,
    context: WorkflowContext
  ): Promise<ValidationResult> {
    switch (condition) {
      case 'goals_exist':
        return await this.checkGoalsExist(context);
      case 'weightage_valid':
        return await this.checkWeightageValid(context);
      case 'goals_submitted':
        return await this.checkGoalsSubmitted(context);
      case 'goals_approved':
        return await this.checkGoalsApproved(context);
      case 'manager_authority':
        return await this.checkManagerAuthority(context);
      case 'execution_complete':
        return await this.checkExecutionComplete(context);
      default:
        return { isValid: true }; // Unknown conditions pass by default
    }
  }

  /**
   * Condition checkers
   */
  private async checkGoalsExist(context: WorkflowContext): Promise<ValidationResult> {
    // Implementation would check if user has goals in the cycle
    return { isValid: true };
  }

  private async checkWeightageValid(context: WorkflowContext): Promise<ValidationResult> {
    // Implementation would validate total weightage equals 100%
    return { isValid: true };
  }

  private async checkGoalsSubmitted(context: WorkflowContext): Promise<ValidationResult> {
    // Implementation would check if goals are submitted
    return { isValid: true };
  }

  private async checkGoalsApproved(context: WorkflowContext): Promise<ValidationResult> {
    // Implementation would check if goals are approved
    return { isValid: true };
  }

  private async checkManagerAuthority(context: WorkflowContext): Promise<ValidationResult> {
    return {
      isValid: [Role.MANAGER, Role.ADMIN].includes(context.userRole),
      error: 'Manager or Admin role required',
    };
  }

  private async checkExecutionComplete(context: WorkflowContext): Promise<ValidationResult> {
    // Implementation would check if execution phase is complete
    return { isValid: true };
  }

  /**
   * Generate action suggestions based on current stage
   */
  private generateActionSuggestions(
    attemptedAction: string,
    currentStage: StageName
  ): string[] {
    const suggestions: Record<string, string[]> = {
      create_goals: ['Wait for Planning stage', 'Contact admin to transition to Planning'],
      submit_sheet: ['Complete goals first', 'Ensure weightage totals 100%'],
      approve_goals: ['Wait for Approval stage', 'Ensure you have manager role'],
      update_achievements: ['Wait for Execution stage', 'Ensure goals are approved'],
      manager_checkin: ['Wait for appropriate stage', 'Verify manager relationship'],
    };

    return suggestions[attemptedAction] || ['Contact administrator for assistance'];
  }

  /**
   * Log workflow violation for audit trail
   */
  private async logWorkflowViolation(
    cycleId: string,
    userId: string,
    action: string,
    reason: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
  ): Promise<void> {
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    await prisma.auditLog.create({
      data: {
        entityType: 'WorkflowViolation',
        entityId: cycleId,
        userId,
        action: 'WORKFLOW_VIOLATION',
        oldValue: null,
        newValue: {
          action,
          currentStage: currentStage?.stageName || 'unknown',
          severity,
          timestamp: new Date().toISOString(),
        },
        reason,
      },
    });
  }
}

// Export singleton instance
export const workflowValidatorService = new WorkflowValidatorService();