import { prisma } from '../lib/prisma.js';
import { StageName, Role } from '@prisma/client';

export interface NotificationResult {
  success: boolean;
  sentNotifications: number;
  failedNotifications: number;
  errors: NotificationError[];
  summary: NotificationSummary;
}

export interface NotificationError {
  userId: string;
  channel: string;
  error: string;
  suggestion: string;
}

export interface NotificationSummary {
  totalTargetUsers: number;
  emailsSent: number;
  teamsMessagesSent: number;
  inAppNotificationsSent: number;
  notificationDuration: number;
}

export interface StageNotificationConfig {
  stageName: StageName;
  targetRoles: Role[];
  channels: NotificationChannel[];
  template: NotificationTemplate;
  actionItems: string[];
  deepLinks: Record<string, string>;
}

export interface NotificationChannel {
  type: 'email' | 'teams' | 'in_app' | 'sms';
  enabled: boolean;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface NotificationTemplate {
  subject: string;
  body: string;
  actionButtonText?: string;
  actionButtonUrl?: string;
}

export interface UserNotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  teamsEnabled: boolean;
  inAppEnabled: boolean;
  smsEnabled: boolean;
  stagePreferences: Record<StageName, {
    enabled: boolean;
    channels: string[];
  }>;
}

export class StageNotificationService {
  // Default notification configurations for each stage
  private readonly STAGE_NOTIFICATION_CONFIGS: Record<StageName, StageNotificationConfig> = {
    [StageName.Planning]: {
      stageName: StageName.Planning,
      targetRoles: [Role.EMPLOYEE],
      channels: [
        { type: 'email', enabled: true, priority: 'MEDIUM' },
        { type: 'in_app', enabled: true, priority: 'HIGH' },
      ],
      template: {
        subject: 'Goal Planning Phase Started - Action Required',
        body: 'The goal planning phase has begun. Please create and submit your goals for the current cycle.',
        actionButtonText: 'Create Goals',
        actionButtonUrl: '/employee/goals',
      },
      actionItems: [
        'Create your goals for the cycle',
        'Ensure total weightage equals 100%',
        'Submit your goal sheet for approval',
      ],
      deepLinks: {
        primary: '/employee/goals',
        secondary: '/employee/dashboard',
      },
    },
    [StageName.Approval]: {
      stageName: StageName.Approval,
      targetRoles: [Role.MANAGER, Role.ADMIN],
      channels: [
        { type: 'email', enabled: true, priority: 'HIGH' },
        { type: 'teams', enabled: true, priority: 'HIGH' },
        { type: 'in_app', enabled: true, priority: 'HIGH' },
      ],
      template: {
        subject: 'Goal Approval Phase - Review Required',
        body: 'Goal sheets are ready for your review and approval. Please review your team members\' goals.',
        actionButtonText: 'Review Goals',
        actionButtonUrl: '/manager/approvals',
      },
      actionItems: [
        'Review submitted goal sheets',
        'Approve or request rework',
        'Provide feedback to team members',
      ],
      deepLinks: {
        primary: '/manager/approvals',
        secondary: '/manager/team-dashboard',
      },
    },
    [StageName.Locked]: {
      stageName: StageName.Locked,
      targetRoles: [Role.EMPLOYEE, Role.MANAGER],
      channels: [
        { type: 'in_app', enabled: true, priority: 'MEDIUM' },
      ],
      template: {
        subject: 'Goals Locked - Preparation Phase',
        body: 'Goals are now locked and cannot be modified. Use this time to prepare for the execution phase.',
        actionButtonText: 'View Goals',
        actionButtonUrl: '/employee/goals',
      },
      actionItems: [
        'Review your approved goals',
        'Prepare execution strategies',
        'Set up tracking mechanisms',
      ],
      deepLinks: {
        primary: '/employee/goals',
        secondary: '/dashboard',
      },
    },
    [StageName.Execution]: {
      stageName: StageName.Execution,
      targetRoles: [Role.EMPLOYEE, Role.MANAGER],
      channels: [
        { type: 'email', enabled: true, priority: 'MEDIUM' },
        { type: 'in_app', enabled: true, priority: 'HIGH' },
      ],
      template: {
        subject: 'Execution Phase Started - Track Your Progress',
        body: 'The execution phase has begun. Start tracking your achievements and update your progress regularly.',
        actionButtonText: 'Update Achievements',
        actionButtonUrl: '/employee/achievements',
      },
      actionItems: [
        'Update your achievement progress',
        'Track KPI performance',
        'Participate in manager check-ins',
      ],
      deepLinks: {
        primary: '/employee/achievements',
        secondary: '/employee/goals',
      },
    },
    [StageName.Review]: {
      stageName: StageName.Review,
      targetRoles: [Role.EMPLOYEE, Role.MANAGER],
      channels: [
        { type: 'email', enabled: true, priority: 'HIGH' },
        { type: 'teams', enabled: true, priority: 'MEDIUM' },
        { type: 'in_app', enabled: true, priority: 'HIGH' },
      ],
      template: {
        subject: 'Review Phase - Final Evaluation',
        body: 'The review phase has started. Complete your final evaluations and participate in review meetings.',
        actionButtonText: 'Complete Review',
        actionButtonUrl: '/manager/reviews',
      },
      actionItems: [
        'Complete final achievement updates',
        'Participate in review meetings',
        'Provide feedback and ratings',
      ],
      deepLinks: {
        primary: '/manager/reviews',
        secondary: '/employee/achievements',
      },
    },
  };

  /**
   * Send stage transition notifications to affected users
   */
  async sendStageTransitionNotifications(
    cycleId: string,
    fromStage: StageName | null,
    toStage: StageName,
    initiatedBy: string
  ): Promise<NotificationResult> {
    const startTime = Date.now();
    const errors: NotificationError[] = [];
    let sentNotifications = 0;
    let failedNotifications = 0;

    try {
      // Get notification configuration for the target stage
      const config = this.STAGE_NOTIFICATION_CONFIGS[toStage];
      
      // Get affected users based on target roles and cycle
      const targetUsers = await this.getAffectedUsers(cycleId, config.targetRoles);
      
      const totalTargetUsers = targetUsers.length;
      let emailsSent = 0;
      let teamsMessagesSent = 0;
      let inAppNotificationsSent = 0;

      // Send notifications to each user
      for (const user of targetUsers) {
        try {
          // Get user notification preferences
          const preferences = await this.getUserNotificationPreferences(user.id);
          
          // Send notifications through enabled channels
          for (const channel of config.channels) {
            if (this.shouldSendNotification(channel, preferences, toStage)) {
              const notificationResult = await this.sendNotification(
                user,
                channel,
                config,
                cycleId,
                fromStage,
                toStage
              );

              if (notificationResult.success) {
                sentNotifications++;
                switch (channel.type) {
                  case 'email':
                    emailsSent++;
                    break;
                  case 'teams':
                    teamsMessagesSent++;
                    break;
                  case 'in_app':
                    inAppNotificationsSent++;
                    break;
                }
              } else {
                failedNotifications++;
                errors.push({
                  userId: user.id,
                  channel: channel.type,
                  error: notificationResult.error || 'Unknown notification error',
                  suggestion: 'Check user contact information and retry',
                });
              }
            }
          }
        } catch (error) {
          failedNotifications++;
          errors.push({
            userId: user.id,
            channel: 'all',
            error: error instanceof Error ? error.message : 'Unknown user notification error',
            suggestion: 'Review user data and notification preferences',
          });
        }
      }

      // Create notification audit log
      await this.createNotificationAuditLog({
        cycleId,
        fromStage,
        toStage,
        initiatedBy,
        totalTargetUsers,
        sentNotifications,
        failedNotifications,
        emailsSent,
        teamsMessagesSent,
        inAppNotificationsSent,
        errors,
        duration: Date.now() - startTime,
      });

      return {
        success: errors.length === 0,
        sentNotifications,
        failedNotifications,
        errors,
        summary: {
          totalTargetUsers,
          emailsSent,
          teamsMessagesSent,
          inAppNotificationsSent,
          notificationDuration: Date.now() - startTime,
        },
      };
    } catch (error) {
      // Create error audit log
      await this.createNotificationAuditLog({
        cycleId,
        fromStage,
        toStage,
        initiatedBy,
        totalTargetUsers: 0,
        sentNotifications: 0,
        failedNotifications: 1,
        emailsSent: 0,
        teamsMessagesSent: 0,
        inAppNotificationsSent: 0,
        errors: [{
          userId: 'system',
          channel: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system configuration and retry',
        }],
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        sentNotifications: 0,
        failedNotifications: 1,
        errors: [{
          userId: 'system',
          channel: 'system',
          error: error instanceof Error ? error.message : 'Unknown system error',
          suggestion: 'Check system configuration and retry',
        }],
        summary: {
          totalTargetUsers: 0,
          emailsSent: 0,
          teamsMessagesSent: 0,
          inAppNotificationsSent: 0,
          notificationDuration: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Send Teams integration notifications with deep links
   */
  async sendTeamsNotification(
    userId: string,
    message: string,
    actionUrl: string,
    actionText: string = 'View Details'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get user's Teams information
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // In a real implementation, this would integrate with Microsoft Teams API
      // For now, we'll simulate the Teams notification
      const teamsMessage = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            version: '1.2',
            body: [{
              type: 'TextBlock',
              text: message,
              wrap: true,
            }],
            actions: [{
              type: 'Action.OpenUrl',
              title: actionText,
              url: actionUrl,
            }],
          },
        }],
      };

      // Simulate Teams API call
      console.log(`Teams notification sent to ${user.email}:`, teamsMessage);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Teams notification error',
      };
    }
  }

  /**
   * Manage user notification preferences
   */
  async updateUserNotificationPreferences(
    userId: string,
    preferences: Partial<UserNotificationPreferences>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // In a real implementation, this would be stored in a user_preferences table
      // For now, we'll store it in the audit log as a workaround
      await prisma.auditLog.create({
        data: {
          entityType: 'NotificationPreferences',
          entityId: userId,
          userId,
          action: 'UPDATE_PREFERENCES',
          oldValue: null, // Would contain previous preferences
          newValue: preferences,
          reason: 'User updated notification preferences',
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update preferences',
      };
    }
  }

  /**
   * Get notification history for a user or cycle
   */
  async getNotificationHistory(
    filters: {
      userId?: string;
      cycleId?: string;
      stageName?: StageName;
      limit?: number;
    } = {}
  ) {
    const { userId, cycleId, stageName, limit = 50 } = filters;

    const where: any = {
      entityType: 'StageNotification',
    };

    if (userId) where.userId = userId;
    if (cycleId) where.entityId = cycleId;
    if (stageName) {
      where.newValue = {
        path: ['toStage'],
        equals: stageName,
      };
    }

    return await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Generate deep links for stage-specific actions
   */
  generateDeepLink(
    stageName: StageName,
    userRole: Role,
    cycleId: string,
    baseUrl: string = process.env.FRONTEND_URL || 'http://localhost:3000'
  ): string {
    const stageRoutes: Record<StageName, Record<Role, string>> = {
      [StageName.Planning]: {
        [Role.EMPLOYEE]: '/employee/goals',
        [Role.MANAGER]: '/manager/team-dashboard',
        [Role.ADMIN]: '/admin/cycle-management',
      },
      [StageName.Approval]: {
        [Role.EMPLOYEE]: '/employee/goals',
        [Role.MANAGER]: '/manager/approvals',
        [Role.ADMIN]: '/admin/cycle-management',
      },
      [StageName.Locked]: {
        [Role.EMPLOYEE]: '/employee/goals',
        [Role.MANAGER]: '/manager/team-dashboard',
        [Role.ADMIN]: '/admin/cycle-management',
      },
      [StageName.Execution]: {
        [Role.EMPLOYEE]: '/employee/achievements',
        [Role.MANAGER]: '/manager/check-ins',
        [Role.ADMIN]: '/admin/analytics',
      },
      [StageName.Review]: {
        [Role.EMPLOYEE]: '/employee/achievements',
        [Role.MANAGER]: '/manager/reviews',
        [Role.ADMIN]: '/admin/reports',
      },
    };

    const route = stageRoutes[stageName][userRole] || '/dashboard';
    return `${baseUrl}${route}?cycle=${cycleId}&stage=${stageName}`;
  }

  /**
   * Private helper methods
   */
  private async getAffectedUsers(cycleId: string, targetRoles: Role[]) {
    // Get users who have goal sheets in this cycle or are managers of such users
    const users = await prisma.user.findMany({
      where: {
        role: { in: targetRoles },
        OR: [
          // Users with goal sheets in this cycle
          {
            goalSheets: {
              some: { newCycleId: cycleId },
            },
          },
          // Managers of users with goal sheets in this cycle
          {
            role: Role.MANAGER,
            subordinates: {
              some: {
                goalSheets: {
                  some: { newCycleId: cycleId },
                },
              },
            },
          },
          // Admins (always included)
          { role: Role.ADMIN },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
      },
    });

    return users;
  }

  private async getUserNotificationPreferences(userId: string): Promise<UserNotificationPreferences> {
    // In a real implementation, this would query a user_preferences table
    // For now, return default preferences
    return {
      userId,
      emailEnabled: true,
      teamsEnabled: true,
      inAppEnabled: true,
      smsEnabled: false,
      stagePreferences: {
        [StageName.Planning]: { enabled: true, channels: ['email', 'in_app'] },
        [StageName.Approval]: { enabled: true, channels: ['email', 'teams', 'in_app'] },
        [StageName.Locked]: { enabled: true, channels: ['in_app'] },
        [StageName.Execution]: { enabled: true, channels: ['email', 'in_app'] },
        [StageName.Review]: { enabled: true, channels: ['email', 'teams', 'in_app'] },
      },
    };
  }

  private shouldSendNotification(
    channel: NotificationChannel,
    preferences: UserNotificationPreferences,
    stageName: StageName
  ): boolean {
    if (!channel.enabled) return false;

    const stagePrefs = preferences.stagePreferences[stageName];
    if (!stagePrefs?.enabled) return false;

    switch (channel.type) {
      case 'email':
        return preferences.emailEnabled && stagePrefs.channels.includes('email');
      case 'teams':
        return preferences.teamsEnabled && stagePrefs.channels.includes('teams');
      case 'in_app':
        return preferences.inAppEnabled && stagePrefs.channels.includes('in_app');
      case 'sms':
        return preferences.smsEnabled && stagePrefs.channels.includes('sms');
      default:
        return false;
    }
  }

  private async sendNotification(
    user: any,
    channel: NotificationChannel,
    config: StageNotificationConfig,
    cycleId: string,
    fromStage: StageName | null,
    toStage: StageName
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const deepLink = this.generateDeepLink(toStage, user.role, cycleId);
      
      switch (channel.type) {
        case 'email':
          return await this.sendEmailNotification(user, config, deepLink);
        case 'teams':
          return await this.sendTeamsNotification(
            user.id,
            config.template.body,
            deepLink,
            config.template.actionButtonText
          );
        case 'in_app':
          return await this.sendInAppNotification(user, config, deepLink);
        case 'sms':
          return await this.sendSMSNotification(user, config);
        default:
          return { success: false, error: 'Unknown notification channel' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown notification error',
      };
    }
  }

  private async sendEmailNotification(
    user: any,
    config: StageNotificationConfig,
    deepLink: string
  ): Promise<{ success: boolean; error?: string }> {
    // In a real implementation, this would integrate with an email service
    console.log(`Email sent to ${user.email}:`, {
      subject: config.template.subject,
      body: config.template.body,
      actionUrl: deepLink,
    });
    return { success: true };
  }

  private async sendInAppNotification(
    user: any,
    config: StageNotificationConfig,
    deepLink: string
  ): Promise<{ success: boolean; error?: string }> {
    // In a real implementation, this would create an in-app notification record
    console.log(`In-app notification for ${user.id}:`, {
      title: config.template.subject,
      message: config.template.body,
      actionUrl: deepLink,
    });
    return { success: true };
  }

  private async sendSMSNotification(
    user: any,
    config: StageNotificationConfig
  ): Promise<{ success: boolean; error?: string }> {
    // In a real implementation, this would integrate with an SMS service
    console.log(`SMS sent to ${user.id}:`, {
      message: `${config.template.subject}: ${config.template.body}`,
    });
    return { success: true };
  }

  private async createNotificationAuditLog(data: {
    cycleId: string;
    fromStage: StageName | null;
    toStage: StageName;
    initiatedBy: string;
    totalTargetUsers: number;
    sentNotifications: number;
    failedNotifications: number;
    emailsSent: number;
    teamsMessagesSent: number;
    inAppNotificationsSent: number;
    errors: NotificationError[];
    duration: number;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        entityType: 'StageNotification',
        entityId: data.cycleId,
        userId: data.initiatedBy,
        action: 'SEND_STAGE_NOTIFICATIONS',
        oldValue: {
          fromStage: data.fromStage,
        },
        newValue: {
          toStage: data.toStage,
          notificationResults: {
            totalTargetUsers: data.totalTargetUsers,
            sentNotifications: data.sentNotifications,
            failedNotifications: data.failedNotifications,
            emailsSent: data.emailsSent,
            teamsMessagesSent: data.teamsMessagesSent,
            inAppNotificationsSent: data.inAppNotificationsSent,
            duration: data.duration,
            errors: data.errors.length,
          },
        },
        reason: `Stage transition notifications from ${data.fromStage || 'initial'} to ${data.toStage}`,
      },
    });
  }
}

// Export singleton instance
export const stageNotificationService = new StageNotificationService();