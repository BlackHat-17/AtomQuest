import { Quarter, StageName } from '@prisma/client';

export interface CycleConfiguration {
  id: string;
  name: string;
  template: 'quarterly' | 'semi-annual' | 'annual';
  stages: StageConfiguration[];
  defaultDurations: StageDuration[];
  notifications: NotificationConfiguration[];
  accessRules: AccessRuleConfiguration[];
}

export interface StageConfiguration {
  name: StageName;
  sequenceOrder: number;
  requiredActions: string[];
  allowedRoles: string[];
  autoTransitionRules?: AutoTransitionRule[];
}

export interface StageDuration {
  stageName: StageName;
  defaultDurationDays: number;
  minDurationDays: number;
  maxDurationDays: number;
}

export interface NotificationConfiguration {
  stageName: StageName;
  recipients: string[];
  template: string;
  delayHours?: number;
}

export interface AccessRuleConfiguration {
  stageName: StageName;
  role: string;
  permissions: {
    canCreateGoals: boolean;
    canEditGoals: boolean;
    canDeleteGoals: boolean;
    canUpdateAchievements: boolean;
    canApproveGoals: boolean;
    canPerformCheckIns: boolean;
  };
}

export interface AutoTransitionRule {
  condition: string;
  targetStage: StageName;
  delayDays?: number;
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: ConfigurationError[];
  warnings: ConfigurationWarning[];
}

export interface ConfigurationError {
  field: string;
  message: string;
  suggestion: string;
}

export interface ConfigurationWarning {
  field: string;
  message: string;
  suggestion: string;
}

export interface ParsedConfiguration {
  configuration: CycleConfiguration;
  validation: ConfigurationValidationResult;
}

export class ConfigurationParserService {
  private readonly VALID_STAGE_NAMES = [
    StageName.Planning,
    StageName.Approval,
    StageName.Locked,
    StageName.Execution,
    StageName.Review,
  ];

  private readonly VALID_QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

  private readonly ENTERPRISE_TEMPLATES = {
    quarterly: {
      name: 'Quarterly Cycle Template',
      stages: [
        { name: StageName.Planning, sequenceOrder: 1, defaultDurationDays: 14 },
        { name: StageName.Approval, sequenceOrder: 2, defaultDurationDays: 7 },
        { name: StageName.Locked, sequenceOrder: 3, defaultDurationDays: 1 },
        { name: StageName.Execution, sequenceOrder: 4, defaultDurationDays: 75 },
        { name: StageName.Review, sequenceOrder: 5, defaultDurationDays: 7 },
      ],
    },
    'semi-annual': {
      name: 'Semi-Annual Cycle Template',
      stages: [
        { name: StageName.Planning, sequenceOrder: 1, defaultDurationDays: 21 },
        { name: StageName.Approval, sequenceOrder: 2, defaultDurationDays: 14 },
        { name: StageName.Locked, sequenceOrder: 3, defaultDurationDays: 1 },
        { name: StageName.Execution, sequenceOrder: 4, defaultDurationDays: 150 },
        { name: StageName.Review, sequenceOrder: 5, defaultDurationDays: 14 },
      ],
    },
    annual: {
      name: 'Annual Cycle Template',
      stages: [
        { name: StageName.Planning, sequenceOrder: 1, defaultDurationDays: 30 },
        { name: StageName.Approval, sequenceOrder: 2, defaultDurationDays: 21 },
        { name: StageName.Locked, sequenceOrder: 3, defaultDurationDays: 1 },
        { name: StageName.Execution, sequenceOrder: 4, defaultDurationDays: 300 },
        { name: StageName.Review, sequenceOrder: 5, defaultDurationDays: 14 },
      ],
    },
  };

  /**
   * Parse and validate cycle configuration from JSON input
   */
  async parseConfiguration(configInput: any): Promise<ParsedConfiguration> {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    // Basic structure validation
    if (!configInput || typeof configInput !== 'object') {
      errors.push({
        field: 'root',
        message: 'Configuration must be a valid JSON object',
        suggestion: 'Provide a valid JSON configuration object',
      });
      return {
        configuration: this.getDefaultConfiguration(),
        validation: { isValid: false, errors, warnings },
      };
    }

    // Validate required fields
    const requiredFields = ['name', 'template', 'stages'];
    for (const field of requiredFields) {
      if (!configInput[field]) {
        errors.push({
          field,
          message: `Required field '${field}' is missing`,
          suggestion: `Add the '${field}' field to your configuration`,
        });
      }
    }

    // Validate template type
    if (configInput.template && !['quarterly', 'semi-annual', 'annual'].includes(configInput.template)) {
      errors.push({
        field: 'template',
        message: `Invalid template type: ${configInput.template}`,
        suggestion: 'Use one of: quarterly, semi-annual, annual',
      });
    }

    // Validate stages configuration
    const stageValidation = this.validateStagesConfiguration(configInput.stages || []);
    errors.push(...stageValidation.errors);
    warnings.push(...stageValidation.warnings);

    // Validate durations if provided
    if (configInput.defaultDurations) {
      const durationValidation = this.validateDurationsConfiguration(configInput.defaultDurations);
      errors.push(...durationValidation.errors);
      warnings.push(...durationValidation.warnings);
    }

    // Validate notifications if provided
    if (configInput.notifications) {
      const notificationValidation = this.validateNotificationsConfiguration(configInput.notifications);
      errors.push(...notificationValidation.errors);
      warnings.push(...notificationValidation.warnings);
    }

    // Validate access rules if provided
    if (configInput.accessRules) {
      const accessValidation = this.validateAccessRulesConfiguration(configInput.accessRules);
      errors.push(...accessValidation.errors);
      warnings.push(...accessValidation.warnings);
    }

    // Build configuration object
    const configuration: CycleConfiguration = {
      id: configInput.id || this.generateConfigId(),
      name: configInput.name || 'Unnamed Configuration',
      template: configInput.template || 'quarterly',
      stages: this.normalizeStagesConfiguration(configInput.stages || []),
      defaultDurations: this.normalizeDurationsConfiguration(
        configInput.defaultDurations || [],
        configInput.template || 'quarterly'
      ),
      notifications: this.normalizeNotificationsConfiguration(configInput.notifications || []),
      accessRules: this.normalizeAccessRulesConfiguration(configInput.accessRules || []),
    };

    return {
      configuration,
      validation: {
        isValid: errors.length === 0,
        errors,
        warnings,
      },
    };
  }

  /**
   * Get enterprise template configuration
   */
  getEnterpriseTemplate(templateType: 'quarterly' | 'semi-annual' | 'annual'): CycleConfiguration {
    const template = this.ENTERPRISE_TEMPLATES[templateType];
    
    return {
      id: this.generateConfigId(),
      name: template.name,
      template: templateType,
      stages: template.stages.map((stage) => ({
        name: stage.name,
        sequenceOrder: stage.sequenceOrder,
        requiredActions: this.getDefaultRequiredActions(stage.name),
        allowedRoles: this.getDefaultAllowedRoles(stage.name),
      })),
      defaultDurations: template.stages.map((stage) => ({
        stageName: stage.name,
        defaultDurationDays: stage.defaultDurationDays,
        minDurationDays: Math.max(1, Math.floor(stage.defaultDurationDays * 0.5)),
        maxDurationDays: Math.ceil(stage.defaultDurationDays * 2),
      })),
      notifications: this.getDefaultNotifications(),
      accessRules: this.getDefaultAccessRules(),
    };
  }

  /**
   * Validate configuration against enterprise naming conventions
   */
  validateEnterpriseNaming(configuration: CycleConfiguration): ConfigurationValidationResult {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    // Validate configuration name follows enterprise conventions
    if (!configuration.name.match(/^[A-Z][a-zA-Z0-9\s-_]+$/)) {
      warnings.push({
        field: 'name',
        message: 'Configuration name should start with uppercase and use standard characters',
        suggestion: 'Use format like "Q1 2026 Configuration" or "Annual Cycle Template"',
      });
    }

    // Validate stage names follow enterprise conventions
    configuration.stages.forEach((stage, index) => {
      if (!this.VALID_STAGE_NAMES.includes(stage.name)) {
        errors.push({
          field: `stages[${index}].name`,
          message: `Invalid stage name: ${stage.name}`,
          suggestion: `Use one of: ${this.VALID_STAGE_NAMES.join(', ')}`,
        });
      }
    });

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Generate configuration suggestions based on template type
   */
  generateConfigurationSuggestions(templateType: 'quarterly' | 'semi-annual' | 'annual'): {
    suggestions: string[];
    bestPractices: string[];
  } {
    const suggestions: string[] = [];
    const bestPractices: string[] = [];

    switch (templateType) {
      case 'quarterly':
        suggestions.push(
          'Planning stage: 14 days for goal setting and alignment',
          'Approval stage: 7 days for manager review and approval',
          'Execution stage: 75 days for goal achievement tracking',
          'Review stage: 7 days for final evaluation and feedback'
        );
        bestPractices.push(
          'Keep planning phase short to maintain momentum',
          'Allow buffer time in execution for unexpected challenges',
          'Schedule regular check-ins during execution phase'
        );
        break;

      case 'semi-annual':
        suggestions.push(
          'Planning stage: 21 days for comprehensive goal planning',
          'Approval stage: 14 days for thorough review process',
          'Execution stage: 150 days for sustained goal achievement',
          'Review stage: 14 days for detailed performance analysis'
        );
        bestPractices.push(
          'Use longer planning phase for strategic alignment',
          'Implement mid-cycle check-ins during execution',
          'Allow more time for comprehensive performance reviews'
        );
        break;

      case 'annual':
        suggestions.push(
          'Planning stage: 30 days for strategic goal development',
          'Approval stage: 21 days for multi-level approval process',
          'Execution stage: 300 days for long-term goal achievement',
          'Review stage: 14 days for annual performance evaluation'
        );
        bestPractices.push(
          'Align annual goals with organizational strategy',
          'Implement quarterly check-ins during execution',
          'Use comprehensive 360-degree feedback in review'
        );
        break;
    }

    return { suggestions, bestPractices };
  }

  /**
   * Validate stages configuration
   */
  private validateStagesConfiguration(stages: any[]): {
    errors: ConfigurationError[];
    warnings: ConfigurationWarning[];
  } {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    if (!Array.isArray(stages)) {
      errors.push({
        field: 'stages',
        message: 'Stages must be an array',
        suggestion: 'Provide an array of stage configurations',
      });
      return { errors, warnings };
    }

    if (stages.length === 0) {
      errors.push({
        field: 'stages',
        message: 'At least one stage must be defined',
        suggestion: 'Add stage configurations for Planning, Approval, Locked, Execution, Review',
      });
      return { errors, warnings };
    }

    // Check for required stages
    const requiredStages = this.VALID_STAGE_NAMES;
    const providedStages = stages.map((s) => s.name).filter(Boolean);
    const missingStages = requiredStages.filter((rs) => !providedStages.includes(rs));

    if (missingStages.length > 0) {
      errors.push({
        field: 'stages',
        message: `Missing required stages: ${missingStages.join(', ')}`,
        suggestion: 'Add configurations for all required stages',
      });
    }

    // Validate individual stages
    stages.forEach((stage, index) => {
      if (!stage.name) {
        errors.push({
          field: `stages[${index}].name`,
          message: 'Stage name is required',
          suggestion: 'Provide a valid stage name',
        });
      }

      if (stage.sequenceOrder === undefined || stage.sequenceOrder < 1 || stage.sequenceOrder > 5) {
        errors.push({
          field: `stages[${index}].sequenceOrder`,
          message: 'Sequence order must be between 1 and 5',
          suggestion: 'Set sequenceOrder to a value between 1 and 5',
        });
      }
    });

    // Check for duplicate sequence orders
    const sequenceOrders = stages.map((s) => s.sequenceOrder).filter((o) => o !== undefined);
    const duplicateOrders = sequenceOrders.filter((order, index) => sequenceOrders.indexOf(order) !== index);
    if (duplicateOrders.length > 0) {
      errors.push({
        field: 'stages',
        message: `Duplicate sequence orders found: ${duplicateOrders.join(', ')}`,
        suggestion: 'Ensure each stage has a unique sequence order',
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate durations configuration
   */
  private validateDurationsConfiguration(durations: any[]): {
    errors: ConfigurationError[];
    warnings: ConfigurationWarning[];
  } {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    if (!Array.isArray(durations)) {
      errors.push({
        field: 'defaultDurations',
        message: 'Default durations must be an array',
        suggestion: 'Provide an array of duration configurations',
      });
      return { errors, warnings };
    }

    durations.forEach((duration, index) => {
      if (!duration.stageName) {
        errors.push({
          field: `defaultDurations[${index}].stageName`,
          message: 'Stage name is required for duration configuration',
          suggestion: 'Specify the stage name for this duration',
        });
      }

      if (duration.defaultDurationDays <= 0) {
        errors.push({
          field: `defaultDurations[${index}].defaultDurationDays`,
          message: 'Default duration must be greater than 0',
          suggestion: 'Set a positive number of days for the default duration',
        });
      }

      if (duration.minDurationDays && duration.maxDurationDays && 
          duration.minDurationDays > duration.maxDurationDays) {
        errors.push({
          field: `defaultDurations[${index}]`,
          message: 'Minimum duration cannot be greater than maximum duration',
          suggestion: 'Ensure minDurationDays <= maxDurationDays',
        });
      }
    });

    return { errors, warnings };
  }

  /**
   * Validate notifications configuration
   */
  private validateNotificationsConfiguration(notifications: any[]): {
    errors: ConfigurationError[];
    warnings: ConfigurationWarning[];
  } {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    if (!Array.isArray(notifications)) {
      errors.push({
        field: 'notifications',
        message: 'Notifications must be an array',
        suggestion: 'Provide an array of notification configurations',
      });
      return { errors, warnings };
    }

    notifications.forEach((notification, index) => {
      if (!notification.stageName) {
        errors.push({
          field: `notifications[${index}].stageName`,
          message: 'Stage name is required for notification configuration',
          suggestion: 'Specify the stage name for this notification',
        });
      }

      if (!notification.template) {
        errors.push({
          field: `notifications[${index}].template`,
          message: 'Notification template is required',
          suggestion: 'Specify a notification template',
        });
      }

      if (!Array.isArray(notification.recipients) || notification.recipients.length === 0) {
        warnings.push({
          field: `notifications[${index}].recipients`,
          message: 'No recipients specified for notification',
          suggestion: 'Add recipient roles or email addresses',
        });
      }
    });

    return { errors, warnings };
  }

  /**
   * Validate access rules configuration
   */
  private validateAccessRulesConfiguration(accessRules: any[]): {
    errors: ConfigurationError[];
    warnings: ConfigurationWarning[];
  } {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    if (!Array.isArray(accessRules)) {
      errors.push({
        field: 'accessRules',
        message: 'Access rules must be an array',
        suggestion: 'Provide an array of access rule configurations',
      });
      return { errors, warnings };
    }

    accessRules.forEach((rule, index) => {
      if (!rule.stageName) {
        errors.push({
          field: `accessRules[${index}].stageName`,
          message: 'Stage name is required for access rule',
          suggestion: 'Specify the stage name for this access rule',
        });
      }

      if (!rule.role) {
        errors.push({
          field: `accessRules[${index}].role`,
          message: 'Role is required for access rule',
          suggestion: 'Specify the role for this access rule',
        });
      }

      if (!rule.permissions || typeof rule.permissions !== 'object') {
        errors.push({
          field: `accessRules[${index}].permissions`,
          message: 'Permissions object is required for access rule',
          suggestion: 'Provide a permissions object with boolean values',
        });
      }
    });

    return { errors, warnings };
  }

  /**
   * Normalize stages configuration
   */
  private normalizeStagesConfiguration(stages: any[]): StageConfiguration[] {
    return stages
      .filter((stage) => stage.name && this.VALID_STAGE_NAMES.includes(stage.name))
      .map((stage) => ({
        name: stage.name,
        sequenceOrder: stage.sequenceOrder || 1,
        requiredActions: stage.requiredActions || this.getDefaultRequiredActions(stage.name),
        allowedRoles: stage.allowedRoles || this.getDefaultAllowedRoles(stage.name),
        autoTransitionRules: stage.autoTransitionRules || [],
      }))
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  }

  /**
   * Normalize durations configuration
   */
  private normalizeDurationsConfiguration(
    durations: any[],
    templateType: string
  ): StageDuration[] {
    const template = this.ENTERPRISE_TEMPLATES[templateType as keyof typeof this.ENTERPRISE_TEMPLATES];
    
    return this.VALID_STAGE_NAMES.map((stageName) => {
      const provided = durations.find((d) => d.stageName === stageName);
      const templateDefault = template?.stages.find((s) => s.name === stageName);
      
      const defaultDurationDays = provided?.defaultDurationDays || 
                                  templateDefault?.defaultDurationDays || 
                                  14;

      return {
        stageName,
        defaultDurationDays,
        minDurationDays: provided?.minDurationDays || Math.max(1, Math.floor(defaultDurationDays * 0.5)),
        maxDurationDays: provided?.maxDurationDays || Math.ceil(defaultDurationDays * 2),
      };
    });
  }

  /**
   * Normalize notifications configuration
   */
  private normalizeNotificationsConfiguration(notifications: any[]): NotificationConfiguration[] {
    return notifications
      .filter((notification) => notification.stageName && notification.template)
      .map((notification) => ({
        stageName: notification.stageName,
        recipients: notification.recipients || [],
        template: notification.template,
        delayHours: notification.delayHours || 0,
      }));
  }

  /**
   * Normalize access rules configuration
   */
  private normalizeAccessRulesConfiguration(accessRules: any[]): AccessRuleConfiguration[] {
    return accessRules
      .filter((rule) => rule.stageName && rule.role && rule.permissions)
      .map((rule) => ({
        stageName: rule.stageName,
        role: rule.role,
        permissions: {
          canCreateGoals: rule.permissions.canCreateGoals || false,
          canEditGoals: rule.permissions.canEditGoals || false,
          canDeleteGoals: rule.permissions.canDeleteGoals || false,
          canUpdateAchievements: rule.permissions.canUpdateAchievements || false,
          canApproveGoals: rule.permissions.canApproveGoals || false,
          canPerformCheckIns: rule.permissions.canPerformCheckIns || false,
        },
      }));
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): CycleConfiguration {
    return this.getEnterpriseTemplate('quarterly');
  }

  /**
   * Generate configuration ID
   */
  private generateConfigId(): string {
    return `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default required actions for a stage
   */
  private getDefaultRequiredActions(stageName: StageName): string[] {
    switch (stageName) {
      case StageName.Planning:
        return ['create_goals', 'set_targets', 'assign_weightage'];
      case StageName.Approval:
        return ['manager_review', 'goal_approval', 'feedback_provided'];
      case StageName.Locked:
        return ['goals_finalized', 'no_modifications'];
      case StageName.Execution:
        return ['track_progress', 'update_achievements', 'regular_checkins'];
      case StageName.Review:
        return ['final_evaluation', 'performance_rating', 'feedback_session'];
      default:
        return [];
    }
  }

  /**
   * Get default allowed roles for a stage
   */
  private getDefaultAllowedRoles(stageName: StageName): string[] {
    switch (stageName) {
      case StageName.Planning:
        return ['employee', 'manager', 'admin'];
      case StageName.Approval:
        return ['manager', 'admin'];
      case StageName.Locked:
        return ['admin'];
      case StageName.Execution:
        return ['employee', 'manager', 'admin'];
      case StageName.Review:
        return ['manager', 'admin'];
      default:
        return ['admin'];
    }
  }

  /**
   * Get default notifications
   */
  private getDefaultNotifications(): NotificationConfiguration[] {
    return [
      {
        stageName: StageName.Planning,
        recipients: ['employee', 'manager'],
        template: 'planning_stage_started',
        delayHours: 0,
      },
      {
        stageName: StageName.Approval,
        recipients: ['manager'],
        template: 'approval_required',
        delayHours: 0,
      },
      {
        stageName: StageName.Execution,
        recipients: ['employee'],
        template: 'execution_started',
        delayHours: 0,
      },
      {
        stageName: StageName.Review,
        recipients: ['employee', 'manager'],
        template: 'review_period_started',
        delayHours: 0,
      },
    ];
  }

  /**
   * Get default access rules
   */
  private getDefaultAccessRules(): AccessRuleConfiguration[] {
    return [
      {
        stageName: StageName.Planning,
        role: 'employee',
        permissions: {
          canCreateGoals: true,
          canEditGoals: true,
          canDeleteGoals: true,
          canUpdateAchievements: false,
          canApproveGoals: false,
          canPerformCheckIns: false,
        },
      },
      {
        stageName: StageName.Approval,
        role: 'manager',
        permissions: {
          canCreateGoals: false,
          canEditGoals: true,
          canDeleteGoals: false,
          canUpdateAchievements: false,
          canApproveGoals: true,
          canPerformCheckIns: false,
        },
      },
      {
        stageName: StageName.Execution,
        role: 'employee',
        permissions: {
          canCreateGoals: false,
          canEditGoals: false,
          canDeleteGoals: false,
          canUpdateAchievements: true,
          canApproveGoals: false,
          canPerformCheckIns: false,
        },
      },
      {
        stageName: StageName.Review,
        role: 'manager',
        permissions: {
          canCreateGoals: false,
          canEditGoals: false,
          canDeleteGoals: false,
          canUpdateAchievements: false,
          canApproveGoals: false,
          canPerformCheckIns: true,
        },
      },
    ];
  }
}

// Export singleton instance
export const configurationParserService = new ConfigurationParserService();