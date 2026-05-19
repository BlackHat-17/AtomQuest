import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { analyticsEngineService } from '../services/analyticsEngineService.js';
import { auditLogService } from '../services/auditLogService.js';

const router = Router();

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize(['ADMIN']));

/**
 * GET /api/admin/analytics/:cycleId/qoq-trends
 * Get Quarter-over-Quarter trend analysis for a specific cycle
 */
router.get('/:cycleId/qoq-trends', async (req, res) => {
  try {
    const { cycleId } = req.params;
    const { previousCycleId } = req.query;

    const qoqAnalysis = await analyticsEngineService.generateQoQTrendAnalysis(
      cycleId,
      previousCycleId as string | undefined
    );

    // Log analytics access
    await auditLogService.logAction({
      userId: req.user!.id,
      action: 'ANALYTICS_QOQ_ACCESS',
      entityType: 'CYCLE',
      entityId: cycleId,
      details: {
        previousCycleId: previousCycleId || 'auto-detected',
        employeeCount: qoqAnalysis.trends.length,
      },
    });

    res.json(qoqAnalysis);
  } catch (error) {
    console.error('QoQ trends error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Cycle not found or no previous cycle available for comparison',
        code: 'CYCLE_NOT_FOUND'
      });
    }

    res.status(500).json({
      error: 'Failed to generate QoQ trend analysis',
      code: 'QOQ_ANALYSIS_FAILED'
    });
  }
});

/**
 * GET /api/admin/analytics/:cycleId/stage-performance
 * Get stage performance metrics for a specific cycle
 */
router.get('/:cycleId/stage-performance', async (req, res) => {
  try {
    const { cycleId } = req.params;

    const stageMetrics = await analyticsEngineService.generateStagePerformanceMetrics(cycleId);

    // Log analytics access
    await auditLogService.logAction({
      userId: req.user!.id,
      action: 'ANALYTICS_STAGE_ACCESS',
      entityType: 'CYCLE',
      entityId: cycleId,
      details: {
        stageCount: stageMetrics.stages.length,
        cycleName: stageMetrics.cycleName,
      },
    });

    res.json(stageMetrics);
  } catch (error) {
    console.error('Stage performance error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Cycle not found',
        code: 'CYCLE_NOT_FOUND'
      });
    }

    res.status(500).json({
      error: 'Failed to generate stage performance metrics',
      code: 'STAGE_METRICS_FAILED'
    });
  }
});

/**
 * GET /api/admin/analytics/:cycleId/drill-down
 * Get drill-down data for detailed analysis
 */
router.get('/:cycleId/drill-down', async (req, res) => {
  try {
    const { cycleId } = req.params;
    const { level, entityId } = req.query;

    if (!level || !['organization', 'department', 'team', 'individual'].includes(level as string)) {
      return res.status(400).json({
        error: 'Invalid drill-down level. Must be one of: organization, department, team, individual',
        code: 'INVALID_DRILL_DOWN_LEVEL'
      });
    }

    const drillDownData = await analyticsEngineService.getDrillDownData(
      cycleId,
      level as 'organization' | 'department' | 'team' | 'individual',
      entityId as string | undefined
    );

    // Log drill-down access
    await auditLogService.logAction({
      userId: req.user!.id,
      action: 'ANALYTICS_DRILL_DOWN_ACCESS',
      entityType: 'CYCLE',
      entityId: cycleId,
      details: {
        level,
        entityId: entityId || 'N/A',
        entityName: drillDownData.entityName,
      },
    });

    res.json(drillDownData);
  } catch (error) {
    console.error('Drill-down error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Entity not found for drill-down analysis',
        code: 'ENTITY_NOT_FOUND'
      });
    }

    res.status(500).json({
      error: 'Failed to generate drill-down data',
      code: 'DRILL_DOWN_FAILED'
    });
  }
});

/**
 * GET /api/admin/analytics/:cycleId/export
 * Export analytics data in various formats
 */
router.get('/:cycleId/export', async (req, res) => {
  try {
    const { cycleId } = req.params;
    const { reportType, format, ...filters } = req.query;

    if (!reportType || !format) {
      return res.status(400).json({
        error: 'reportType and format are required',
        code: 'MISSING_EXPORT_PARAMS'
      });
    }

    if (!['csv', 'excel', 'json'].includes(format as string)) {
      return res.status(400).json({
        error: 'Invalid format. Must be one of: csv, excel, json',
        code: 'INVALID_EXPORT_FORMAT'
      });
    }

    let exportData;

    switch (reportType) {
      case 'qoq':
        exportData = await analyticsEngineService.exportQoQTrendData(
          cycleId,
          format as 'csv' | 'excel' | 'json',
          filters as Record<string, any>
        );
        break;
      
      case 'stage-performance':
        // Generate stage performance data and format for export
        const stageMetrics = await analyticsEngineService.generateStagePerformanceMetrics(cycleId);
        exportData = {
          format: format as 'csv' | 'excel' | 'json',
          data: format === 'json' ? stageMetrics : stageMetrics.stages.map(stage => ({
            'Stage Name': stage.stageName,
            'Sequence Order': stage.sequenceOrder,
            'Average Duration (days)': stage.averageDuration,
            'Completion Rate (%)': stage.completionRate,
            'User Participation (%)': stage.userParticipation,
            'On Time': stage.performanceIndicators.onTime,
            'Delayed': stage.performanceIndicators.delayed,
            'Skipped': stage.performanceIndicators.skipped,
          })),
          metadata: {
            generatedAt: new Date(),
            cycleId,
            reportType: 'Stage_Performance_Metrics',
            filters,
          },
        };
        break;

      default:
        return res.status(400).json({
          error: 'Invalid report type. Must be one of: qoq, stage-performance',
          code: 'INVALID_REPORT_TYPE'
        });
    }

    // Log export action
    await auditLogService.logAction({
      userId: req.user!.id,
      action: 'ANALYTICS_EXPORT',
      entityType: 'CYCLE',
      entityId: cycleId,
      details: {
        reportType,
        format,
        filters,
        recordCount: Array.isArray(exportData.data) ? exportData.data.length : 0,
      },
    });

    // Set appropriate headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${reportType}-${timestamp}.${format}`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.json(exportData);
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      
      // Convert to CSV format
      if (exportData.data.length > 0) {
        const headers = Object.keys(exportData.data[0]).join(',');
        const rows = exportData.data.map((row: any) => 
          Object.values(row).map(value => 
            typeof value === 'string' && value.includes(',') ? `"${value}"` : value
          ).join(',')
        );
        res.send([headers, ...rows].join('\n'));
      } else {
        res.send('No data available');
      }
    } else if (format === 'excel') {
      // For Excel format, we'll send JSON and let the frontend handle Excel conversion
      // In a real implementation, you might use a library like xlsx to generate actual Excel files
      res.setHeader('Content-Type', 'application/json');
      res.json(exportData);
    }
  } catch (error) {
    console.error('Export error:', error);
    
    res.status(500).json({
      error: 'Failed to export analytics data',
      code: 'EXPORT_FAILED'
    });
  }
});

/**
 * GET /api/admin/analytics/:cycleId/dashboard
 * Get comprehensive dashboard data for a cycle
 */
router.get('/:cycleId/dashboard', async (req, res) => {
  try {
    const { cycleId } = req.params;

    const dashboardData = await analyticsEngineService.getAnalyticsDashboard(cycleId);

    // Log dashboard access
    await auditLogService.logAction({
      userId: req.user!.id,
      action: 'ANALYTICS_DASHBOARD_ACCESS',
      entityType: 'CYCLE',
      entityId: cycleId,
      details: {
        hasQoQData: !!dashboardData.qoqAnalysis,
        stageCount: dashboardData.stageMetrics?.stages.length || 0,
      },
    });

    res.json(dashboardData);
  } catch (error) {
    console.error('Dashboard error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Cycle not found',
        code: 'CYCLE_NOT_FOUND'
      });
    }

    res.status(500).json({
      error: 'Failed to load analytics dashboard',
      code: 'DASHBOARD_FAILED'
    });
  }
});

export default router;