import { prisma } from '../lib/prisma.js';
import { StageName, Role } from '@prisma/client';
import { stageManagerService } from './stageManagerService.js';

export interface AccessPermissions {
  canCreateGoals: boolean;
  canEditGoals: boolean;
  canDeleteGoals: boolean;
  canUpdateAchievements: boolean;
  canApproveGoals: boolean;
  canPerformCheckIns: boolean;
  canSubmitSheet: boolean;
  canViewGoals: boolean;
  canUnlockStage: boolean;
  reason?: string;
}

export interface UnlockRequest {
  cycleId: string;
  reason: string;
  adminId: string;
  targetStage?: StageName;
}

export interface UnlockResult {
  success: boolean;
  message: string;
  unlockedStage?: StageName;
  unlockId: string;
}

export class AccessControllerService {
  /**
   * Get comprehensive access permissions for a user in a specific cycle
   */
  async getUserPermissions(
    cycleId: string,
    userId: string
  ): Promise<AccessPermissions> {
    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return this.getDeniedPermissions('User not found');
    }

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return this.getDeniedPermissions('No active stage found');
    }

    // Calculate permissions based on stage and role
    return this.calculateStageBasedPermissions(
      currentStage.stageName,
      user.role,
      userId,
      cycleId
    );
  }

  /**
   * Check if a specific action is allowed for a user
   */
  async isActionAllowed(
    cycleId: string,
    userId: string,
    action: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(cycleId, userId);
    
    switch (action) {
      case 'create_goals':
        return permissions.canCreateGoals;
      case 'edit_goals':
        return permissions.canEditGoals;
      case 'delete_goals':
        return permissions.canDeleteGoals;
      case 'update_achievements':
        return permissions.canUpdateAchievements;
      case 'approve_goals':
        return permissions.canApproveGoals;
      case 'manager_checkin':
        return permissions.canPerformCheckIns;
      case 'submit_sheet':
        return permissions.canSubmitSheet;
      case 'view_goals':
        return permissions.canViewGoals;
      case 'unlock_stage':
        return permissions.canUnlockStage;
      default:
        return false;
    }
  }

  /**
   * Enforce workflow integrity by validating actions against current stage
   */
  async enforceWorkflowIntegrity(
    cycleId: string,
    userId: string,
    action: string,
    targetResource?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      return {
        allowed: false,
        reason: 'No active stage found for this cycle',
      };
    }

    const isAllowed = await this.isActionAllowed(cycleId, userId, action);
    
    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Action '${action}' is not allowed in ${currentStage.stageName} stage`,
      };
    }

    // Additional resource-specific checks
    if (targetResource) {
      const resourceCheck = await this.validateResourceAccess(
        userId,
        targetResource,
        action
      );
      
      if (!resourceCheck.allowed) {
        return resourceCheck;
      }
    }

    return { allowed: true };
  }

  /**
   * Admin unlock capability for locked stages
   */
  async adminUnlockStage(request: UnlockRequest): Promise<UnlockResult> {
    const { cycleId, reason, adminId, targetStage } = request;

    // Verify admin permissions
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || admin.role !== Role.ADMIN) {
      throw new Error('Only administrators can unlock stages');
    }

    if (!reason.trim()) {
      throw new Error('Reason is required for stage unlock');
    }

    // Get current stage
    const currentStage = await stageManagerService.getCurrentStage(cycleId);
    
    if (!currentStage) {
      throw new Error('No active stage found');
    }

    // Determine target stage (default to current stage for unlock)
    const unlockStage = targetStage || currentStage.stageName;

    // Create unlock audit record
    const unlockRecord = await prisma.auditLog.create({
      data: {
        entityType: 'StageUnlock',
        entityId: cycleId,
        userId: adminId,
        action: 'ADMIN_UNLOCK',
        oldValue: { 
          stage: currentStage.stageName,
          locked: true 
        },
        newValue: { 
          stage: unlockStage,
          locked: false,
          reason 
        },
        reason: `Admin unlock: ${reason}`,
      },
    });

    // If unlocking a different stage, transition to it
    if (targetStage && targetStage !== currentStage.stageName) {
      const targetStageRecord = await prisma.cycleStage.findFirst({
        where: {
          cycleId,
          stageName: targetStage,
        },
      });

      if (targetStageRecord) {
        await stageManagerService.adminOverrideStage(
          cycleId,
          targetStageRecord.id,
          `Admin unlock transition: ${reason}`,
          adminId
        );
      }
    }

    return {
      success: true,
      message: `Stage ${unlockStage} unlocked successfully`,
      unlockedStage: unlockStage,
      unlockId: unlockRecord.id,
    };
  }

  /**
   * Get stage-based permission matrix
   */
  async getPermissionMatrix(cycleId: string) {
    const stages = await stageManagerService.getStagesByCycle(cycleId);
    const roles = [Role.EMPLOYEE, Role.MANAGER, Role.ADMIN];

    const matrix = stages.map((stage) => ({
      stage: stage.stageName,
      sequenceOrder: stage.sequenceOrder,
      isActive: stage.isActive,
      permissions: roles.reduce((rolePerms, role) => {
        rolePerms[role] = this.calculateStageBasedPermissions(
          stage.stageName,
          role,
          'dummy-user-id', // Placeholder for matrix calculation
          cycleId
        );
        return rolePerms;
      }, {} as Record<Role, AccessPermissions>),
    }));

    return matrix;
  }

  /**
   * Validate access to a specific resource (goal, sheet, etc.)
   */
  private async validateResourceAccess(
    userId: string,
    resourceId: string,
    action: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    // This is a simplified version - in practice, you'd check resource ownership,
    // manager relationships, etc.
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        allowed: false,
        reason: 'User not found',
      };
    }

    // For now, allow all resource access if user exists
    // In a real implementation, you'd check:
    // - Goal ownership
    // - Manager-subordinate relationships
    // - Shared goal permissions
    // - Department-level access
    
    return { allowed: true };
  }

  /**
   * Calculate permissions based on stage and user role
   */
  private calculateStageBasedPermissions(
    stageName: StageName,
    userRole: Role,
    userId: string,
    cycleId: string
  ): AccessPermissions {
    const basePermissions: AccessPermissions = {
      canCreateGoals: false,
      canEditGoals: false,
      canDeleteGoals: false,
      canUpdateAchievements: false,
      canApproveGoals: false,
      canPerformCheckIns: false,
      canSubmitSheet: false,
      canViewGoals: true, // Default to view access
      canUnlockStage: userRole === Role.ADMIN,
    };

    switch (stageName) {
      case StageName.Planning:
        return {
          ...basePermissions,
          canCreateGoals: true,
          canEditGoals: true,
          canDeleteGoals: true,
          canSubmitSheet: userRole === Role.EMPLOYEE,
          canViewGoals: true,
        };

      case StageName.Approval:
        return {
          ...basePermissions,
          canEditGoals: userRole === Role.MANAGER || userRole === Role.ADMIN,
          canApproveGoals: userRole === Role.MANAGER || userRole === Role.ADMIN,
          canPerformCheckIns: userRole === Role.MANAGER || userRole === Role.ADMIN,
          canViewGoals: true,
        };

      case StageName.Locked:
        return {
          ...basePermissions,
          canViewGoals: true,
          // Only view access in locked stage (unless admin unlock)
        };

      case StageName.Execution:
        return {
          ...basePermissions,
          canUpdateAchievements: true,
          canPerformCheckIns: userRole === Role.MANAGER || userRole === Role.ADMIN,
          canViewGoals: true,
        };

      case StageName.Review:
        return {
          ...basePermissions,
          canUpdateAchievements: userRole === Role.EMPLOYEE,
          canPerformCheckIns: userRole === Role.MANAGER || userRole === Role.ADMIN,
          canViewGoals: true,
        };

      default:
        return basePermissions;
    }
  }

  /**
   * Get denied permissions with reason
   */
  private getDeniedPermissions(reason: string): AccessPermissions {
    return {
      canCreateGoals: false,
      canEditGoals: false,
      canDeleteGoals: false,
      canUpdateAchievements: false,
      canApproveGoals: false,
      canPerformCheckIns: false,
      canSubmitSheet: false,
      canViewGoals: false,
      canUnlockStage: false,
      reason,
    };
  }

  /**
   * Get unlock history for a cycle
   */
  async getUnlockHistory(cycleId: string) {
    return await prisma.auditLog.findMany({
      where: {
        entityType: 'StageUnlock',
        entityId: cycleId,
        action: 'ADMIN_UNLOCK',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Check if user has manager relationship with target user
   */
  async hasManagerRelationship(
    managerId: string,
    employeeId: string
  ): Promise<boolean> {
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
    });

    return employee?.managerId === managerId;
  }

  /**
   * Get users that a manager can access
   */
  async getManagerSubordinates(managerId: string) {
    return await prisma.user.findMany({
      where: { managerId },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        role: true,
      },
    });
  }

  /**
   * Validate bulk action permissions
   */
  async validateBulkActionPermissions(
    cycleId: string,
    userId: string,
    action: string,
    targetUserIds: string[]
  ): Promise<{
    allowed: string[];
    denied: Array<{ userId: string; reason: string }>;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        allowed: [],
        denied: targetUserIds.map((id) => ({
          userId: id,
          reason: 'Requesting user not found',
        })),
      };
    }

    const allowed: string[] = [];
    const denied: Array<{ userId: string; reason: string }> = [];

    for (const targetUserId of targetUserIds) {
      const canPerformAction = await this.isActionAllowed(
        cycleId,
        userId,
        action
      );

      if (!canPerformAction) {
        denied.push({
          userId: targetUserId,
          reason: `Action '${action}' not allowed`,
        });
        continue;
      }

      // Check manager relationship for non-admin users
      if (user.role !== Role.ADMIN) {
        const hasRelationship = await this.hasManagerRelationship(
          userId,
          targetUserId
        );

        if (!hasRelationship && userId !== targetUserId) {
          denied.push({
            userId: targetUserId,
            reason: 'No manager relationship',
          });
          continue;
        }
      }

      allowed.push(targetUserId);
    }

    return { allowed, denied };
  }
}

// Export singleton instance
export const accessControllerService = new AccessControllerService();