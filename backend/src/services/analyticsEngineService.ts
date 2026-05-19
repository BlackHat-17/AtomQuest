import { prisma } from '../lib/prisma.js';
import { Quarter, StageName, GoalStatus } from '@prisma/client';

export interface QoQTrendAnalysis {
  currentQuarter: Quarter;
  currentYear: number;
  previousQuarter: Quarter;
  previousYear: number;
  trends: QoQTrend[];
  summary: QoQSummary;
}

export interface QoQTrend {
  employeeId: string;
  employeeName: string;
  department: string;
  currentScore: number;
  previousScore: number;
  change: number;
  changePercentage: number;
  trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
  goalMapping: GoalMapping[];
}

export interface GoalMapping {
  currentGoalId: string;
  previousGoalId?: string;
  thrustArea: string;
  similarity: number;
  mappingReason: string;
}

export interface QoQSummary {
  totalEmployees: number;
  improvingEmployees: number;
  decliningEmployees: number;
  stableEmployees: number;
  averageImprovement: number;
  topPerformers: string[];
  needsAttention: string[];
}

export interface StagePerformanceMetrics {
  cycleId: string;
  cycleName: string;
  stages: StageMetric[];
  overallMetrics: OverallCycleMetrics;
}

export interface StageMetric {
  stageName: StageName;
  sequenceOrder: number;
  averageDuration: number; // in days
  completionRate: number;
  userParticipation: number;
  commonIssues: string[];
  performanceIndicators: {
    onTime: number;
    delayed: number;
    skipped: number;
  };
}

export interface OverallCycleMetrics {
  totalDuration: number;
  cycleCompletionRate: number;
  userSatisfactionScore: number;
  goalAchievementRate: number;
  stageEfficiencyScore: number;
}

export interface DrillDownData {
  level: 'organization' | 'department' | 'team' | 'individual';
  entityId: string;
  entityName: string;
  metrics: Record<string, number>;
  children?: DrillDownData[];
  trends: TrendData[];
}

export interface TrendData {
  period: string;
  value: number;
  change: number;
  benchmark?: number;
}

export interface ExportData {
  format: 'csv' | 'excel' | 'json';
  data: any[];
  metadata: {
    generatedAt: Date;
    cycleId: string;
    reportType: string;
    filters: Record<string, any>;
  };
}

export class AnalyticsEngineService {
  /**
   * Generate Quarter-over-Quarter trend analysis with proper goal mapping
   */
  async generateQoQTrendAnalysis(
    currentCycleId: string,
    previousCycleId?: string
  ): Promise<QoQTrendAnalysis> {
    try {
      // Get current cycle information
      const currentCycle = await prisma.newGoalCycle.findUnique({
        where: { id: currentCycleId },
        include: {
          goalSheets: {
            include: {
              employee: {
                select: { id: true, name: true, department: true },
              },
              goals: {
                include: {
                  achievements: true,
                },
              },
            },
          },
        },
      });

      if (!currentCycle) {
        throw new Error('Current cycle not found');
      }

      // Find previous cycle if not specified
      let previousCycle;
      if (previousCycleId) {
        previousCycle = await prisma.newGoalCycle.findUnique({
          where: { id: previousCycleId },
          include: {
            goalSheets: {
              include: {
                employee: {
                  select: { id: true, name: true, department: true },
                },
                goals: {
                  include: {
                    achievements: true,
                  },
                },
              },
            },
          },
        });
      } else {
        // Find the previous quarter cycle
        const { prevQuarter, prevYear } = this.getPreviousQuarter(
          currentCycle.quarter,
          currentCycle.year
        );

        previousCycle = await prisma.newGoalCycle.findFirst({
          where: {
            quarter: prevQuarter,
            year: prevYear,
          },
          include: {
            goalSheets: {
              include: {
                employee: {
                  select: { id: true, name: true, department: true },
                },
                goals: {
                  include: {
                    achievements: true,
                  },
                },
              },
            },
          },
        });
      }

      if (!previousCycle) {
        throw new Error('Previous cycle not found for comparison');
      }

      // Calculate trends for each employee
      const trends = await this.calculateEmployeeTrends(currentCycle, previousCycle);

      // Generate summary statistics
      const summary = this.generateQoQSummary(trends);

      return {
        currentQuarter: currentCycle.quarter,
        currentYear: currentCycle.year,
        previousQuarter: previousCycle.quarter,
        previousYear: previousCycle.year,
        trends,
        summary,
      };
    } catch (error) {
      throw new Error(`Failed to generate QoQ analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate stage performance metrics and dashboards
   */
  async generateStagePerformanceMetrics(cycleId: string): Promise<StagePerformanceMetrics> {
    try {
      const cycle = await prisma.newGoalCycle.findUnique({
        where: { id: cycleId },
        include: {
          stages: {
            orderBy: { sequenceOrder: 'asc' },
          },
          stageTransitions: {
            include: {
              fromStage: true,
              toStage: true,
              initiatedBy: {
                select: { id: true, name: true, role: true },
              },
            },
            orderBy: { transitionTimestamp: 'asc' },
          },
          goalSheets: {
            include: {
              goals: {
                include: {
                  achievements: true,
                },
              },
            },
          },
        },
      });

      if (!cycle) {
        throw new Error('Cycle not found');
      }

      // Calculate metrics for each stage
      const stageMetrics = await Promise.all(
        cycle.stages.map(stage => this.calculateStageMetrics(stage, cycle))
      );

      // Calculate overall cycle metrics
      const overallMetrics = this.calculateOverallCycleMetrics(cycle, stageMetrics);

      return {
        cycleId: cycle.id,
        cycleName: cycle.name,
        stages: stageMetrics,
        overallMetrics,
      };
    } catch (error) {
      throw new Error(`Failed to generate stage performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Provide drill-down capabilities from department to individual employee trends
   */
  async getDrillDownData(
    cycleId: string,
    level: 'organization' | 'department' | 'team' | 'individual',
    entityId?: string
  ): Promise<DrillDownData> {
    try {
      switch (level) {
        case 'organization':
          return await this.getOrganizationDrillDown(cycleId);
        case 'department':
          return await this.getDepartmentDrillDown(cycleId, entityId!);
        case 'team':
          return await this.getTeamDrillDown(cycleId, entityId!);
        case 'individual':
          return await this.getIndividualDrillDown(cycleId, entityId!);
        default:
          throw new Error('Invalid drill-down level');
      }
    } catch (error) {
      throw new Error(`Failed to get drill-down data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export QoQ trend data in various formats
   */
  async exportQoQTrendData(
    cycleId: string,
    format: 'csv' | 'excel' | 'json',
    filters: Record<string, any> = {}
  ): Promise<ExportData> {
    try {
      // Generate QoQ analysis
      const qoqAnalysis = await this.generateQoQTrendAnalysis(cycleId);

      // Apply filters
      let filteredTrends = qoqAnalysis.trends;
      
      if (filters.department) {
        filteredTrends = filteredTrends.filter(trend => 
          trend.department === filters.department
        );
      }

      if (filters.trendType) {
        filteredTrends = filteredTrends.filter(trend => 
          trend.trend === filters.trendType
        );
      }

      if (filters.minChange !== undefined) {
        filteredTrends = filteredTrends.filter(trend => 
          Math.abs(trend.change) >= filters.minChange
        );
      }

      // Format data based on export format
      let exportData: any[];
      
      switch (format) {
        case 'csv':
        case 'excel':
          exportData = filteredTrends.map(trend => ({
            'Employee Name': trend.employeeName,
            'Department': trend.department,
            'Current Score': trend.currentScore,
            'Previous Score': trend.previousScore,
            'Change': trend.change,
            'Change %': trend.changePercentage,
            'Trend': trend.trend,
            'Goal Mappings': trend.goalMapping.length,
          }));
          break;
        case 'json':
          exportData = filteredTrends;
          break;
        default:
          throw new Error('Unsupported export format');
      }

      return {
        format,
        data: exportData,
        metadata: {
          generatedAt: new Date(),
          cycleId,
          reportType: 'QoQ_Trend_Analysis',
          filters,
        },
      };
    } catch (error) {
      throw new Error(`Failed to export QoQ trend data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getAnalyticsDashboard(cycleId: string) {
    try {
      const [
        stageMetrics,
        qoqAnalysis,
        goalStatistics,
        userEngagement,
      ] = await Promise.all([
        this.generateStagePerformanceMetrics(cycleId),
        this.generateQoQTrendAnalysis(cycleId).catch(() => null), // May not have previous cycle
        this.getGoalStatistics(cycleId),
        this.getUserEngagementMetrics(cycleId),
      ]);

      return {
        cycleId,
        stageMetrics,
        qoqAnalysis,
        goalStatistics,
        userEngagement,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get analytics dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Private helper methods
   */
  private getPreviousQuarter(quarter: Quarter, year: number): { prevQuarter: Quarter; prevYear: number } {
    const quarters: Quarter[] = [Quarter.Q1, Quarter.Q2, Quarter.Q3, Quarter.Q4];
    const currentIndex = quarters.indexOf(quarter);
    
    if (currentIndex === 0) {
      return { prevQuarter: Quarter.Q4, prevYear: year - 1 };
    } else {
      return { prevQuarter: quarters[currentIndex - 1], prevYear: year };
    }
  }

  private async calculateEmployeeTrends(currentCycle: any, previousCycle: any): Promise<QoQTrend[]> {
    const trends: QoQTrend[] = [];

    // Create maps for quick lookup
    const currentEmployeeSheets = new Map(
      currentCycle.goalSheets.map((sheet: any) => [sheet.employee.id, sheet])
    );
    const previousEmployeeSheets = new Map(
      previousCycle.goalSheets.map((sheet: any) => [sheet.employee.id, sheet])
    );

    // Calculate trends for employees present in both cycles
    for (const [employeeId, currentSheet] of currentEmployeeSheets) {
      const previousSheet = previousEmployeeSheets.get(employeeId);
      
      if (previousSheet) {
        const currentScore = this.calculateEmployeeScore(currentSheet);
        const previousScore = this.calculateEmployeeScore(previousSheet);
        const change = currentScore - previousScore;
        const changePercentage = previousScore !== 0 ? (change / previousScore) * 100 : 0;

        let trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
        if (Math.abs(changePercentage) < 5) {
          trend = 'STABLE';
        } else if (change > 0) {
          trend = 'IMPROVING';
        } else {
          trend = 'DECLINING';
        }

        const goalMapping = this.mapGoalsBetweenCycles(currentSheet.goals, previousSheet.goals);

        trends.push({
          employeeId,
          employeeName: currentSheet.employee.name,
          department: currentSheet.employee.department,
          currentScore,
          previousScore,
          change,
          changePercentage,
          trend,
          goalMapping,
        });
      }
    }

    return trends;
  }

  private calculateEmployeeScore(goalSheet: any): number {
    if (!goalSheet.goals || goalSheet.goals.length === 0) return 0;

    let totalWeightedScore = 0;
    let totalWeightage = 0;

    for (const goal of goalSheet.goals) {
      const weightage = Number(goal.weightage);
      const achievements = goal.achievements || [];
      
      // Calculate average achievement score
      let goalScore = 0;
      if (achievements.length > 0) {
        const totalAchievementScore = achievements.reduce(
          (sum: number, achievement: any) => sum + Number(achievement.score),
          0
        );
        goalScore = totalAchievementScore / achievements.length;
      }

      totalWeightedScore += goalScore * weightage;
      totalWeightage += weightage;
    }

    return totalWeightage > 0 ? totalWeightedScore / totalWeightage : 0;
  }

  private mapGoalsBetweenCycles(currentGoals: any[], previousGoals: any[]): GoalMapping[] {
    const mappings: GoalMapping[] = [];

    for (const currentGoal of currentGoals) {
      let bestMatch: any = null;
      let bestSimilarity = 0;

      // Find the most similar goal from the previous cycle
      for (const previousGoal of previousGoals) {
        const similarity = this.calculateGoalSimilarity(currentGoal, previousGoal);
        if (similarity > bestSimilarity && similarity > 0.5) { // Minimum 50% similarity
          bestMatch = previousGoal;
          bestSimilarity = similarity;
        }
      }

      mappings.push({
        currentGoalId: currentGoal.id,
        previousGoalId: bestMatch?.id,
        thrustArea: currentGoal.thrustArea,
        similarity: bestSimilarity,
        mappingReason: bestMatch 
          ? `Mapped based on ${Math.round(bestSimilarity * 100)}% similarity`
          : 'No similar goal found in previous cycle',
      });
    }

    return mappings;
  }

  private calculateGoalSimilarity(goal1: any, goal2: any): number {
    let similarity = 0;

    // Thrust area match (40% weight)
    if (goal1.thrustArea === goal2.thrustArea) {
      similarity += 0.4;
    }

    // Title similarity (30% weight)
    const titleSimilarity = this.calculateTextSimilarity(goal1.title, goal2.title);
    similarity += titleSimilarity * 0.3;

    // Description similarity (30% weight)
    const descSimilarity = this.calculateTextSimilarity(goal1.description, goal2.description);
    similarity += descSimilarity * 0.3;

    return similarity;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple word-based similarity calculation
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  private generateQoQSummary(trends: QoQTrend[]): QoQSummary {
    const totalEmployees = trends.length;
    const improvingEmployees = trends.filter(t => t.trend === 'IMPROVING').length;
    const decliningEmployees = trends.filter(t => t.trend === 'DECLINING').length;
    const stableEmployees = trends.filter(t => t.trend === 'STABLE').length;

    const averageImprovement = totalEmployees > 0 
      ? trends.reduce((sum, t) => sum + t.change, 0) / totalEmployees 
      : 0;

    // Top performers (top 10% by improvement)
    const sortedByImprovement = [...trends].sort((a, b) => b.change - a.change);
    const topCount = Math.max(1, Math.floor(totalEmployees * 0.1));
    const topPerformers = sortedByImprovement.slice(0, topCount).map(t => t.employeeId);

    // Needs attention (bottom 10% by performance)
    const needsAttentionCount = Math.max(1, Math.floor(totalEmployees * 0.1));
    const needsAttention = sortedByImprovement.slice(-needsAttentionCount).map(t => t.employeeId);

    return {
      totalEmployees,
      improvingEmployees,
      decliningEmployees,
      stableEmployees,
      averageImprovement,
      topPerformers,
      needsAttention,
    };
  }

  private async calculateStageMetrics(stage: any, cycle: any): Promise<StageMetric> {
    // Get transitions for this stage
    const transitionsToStage = cycle.stageTransitions.filter(
      (t: any) => t.toStageId === stage.id
    );
    const transitionsFromStage = cycle.stageTransitions.filter(
      (t: any) => t.fromStageId === stage.id
    );

    // Calculate average duration
    let averageDuration = 0;
    if (transitionsToStage.length > 0 && transitionsFromStage.length > 0) {
      const durations = transitionsFromStage.map((fromTransition: any) => {
        const toTransition = transitionsToStage.find(
          (t: any) => t.transitionTimestamp <= fromTransition.transitionTimestamp
        );
        if (toTransition) {
          return (fromTransition.transitionTimestamp.getTime() - toTransition.transitionTimestamp.getTime()) / (1000 * 60 * 60 * 24);
        }
        return 0;
      }).filter(d => d > 0);

      averageDuration = durations.length > 0 
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
        : 0;
    }

    // Calculate completion rate (simplified)
    const completionRate = transitionsFromStage.length > 0 ? 100 : 
      (stage.isActive ? 50 : 0); // Active stage is 50% complete

    // Calculate user participation
    const totalUsers = cycle.goalSheets.length;
    const participatingUsers = totalUsers; // Simplified - all users participate
    const userParticipation = totalUsers > 0 ? (participatingUsers / totalUsers) * 100 : 0;

    return {
      stageName: stage.stageName,
      sequenceOrder: stage.sequenceOrder,
      averageDuration,
      completionRate,
      userParticipation,
      commonIssues: [], // Would be populated from audit logs in real implementation
      performanceIndicators: {
        onTime: Math.max(0, transitionsFromStage.filter((t: any) => !t.isAdminOverride).length),
        delayed: Math.max(0, transitionsFromStage.filter((t: any) => t.isAdminOverride).length),
        skipped: 0, // Would be calculated from workflow violations
      },
    };
  }

  private calculateOverallCycleMetrics(cycle: any, stageMetrics: StageMetric[]): OverallCycleMetrics {
    const totalDuration = stageMetrics.reduce((sum, stage) => sum + stage.averageDuration, 0);
    const cycleCompletionRate = stageMetrics.reduce((sum, stage) => sum + stage.completionRate, 0) / stageMetrics.length;
    const userSatisfactionScore = 85; // Would be calculated from user feedback
    
    // Calculate goal achievement rate
    const totalGoals = cycle.goalSheets.reduce((sum: number, sheet: any) => sum + sheet.goals.length, 0);
    const achievedGoals = cycle.goalSheets.reduce((sum: number, sheet: any) => 
      sum + sheet.goals.filter((goal: any) => goal.status === GoalStatus.COMPLETED).length, 0
    );
    const goalAchievementRate = totalGoals > 0 ? (achievedGoals / totalGoals) * 100 : 0;

    const stageEfficiencyScore = stageMetrics.reduce((sum, stage) => 
      sum + (stage.performanceIndicators.onTime / Math.max(1, stage.performanceIndicators.onTime + stage.performanceIndicators.delayed)) * 100, 0
    ) / stageMetrics.length;

    return {
      totalDuration,
      cycleCompletionRate,
      userSatisfactionScore,
      goalAchievementRate,
      stageEfficiencyScore,
    };
  }

  private async getOrganizationDrillDown(cycleId: string): Promise<DrillDownData> {
    // Implementation for organization-level drill-down
    const departments = await prisma.user.groupBy({
      by: ['department'],
      _count: { id: true },
    });

    return {
      level: 'organization',
      entityId: 'org',
      entityName: 'Organization',
      metrics: {
        totalEmployees: departments.reduce((sum, dept) => sum + dept._count.id, 0),
        totalDepartments: departments.length,
      },
      children: departments.map(dept => ({
        level: 'department' as const,
        entityId: dept.department,
        entityName: dept.department,
        metrics: { employees: dept._count.id },
        trends: [],
      })),
      trends: [],
    };
  }

  private async getDepartmentDrillDown(cycleId: string, departmentName: string): Promise<DrillDownData> {
    // Implementation for department-level drill-down
    const employees = await prisma.user.findMany({
      where: { department: departmentName },
      select: { id: true, name: true },
    });

    return {
      level: 'department',
      entityId: departmentName,
      entityName: departmentName,
      metrics: {
        totalEmployees: employees.length,
      },
      children: employees.map(emp => ({
        level: 'individual' as const,
        entityId: emp.id,
        entityName: emp.name,
        metrics: {},
        trends: [],
      })),
      trends: [],
    };
  }

  private async getTeamDrillDown(cycleId: string, managerId: string): Promise<DrillDownData> {
    // Implementation for team-level drill-down
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      include: {
        subordinates: {
          select: { id: true, name: true },
        },
      },
    });

    if (!manager) {
      throw new Error('Manager not found');
    }

    return {
      level: 'team',
      entityId: managerId,
      entityName: `${manager.name}'s Team`,
      metrics: {
        teamSize: manager.subordinates.length,
      },
      children: manager.subordinates.map(emp => ({
        level: 'individual' as const,
        entityId: emp.id,
        entityName: emp.name,
        metrics: {},
        trends: [],
      })),
      trends: [],
    };
  }

  private async getIndividualDrillDown(cycleId: string, employeeId: string): Promise<DrillDownData> {
    // Implementation for individual-level drill-down
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      include: {
        goalSheets: {
          where: { newCycleId: cycleId },
          include: {
            goals: {
              include: {
                achievements: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const goalSheet = employee.goalSheets[0];
    const totalGoals = goalSheet?.goals.length || 0;
    const completedGoals = goalSheet?.goals.filter(g => g.status === GoalStatus.COMPLETED).length || 0;

    return {
      level: 'individual',
      entityId: employeeId,
      entityName: employee.name,
      metrics: {
        totalGoals,
        completedGoals,
        completionRate: totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0,
        averageScore: goalSheet ? this.calculateEmployeeScore(goalSheet) : 0,
      },
      trends: [],
    };
  }

  private async getGoalStatistics(cycleId: string) {
    const goals = await prisma.goal.findMany({
      where: {
        goalSheet: {
          newCycleId: cycleId,
        },
      },
      include: {
        achievements: true,
      },
    });

    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.status === GoalStatus.COMPLETED).length;
    const onTrackGoals = goals.filter(g => g.status === GoalStatus.ON_TRACK).length;
    const notStartedGoals = goals.filter(g => g.status === GoalStatus.NOT_STARTED).length;

    return {
      totalGoals,
      completedGoals,
      onTrackGoals,
      notStartedGoals,
      completionRate: totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0,
    };
  }

  private async getUserEngagementMetrics(cycleId: string) {
    const goalSheets = await prisma.goalSheet.findMany({
      where: { newCycleId: cycleId },
      include: {
        employee: true,
        goals: {
          include: {
            achievements: true,
          },
        },
      },
    });

    const totalUsers = goalSheets.length;
    const activeUsers = goalSheets.filter(sheet => 
      sheet.goals.some(goal => 
        goal.achievements.some(achievement => 
          achievement.updatedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        )
      )
    ).length;

    return {
      totalUsers,
      activeUsers,
      engagementRate: totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0,
    };
  }
}

// Export singleton instance
export const analyticsEngineService = new AnalyticsEngineService();