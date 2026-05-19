import { prisma } from '../lib/prisma.js';
import { auditLogService } from './auditLogService.js';

export interface ComplianceReport {
  reportId: string;
  reportType: ComplianceReportType;
  generatedAt: Date;
  generatedBy: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  summary: ComplianceReportSummary;
  findings: ComplianceFinding[];
  recommendations: ComplianceRecommendation[];
  metadata: {
    totalRecordsAnalyzed: number;
    complianceScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    lastAuditDate?: Date;
  };
}

export interface ComplianceReportSummary {
  totalStageTransitions: number;
  adminOverrides: number;
  adminOverrideRate: number;
  unauthorizedAttempts: number;
  dataIntegrityIssues: number;
  auditTrailGaps: number;
  complianceViolations: number;
  averageStageTransitionTime: number;
  cyclesCompleted: number;
  cyclesAbandoned: number;
}

export interface ComplianceFinding {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: ComplianceFindingCategory;
  title: string;
  description: string;
  affectedEntities: string[];
  evidenceIds: string[];
  riskAssessment: string;
  regulatoryImpact?: string;
}

export interface ComplianceRecommendation {
  id: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  category: string;
  title: string;
  description: string;
  actionItems: string[];
  estimatedEffort: string;
  expectedBenefit: string;
  relatedFindings: string[];
}

export type ComplianceReportType = 
  | 'STAGE_TRANSITION_AUDIT'
  | 'ACCESS_CONTROL_COMPLIANCE'
  | 'DATA_INTEGRITY_AUDIT'
  | 'ADMIN_OVERRIDE_ANALYSIS'
  | 'WORKFLOW_COMPLIANCE'
  | 'COMPREHENSIVE_AUDIT';

export type ComplianceFindingCategory = 
  | 'UNAUTHORIZED_ACCESS'
  | 'MISSING_AUDIT_TRAIL'
  | 'DATA_INTEGRITY_VIOLATION'
  | 'WORKFLOW_BYPASS'
  | 'ADMIN_OVERRIDE_ABUSE'
  | 'STAGE_TRANSITION_VIOLATION'
  | 'RETENTION_POLICY_VIOLATION'
  | 'SECURITY_POLICY_VIOLATION';

export interface ComplianceDashboardMetrics {
  overallComplianceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trendsOverTime: Array<{
    period: string;
    complianceScore: number;
    violations: number;
    adminOverrides: number;
  }>;
  topRiskAreas: Array<{
    area: string;
    riskScore: number;
    violationCount: number;
    trend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
  }>;
  recentAlerts: Array<{
    id: string;
    severity: string;
    message: string;
    timestamp: Date;
    resolved: boolean;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    description: string;
    dueDate: Date;
    priority: string;
  }>;
}

export interface ComplianceAlertRule {
  id: string;
  name: string;
  description: string;
  category: ComplianceFindingCategory;
  conditions: {
    metric: string;
    operator: 'GT' | 'LT' | 'EQ' | 'GTE' | 'LTE';
    threshold: number;
    timeWindow: string; // e.g., '24h', '7d', '30d'
  }[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isActive: boolean;
  notificationChannels: string[];
  lastTriggered?: Date;
}

export class ComplianceReportingService {
  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(
    reportType: ComplianceReportType,
    startDate: Date,
    endDate: Date,
    generatedBy: string
  ): Promise<ComplianceReport> {
    const reportId = `compliance_${reportType.toLowerCase()}_${Date.now()}`;

    // Analyze audit data for the specified period
    const auditData = await auditLogService.getAuditLogs({
      startDate,
      endDate,
      limit: 50000,
      includeDetails: true,
    });

    // Generate report based on type
    let summary: ComplianceReportSummary;
    let findings: ComplianceFinding[];
    let recommendations: ComplianceRecommendation[];

    switch (reportType) {
      case 'STAGE_TRANSITION_AUDIT':
        ({ summary, findings, recommendations } = await this.analyzeStageTransitionCompliance(auditData.logs, startDate, endDate));
        break;
      case 'ACCESS_CONTROL_COMPLIANCE':
        ({ summary, findings, recommendations } = await this.analyzeAccessControlCompliance(auditData.logs, startDate, endDate));
        break;
      case 'DATA_INTEGRITY_AUDIT':
        ({ summary, findings, recommendations } = await this.analyzeDataIntegrityCompliance(auditData.logs, startDate, endDate));
        break;
      case 'ADMIN_OVERRIDE_ANALYSIS':
        ({ summary, findings, recommendations } = await this.analyzeAdminOverrideCompliance(auditData.logs, startDate, endDate));
        break;
      case 'WORKFLOW_COMPLIANCE':
        ({ summary, findings, recommendations } = await this.analyzeWorkflowCompliance(auditData.logs, startDate, endDate));
        break;
      case 'COMPREHENSIVE_AUDIT':
        ({ summary, findings, recommendations } = await this.analyzeComprehensiveCompliance(auditData.logs, startDate, endDate));
        break;
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }

    // Calculate compliance score and risk level
    const complianceScore = this.calculateComplianceScore(findings);
    const riskLevel = this.determineRiskLevel(complianceScore, findings);

    const report: ComplianceReport = {
      reportId,
      reportType,
      generatedAt: new Date(),
      generatedBy,
      period: { startDate, endDate },
      summary,
      findings,
      recommendations,
      metadata: {
        totalRecordsAnalyzed: auditData.logs.length,
        complianceScore,
        riskLevel,
      },
    };

    // Store report for future reference
    await this.storeComplianceReport(report);

    return report;
  }

  /**
   * Get compliance dashboard metrics
   */
  async getComplianceDashboardMetrics(): Promise<ComplianceDashboardMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get recent compliance data
    const recentAuditData = await auditLogService.getAuditLogs({
      startDate: thirtyDaysAgo,
      endDate: now,
      limit: 10000,
      includeDetails: true,
    });

    // Calculate overall compliance score
    const findings = await this.identifyComplianceFindings(recentAuditData.logs);
    const overallComplianceScore = this.calculateComplianceScore(findings);
    const riskLevel = this.determineRiskLevel(overallComplianceScore, findings);

    // Get trends over time (weekly data for last 12 weeks)
    const trendsOverTime = await this.getComplianceTrends(12);

    // Identify top risk areas
    const topRiskAreas = await this.getTopRiskAreas();

    // Get recent alerts
    const recentAlerts = await this.getRecentComplianceAlerts();

    // Get upcoming compliance deadlines
    const upcomingDeadlines = await this.getUpcomingComplianceDeadlines();

    return {
      overallComplianceScore,
      riskLevel,
      trendsOverTime,
      topRiskAreas,
      recentAlerts,
      upcomingDeadlines,
    };
  }

  /**
   * Export audit trail for compliance purposes
   */
  async exportAuditTrail(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' | 'pdf' = 'json',
    includeMetadata: boolean = true
  ): Promise<{
    data: any;
    filename: string;
    mimeType: string;
    integrity: {
      totalRecords: number;
      checksumValid: boolean;
      exportTimestamp: Date;
      exportedBy: string;
    };
  }> {
    // Get audit logs for the period
    const auditData = await auditLogService.getAuditLogs({
      startDate,
      endDate,
      limit: 100000,
      includeDetails: true,
    });

    // Verify audit trail integrity
    const integrityCheck = await auditLogService.verifyAuditIntegrity();

    // Prepare export data
    const exportData = {
      metadata: includeMetadata ? {
        exportDate: new Date(),
        period: { startDate, endDate },
        totalRecords: auditData.logs.length,
        integrityStatus: integrityCheck,
        complianceVersion: '1.0.0',
      } : undefined,
      auditLogs: auditData.logs,
    };

    // Format data based on requested format
    const timestamp = new Date().toISOString().split('T')[0];
    let formattedData: any;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'json':
        formattedData = JSON.stringify(exportData, null, 2);
        filename = `audit_trail_${timestamp}.json`;
        mimeType = 'application/json';
        break;
      case 'csv':
        formattedData = this.convertAuditDataToCSV(auditData.logs);
        filename = `audit_trail_${timestamp}.csv`;
        mimeType = 'text/csv';
        break;
      case 'pdf':
        // In a real implementation, you would generate a PDF
        formattedData = JSON.stringify(exportData, null, 2);
        filename = `audit_trail_${timestamp}.pdf`;
        mimeType = 'application/pdf';
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    return {
      data: formattedData,
      filename,
      mimeType,
      integrity: {
        totalRecords: auditData.logs.length,
        checksumValid: integrityCheck.isValid,
        exportTimestamp: new Date(),
        exportedBy: 'system', // In real implementation, get from context
      },
    };
  }

  /**
   * Create automated compliance alert rules
   */
  async createComplianceAlertRule(rule: Omit<ComplianceAlertRule, 'id' | 'lastTriggered'>): Promise<string> {
    const ruleId = `alert_rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alertRule: ComplianceAlertRule = {
      ...rule,
      id: ruleId,
    };

    // Store alert rule
    await prisma.complianceAlertRule.create({
      data: {
        id: alertRule.id,
        name: alertRule.name,
        description: alertRule.description,
        category: alertRule.category,
        conditions: alertRule.conditions as any,
        severity: alertRule.severity,
        isActive: alertRule.isActive,
        notificationChannels: alertRule.notificationChannels,
      },
    });

    return ruleId;
  }

  /**
   * Check compliance alert rules and trigger alerts
   */
  async checkComplianceAlerts(): Promise<{
    triggeredAlerts: number;
    newAlerts: Array<{
      ruleId: string;
      ruleName: string;
      severity: string;
      message: string;
    }>;
  }> {
    // Get active alert rules
    const alertRules = await prisma.complianceAlertRule.findMany({
      where: { isActive: true },
    });

    const newAlerts: Array<{
      ruleId: string;
      ruleName: string;
      severity: string;
      message: string;
    }> = [];

    for (const rule of alertRules) {
      const shouldTrigger = await this.evaluateAlertRule(rule);
      
      if (shouldTrigger) {
        // Create alert
        const alert = {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `Compliance alert: ${rule.description}`,
        };

        newAlerts.push(alert);

        // Store alert in database
        await prisma.complianceAlert.create({
          data: {
            ruleId: rule.id,
            severity: rule.severity,
            message: alert.message,
            triggeredAt: new Date(),
            resolved: false,
          },
        });

        // Update rule last triggered timestamp
        await prisma.complianceAlertRule.update({
          where: { id: rule.id },
          data: { lastTriggered: new Date() },
        });
      }
    }

    return {
      triggeredAlerts: newAlerts.length,
      newAlerts,
    };
  }

  /**
   * Analyze stage transition compliance
   */
  private async analyzeStageTransitionCompliance(auditLogs: any[], startDate: Date, endDate: Date) {
    const stageTransitions = auditLogs.filter(log => 
      log.action === 'STAGE_TRANSITION' || log.action === 'STAGE_ADMIN_OVERRIDE'
    );

    const adminOverrides = stageTransitions.filter(log => log.action === 'STAGE_ADMIN_OVERRIDE');
    const unauthorizedAttempts = auditLogs.filter(log => 
      log.action.includes('UNAUTHORIZED') || log.action.includes('DENIED')
    );

    // Calculate metrics
    const summary: ComplianceReportSummary = {
      totalStageTransitions: stageTransitions.length,
      adminOverrides: adminOverrides.length,
      adminOverrideRate: stageTransitions.length > 0 ? (adminOverrides.length / stageTransitions.length) * 100 : 0,
      unauthorizedAttempts: unauthorizedAttempts.length,
      dataIntegrityIssues: 0, // Would be calculated based on specific checks
      auditTrailGaps: 0, // Would be calculated based on missing records
      complianceViolations: 0, // Would be calculated based on policy violations
      averageStageTransitionTime: 0, // Would be calculated from transition timestamps
      cyclesCompleted: 0, // Would be calculated from cycle completion data
      cyclesAbandoned: 0, // Would be calculated from abandoned cycles
    };

    // Identify findings
    const findings: ComplianceFinding[] = [];

    // Check for excessive admin overrides
    if (summary.adminOverrideRate > 10) {
      findings.push({
        id: `finding_${Date.now()}_1`,
        severity: summary.adminOverrideRate > 25 ? 'HIGH' : 'MEDIUM',
        category: 'ADMIN_OVERRIDE_ABUSE',
        title: 'Excessive Admin Override Usage',
        description: `Admin override rate of ${summary.adminOverrideRate.toFixed(1)}% exceeds recommended threshold of 10%`,
        affectedEntities: adminOverrides.map(log => log.entityId),
        evidenceIds: adminOverrides.map(log => log.id),
        riskAssessment: 'High admin override usage may indicate process issues or policy violations',
        regulatoryImpact: 'May indicate lack of proper controls and audit trail integrity',
      });
    }

    // Check for unauthorized access attempts
    if (unauthorizedAttempts.length > 0) {
      findings.push({
        id: `finding_${Date.now()}_2`,
        severity: unauthorizedAttempts.length > 10 ? 'HIGH' : 'MEDIUM',
        category: 'UNAUTHORIZED_ACCESS',
        title: 'Unauthorized Access Attempts Detected',
        description: `${unauthorizedAttempts.length} unauthorized access attempts detected`,
        affectedEntities: unauthorizedAttempts.map(log => log.entityId),
        evidenceIds: unauthorizedAttempts.map(log => log.id),
        riskAssessment: 'Unauthorized access attempts may indicate security vulnerabilities',
        regulatoryImpact: 'Security incidents must be reported and investigated',
      });
    }

    // Generate recommendations
    const recommendations: ComplianceRecommendation[] = [];

    if (summary.adminOverrideRate > 10) {
      recommendations.push({
        id: `rec_${Date.now()}_1`,
        priority: 'HIGH',
        category: 'Process Improvement',
        title: 'Reduce Admin Override Usage',
        description: 'Implement process improvements to reduce reliance on admin overrides',
        actionItems: [
          'Review and update stage transition requirements',
          'Provide additional training on proper workflow procedures',
          'Implement automated validation checks',
          'Establish clear escalation procedures',
        ],
        estimatedEffort: '2-4 weeks',
        expectedBenefit: 'Improved process compliance and audit trail integrity',
        relatedFindings: findings.filter(f => f.category === 'ADMIN_OVERRIDE_ABUSE').map(f => f.id),
      });
    }

    return { summary, findings, recommendations };
  }

  /**
   * Analyze access control compliance
   */
  private async analyzeAccessControlCompliance(auditLogs: any[], startDate: Date, endDate: Date) {
    // Implementation would analyze access control violations
    return {
      summary: {} as ComplianceReportSummary,
      findings: [] as ComplianceFinding[],
      recommendations: [] as ComplianceRecommendation[],
    };
  }

  /**
   * Analyze data integrity compliance
   */
  private async analyzeDataIntegrityCompliance(auditLogs: any[], startDate: Date, endDate: Date) {
    // Implementation would analyze data integrity issues
    return {
      summary: {} as ComplianceReportSummary,
      findings: [] as ComplianceFinding[],
      recommendations: [] as ComplianceRecommendation[],
    };
  }

  /**
   * Analyze admin override compliance
   */
  private async analyzeAdminOverrideCompliance(auditLogs: any[], startDate: Date, endDate: Date) {
    // Implementation would analyze admin override patterns
    return {
      summary: {} as ComplianceReportSummary,
      findings: [] as ComplianceFinding[],
      recommendations: [] as ComplianceRecommendation[],
    };
  }

  /**
   * Analyze workflow compliance
   */
  private async analyzeWorkflowCompliance(auditLogs: any[], startDate: Date, endDate: Date) {
    // Implementation would analyze workflow violations
    return {
      summary: {} as ComplianceReportSummary,
      findings: [] as ComplianceFinding[],
      recommendations: [] as ComplianceRecommendation[],
    };
  }

  /**
   * Analyze comprehensive compliance
   */
  private async analyzeComprehensiveCompliance(auditLogs: any[], startDate: Date, endDate: Date) {
    // Implementation would perform comprehensive analysis
    return {
      summary: {} as ComplianceReportSummary,
      findings: [] as ComplianceFinding[],
      recommendations: [] as ComplianceRecommendation[],
    };
  }

  /**
   * Calculate compliance score based on findings
   */
  private calculateComplianceScore(findings: ComplianceFinding[]): number {
    if (findings.length === 0) return 100;

    const severityWeights = {
      LOW: 1,
      MEDIUM: 3,
      HIGH: 7,
      CRITICAL: 15,
    };

    const totalWeight = findings.reduce((sum, finding) => sum + severityWeights[finding.severity], 0);
    const maxPossibleWeight = findings.length * severityWeights.CRITICAL;

    return Math.max(0, Math.round(100 - (totalWeight / maxPossibleWeight) * 100));
  }

  /**
   * Determine risk level based on compliance score and findings
   */
  private determineRiskLevel(complianceScore: number, findings: ComplianceFinding[]): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const criticalFindings = findings.filter(f => f.severity === 'CRITICAL').length;
    const highFindings = findings.filter(f => f.severity === 'HIGH').length;

    if (criticalFindings > 0 || complianceScore < 60) return 'CRITICAL';
    if (highFindings > 2 || complianceScore < 75) return 'HIGH';
    if (complianceScore < 90) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Store compliance report in database
   */
  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    try {
      await prisma.complianceReport.create({
        data: {
          id: report.reportId,
          reportType: report.reportType,
          generatedAt: report.generatedAt,
          generatedBy: report.generatedBy,
          startDate: report.period.startDate,
          endDate: report.period.endDate,
          summary: report.summary as any,
          findings: report.findings as any,
          recommendations: report.recommendations as any,
          metadata: report.metadata as any,
        },
      });
    } catch (error) {
      console.error('Failed to store compliance report:', error);
    }
  }

  /**
   * Helper methods for dashboard metrics
   */
  private async getComplianceTrends(weeks: number) {
    // Implementation would calculate weekly compliance trends
    return [];
  }

  private async getTopRiskAreas() {
    // Implementation would identify top risk areas
    return [];
  }

  private async getRecentComplianceAlerts() {
    return await prisma.complianceAlert.findMany({
      where: {
        triggeredAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: { triggeredAt: 'desc' },
      take: 10,
    });
  }

  private async getUpcomingComplianceDeadlines() {
    // Implementation would get upcoming compliance deadlines
    return [];
  }

  private async identifyComplianceFindings(auditLogs: any[]): Promise<ComplianceFinding[]> {
    // Implementation would identify compliance findings from audit logs
    return [];
  }

  private convertAuditDataToCSV(auditLogs: any[]): string {
    // Implementation would convert audit data to CSV format
    return '';
  }

  private async evaluateAlertRule(rule: ComplianceAlertRule): Promise<boolean> {
    // Implementation would evaluate alert rule conditions
    return false;
  }
}

// Export singleton instance
export const complianceReportingService = new ComplianceReportingService();