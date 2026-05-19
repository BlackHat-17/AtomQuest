import { prisma } from '../lib/prisma.js';

export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details?: Record<string, any>;
  timestamp?: Date;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogQuery {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  includeDetails?: boolean;
}

export interface StageTransitionAuditEntry {
  cycleId: string;
  fromStageId?: string;
  toStageId: string;
  initiatedById: string;
  reason?: string;
  isAdminOverride: boolean;
  beforeState: {
    stageName: string;
    isActive: boolean;
    startDate?: Date;
    endDate?: Date;
  };
  afterState: {
    stageName: string;
    isActive: boolean;
    startDate?: Date;
    endDate?: Date;
  };
  metadata: {
    cycleName: string;
    transitionType: 'NORMAL' | 'ADMIN_OVERRIDE' | 'AUTO_TRANSITION';
    validationsPassed: boolean;
    requirementsMet: boolean;
  };
}

export interface AuditReport {
  reportId: string;
  generatedAt: Date;
  generatedBy: string;
  filters: AuditLogQuery;
  summary: {
    totalEntries: number;
    dateRange: { start: Date; end: Date };
    topActions: Array<{ action: string; count: number }>;
    topUsers: Array<{ userId: string; userName: string; count: number }>;
    entityBreakdown: Array<{ entityType: string; count: number }>;
  };
  entries: any[];
}

export class AuditLogService {
  private readonly IMMUTABLE_ACTIONS = [
    'STAGE_TRANSITION',
    'STAGE_ADMIN_OVERRIDE',
    'CYCLE_CREATED',
    'CYCLE_ACTIVATED',
    'CYCLE_DEACTIVATED',
    'MIGRATION_STARTED',
    'MIGRATION_COMPLETED',
    'MIGRATION_ROLLBACK_STARTED',
  ];

  /**
   * Log an action to the audit trail with immutable record creation
   */
  async logAction(entry: AuditLogEntry): Promise<string> {
    try {
      const auditRecord = await prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          userId: entry.userId,
          details: entry.details || {},
          beforeState: entry.beforeState || {},
          afterState: entry.afterState || {},
          timestamp: entry.timestamp || new Date(),
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          isImmutable: this.IMMUTABLE_ACTIONS.includes(entry.action),
          checksum: this.generateChecksum(entry),
        },
      });

      return auditRecord.id;
    } catch (error) {
      console.error('Failed to create audit log entry:', error);
      // Don't throw error to avoid breaking the main operation
      return '';
    }
  }

  /**
   * Log stage transition with comprehensive audit trail
   */
  async logStageTransition(entry: StageTransitionAuditEntry): Promise<string> {
    const auditEntry: AuditLogEntry = {
      action: entry.isAdminOverride ? 'STAGE_ADMIN_OVERRIDE' : 'STAGE_TRANSITION',
      entityType: 'StageTransition',
      entityId: entry.toStageId,
      userId: entry.initiatedById,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
      details: {
        cycleId: entry.cycleId,
        cycleName: entry.metadata.cycleName,
        fromStageId: entry.fromStageId,
        toStageId: entry.toStageId,
        reason: entry.reason,
        isAdminOverride: entry.isAdminOverride,
        transitionType: entry.metadata.transitionType,
        validationsPassed: entry.metadata.validationsPassed,
        requirementsMet: entry.metadata.requirementsMet,
        transitionTimestamp: new Date(),
      },
    };

    return await this.logAction(auditEntry);
  }

  /**
   * Get audit log entries with filtering and pagination
   */
  async getAuditLogs(query: AuditLogQuery = {}) {
    const {
      entityType,
      entityId,
      userId,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      includeDetails = true,
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const select: any = {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      userId: true,
      timestamp: true,
      isImmutable: true,
      user: {
        select: { id: true, name: true, email: true },
      },
    };

    if (includeDetails) {
      select.details = true;
      select.beforeState = true;
      select.afterState = true;
      select.ipAddress = true;
      select.userAgent = true;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get audit logs for a specific entity with full history
   */
  async getEntityAuditLogs(entityType: string, entityId: string) {
    return await prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
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
   * Get stage transition audit trail for a cycle
   */
  async getCycleStageTransitionAudit(cycleId: string) {
    const stageTransitions = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ['STAGE_TRANSITION', 'STAGE_ADMIN_OVERRIDE'],
        },
        details: {
          path: ['cycleId'],
          equals: cycleId,
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    return stageTransitions.map(transition => ({
      id: transition.id,
      action: transition.action,
      timestamp: transition.timestamp,
      initiatedBy: transition.user,
      fromStage: transition.beforeState?.stageName,
      toStage: transition.afterState?.stageName,
      reason: transition.details?.reason,
      isAdminOverride: transition.details?.isAdminOverride || false,
      transitionType: transition.details?.transitionType,
      validationsPassed: transition.details?.validationsPassed,
      requirementsMet: transition.details?.requirementsMet,
      isImmutable: transition.isImmutable,
    }));
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserAuditLogs(userId: string, options: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { userId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: { userId } }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Generate comprehensive audit report with filtering
   */
  async generateAuditReport(
    filters: AuditLogQuery,
    generatedBy: string
  ): Promise<AuditReport> {
    const reportId = `audit_report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get filtered audit logs
    const auditData = await this.getAuditLogs({
      ...filters,
      limit: 10000, // Large limit for report generation
      includeDetails: true,
    });

    // Generate summary statistics
    const summary = await this.generateAuditSummary(filters);

    const report: AuditReport = {
      reportId,
      generatedAt: new Date(),
      generatedBy,
      filters,
      summary,
      entries: auditData.logs,
    };

    // Store report metadata for future reference
    await this.storeAuditReport(report);

    return report;
  }

  /**
   * Verify audit trail integrity using checksums
   */
  async verifyAuditIntegrity(entityType?: string, entityId?: string): Promise<{
    isValid: boolean;
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    corruptedRecords: string[];
  }> {
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const auditLogs = await prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        userId: true,
        details: true,
        beforeState: true,
        afterState: true,
        timestamp: true,
        checksum: true,
      },
    });

    let validRecords = 0;
    const corruptedRecords: string[] = [];

    for (const log of auditLogs) {
      const expectedChecksum = this.generateChecksum({
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        userId: log.userId,
        details: log.details,
        beforeState: log.beforeState,
        afterState: log.afterState,
        timestamp: log.timestamp,
      });

      if (log.checksum === expectedChecksum) {
        validRecords++;
      } else {
        corruptedRecords.push(log.id);
      }
    }

    return {
      isValid: corruptedRecords.length === 0,
      totalRecords: auditLogs.length,
      validRecords,
      invalidRecords: corruptedRecords.length,
      corruptedRecords,
    };
  }

  /**
   * Export audit logs in various formats
   */
  async exportAuditLogs(
    filters: AuditLogQuery,
    format: 'json' | 'csv' | 'xlsx' = 'json'
  ): Promise<{
    data: any;
    filename: string;
    mimeType: string;
  }> {
    const auditData = await this.getAuditLogs({
      ...filters,
      limit: 50000, // Large limit for export
      includeDetails: true,
    });

    const timestamp = new Date().toISOString().split('T')[0];
    
    switch (format) {
      case 'json':
        return {
          data: JSON.stringify(auditData, null, 2),
          filename: `audit_logs_${timestamp}.json`,
          mimeType: 'application/json',
        };
      
      case 'csv':
        const csvData = this.convertToCSV(auditData.logs);
        return {
          data: csvData,
          filename: `audit_logs_${timestamp}.csv`,
          mimeType: 'text/csv',
        };
      
      default:
        return {
          data: JSON.stringify(auditData, null, 2),
          filename: `audit_logs_${timestamp}.json`,
          mimeType: 'application/json',
        };
    }
  }

  /**
   * Get audit statistics for dashboard
   */
  async getAuditStatistics(timeRange: 'day' | 'week' | 'month' | 'year' = 'month') {
    const now = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    const [totalLogs, actionBreakdown, userActivity, entityBreakdown] = await Promise.all([
      prisma.auditLog.count({
        where: {
          timestamp: { gte: startDate },
        },
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: {
          timestamp: { gte: startDate },
        },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          timestamp: { gte: startDate },
        },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['entityType'],
        where: {
          timestamp: { gte: startDate },
        },
        _count: { entityType: true },
        orderBy: { _count: { entityType: 'desc' } },
      }),
    ]);

    return {
      timeRange,
      period: { start: startDate, end: now },
      totalLogs,
      actionBreakdown: actionBreakdown.map(item => ({
        action: item.action,
        count: item._count.action,
      })),
      userActivity: userActivity.map(item => ({
        userId: item.userId,
        count: item._count.userId,
      })),
      entityBreakdown: entityBreakdown.map(item => ({
        entityType: item.entityType,
        count: item._count.entityType,
      })),
    };
  }

  /**
   * Generate checksum for audit record integrity
   */
  private generateChecksum(entry: Partial<AuditLogEntry>): string {
    const data = JSON.stringify({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      userId: entry.userId,
      details: entry.details,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
      timestamp: entry.timestamp,
    });
    
    // Simple checksum - in production, use a proper cryptographic hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Generate audit summary statistics
   */
  private async generateAuditSummary(filters: AuditLogQuery) {
    const where: any = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = filters.startDate;
      if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    const [totalEntries, dateRange, topActions, topUsers, entityBreakdown] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.aggregate({
        where,
        _min: { timestamp: true },
        _max: { timestamp: true },
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['userId'],
        where,
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['entityType'],
        where,
        _count: { entityType: true },
        orderBy: { _count: { entityType: 'desc' } },
      }),
    ]);

    // Get user names for top users
    const userIds = topUsers.map(u => u.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });

    const userMap = new Map(users.map(u => [u.id, u.name]));

    return {
      totalEntries,
      dateRange: {
        start: dateRange._min.timestamp || new Date(),
        end: dateRange._max.timestamp || new Date(),
      },
      topActions: topActions.map(item => ({
        action: item.action,
        count: item._count.action,
      })),
      topUsers: topUsers.map(item => ({
        userId: item.userId,
        userName: userMap.get(item.userId) || 'Unknown',
        count: item._count.userId,
      })),
      entityBreakdown: entityBreakdown.map(item => ({
        entityType: item.entityType,
        count: item._count.entityType,
      })),
    };
  }

  /**
   * Store audit report metadata
   */
  private async storeAuditReport(report: AuditReport): Promise<void> {
    try {
      await prisma.auditReport.create({
        data: {
          id: report.reportId,
          generatedAt: report.generatedAt,
          generatedBy: report.generatedBy,
          filters: report.filters as any,
          summary: report.summary as any,
          entryCount: report.entries.length,
        },
      });
    } catch (error) {
      console.error('Failed to store audit report metadata:', error);
    }
  }

  /**
   * Convert audit logs to CSV format
   */
  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'ID',
      'Timestamp',
      'Action',
      'Entity Type',
      'Entity ID',
      'User ID',
      'User Name',
      'User Email',
      'Details',
      'Is Immutable',
    ];

    const rows = logs.map(log => [
      log.id,
      log.timestamp.toISOString(),
      log.action,
      log.entityType,
      log.entityId,
      log.userId,
      log.user?.name || '',
      log.user?.email || '',
      JSON.stringify(log.details || {}),
      log.isImmutable ? 'Yes' : 'No',
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }
}

// Export singleton instance
export const auditLogService = new AuditLogService();