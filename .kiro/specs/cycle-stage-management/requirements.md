# Requirements Document — Enterprise Cycle-Stage Management

## Introduction

This document defines the requirements for implementing proper enterprise cycle-stage management in the Goal Tracking Portal. The current system has a fundamental architectural flaw where it treats phases (GOAL_SETTING, Q1, Q2, Q3, Q4) as separate cycles instead of stages within a single cycle. This causes goal visibility issues, broken reporting, employee confusion, duplicate KPI records, and missing goal mapping. The solution implements a proper enterprise workflow where one cycle (e.g., "Q1 2026") contains multiple sequential stages that maintain goal continuity throughout the entire cycle.

## Glossary

- **Cycle**: A complete goal management period (e.g., "Q1 2026", "Q2 2026") containing multiple stages
- **Stage**: A phase within a cycle representing different workflow states (Planning, Approval, Locked, Execution, Review)
- **Goal_Continuity**: The principle that goals remain visible and trackable throughout all stages within the same cycle
- **Stage_Transition**: The process of moving from one stage to another within a cycle
- **Cycle_Manager**: The system component responsible for managing cycle and stage lifecycles
- **Legacy_Phase_System**: The current flawed implementation treating phases as separate cycles
- **Enterprise_Workflow**: The correct workflow pattern where stages represent different activities within a single cycle
- **QoQ_Analysis**: Quarter-over-Quarter trend analysis requiring goal continuity across cycles

## Requirements

### Requirement 1: Cycle Definition and Management

**User Story:** As an admin, I want to define cycles with proper quarterly naming and multiple stages, so that the system follows enterprise workflow patterns.

#### Acceptance Criteria

1. THE Cycle_Manager SHALL create cycles with names like "Q1 2026", "Q2 2026", "H1 2026", "FY2026"
2. WHEN a cycle is created, THE Cycle_Manager SHALL automatically generate default stages: "Planning", "Approval", "Locked", "Execution", "Review"
3. THE Cycle_Manager SHALL enforce that each cycle has exactly one quarter (Q1, Q2, Q3, Q4) and one year
4. THE Cycle_Manager SHALL prevent duplicate cycles for the same quarter and year combination
5. WHEN a cycle is activated, THE Cycle_Manager SHALL ensure only one cycle can be active at a time

### Requirement 2: Stage Lifecycle Management

**User Story:** As an admin, I want to manage stage transitions within cycles, so that workflow progression is controlled and auditable.

#### Acceptance Criteria

1. THE Stage_Manager SHALL maintain stage sequence: Planning → Approval → Locked → Execution → Review
2. WHEN transitioning stages, THE Stage_Manager SHALL validate that the previous stage requirements are met
3. THE Stage_Manager SHALL record stage transition timestamps and initiating user
4. IF a stage transition is invalid, THEN THE Stage_Manager SHALL return a descriptive error message
5. THE Stage_Manager SHALL allow admin override of stage transitions with mandatory reason logging

### Requirement 3: Goal Continuity Across Stages

**User Story:** As an employee, I want my goals to remain visible and accessible throughout all stages of a cycle, so that I have consistent tracking and reporting.

#### Acceptance Criteria

1. THE Goal_Tracker SHALL maintain goal visibility across all stages within the same cycle
2. WHEN a stage changes, THE Goal_Tracker SHALL preserve all goal data including targets, achievements, and progress
3. THE Goal_Tracker SHALL enable stage-appropriate actions (edit in Planning, view-only in Locked, update achievements in Execution)
4. THE Goal_Tracker SHALL maintain goal relationships and shared goal mappings across stage transitions
5. THE Goal_Tracker SHALL preserve achievement history when transitioning between stages

### Requirement 4: Legacy System Migration

**User Story:** As a system administrator, I want to migrate from the legacy phase-based system to the new cycle-stage system, so that existing data is preserved and the architectural flaw is corrected.

#### Acceptance Criteria

1. THE Migration_Service SHALL convert existing GoalCycle records with phases to proper cycle-stage structure
2. THE Migration_Service SHALL map legacy phases (GOAL_SETTING, Q1, Q2, Q3, Q4) to appropriate cycle and stage combinations
3. THE Migration_Service SHALL preserve all existing goal data, achievements, and user relationships during migration
4. THE Migration_Service SHALL create audit log entries for all migration actions
5. IF migration fails for any record, THEN THE Migration_Service SHALL rollback changes and provide detailed error reporting

### Requirement 5: Stage-Based Access Control

**User Story:** As a user, I want different capabilities available based on the current stage, so that workflow integrity is maintained.

#### Acceptance Criteria

1. WHILE in Planning stage, THE Access_Controller SHALL allow goal creation, editing, and deletion
2. WHILE in Approval stage, THE Access_Controller SHALL allow manager approval actions and goal modifications
3. WHILE in Locked stage, THE Access_Controller SHALL prevent goal modifications except by admin unlock
4. WHILE in Execution stage, THE Access_Controller SHALL allow achievement updates and progress tracking
5. WHILE in Review stage, THE Access_Controller SHALL allow manager check-ins and final evaluations

### Requirement 6: Quarter-over-Quarter Trend Analysis

**User Story:** As an admin, I want to perform QoQ trend analysis across multiple cycles, so that I can identify performance patterns and organizational insights.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL generate QoQ reports comparing achievement scores across cycles
2. THE Analytics_Engine SHALL maintain goal mapping relationships to enable trend analysis for similar goals
3. WHEN generating QoQ reports, THE Analytics_Engine SHALL handle goal evolution and changes between cycles
4. THE Analytics_Engine SHALL provide drill-down capabilities from department to individual employee trends
5. THE Analytics_Engine SHALL export QoQ trend data in CSV and Excel formats

### Requirement 7: Stage Workflow Validation

**User Story:** As a manager, I want the system to enforce proper stage workflows, so that process integrity is maintained and errors are prevented.

#### Acceptance Criteria

1. THE Workflow_Validator SHALL prevent goal submissions outside of Planning and Approval stages
2. THE Workflow_Validator SHALL prevent achievement updates outside of Execution stage
3. THE Workflow_Validator SHALL prevent manager check-ins outside of Review stage
4. IF an invalid workflow action is attempted, THEN THE Workflow_Validator SHALL return a clear error message with the current stage and allowed actions
5. THE Workflow_Validator SHALL log all workflow violations for audit purposes

### Requirement 8: Database Schema Transformation

**User Story:** As a developer, I want a proper database schema that supports cycle-stage management, so that the system architecture is correct and maintainable.

#### Acceptance Criteria

1. THE Schema_Manager SHALL create goal_cycles table with fields: id, name, quarter, year, is_active, created_at
2. THE Schema_Manager SHALL create cycle_stages table with fields: id, cycle_id, stage_name, is_active, start_date, end_date, sequence_order
3. THE Schema_Manager SHALL modify goals table to reference cycle_id instead of legacy phase-based cycle
4. THE Schema_Manager SHALL maintain foreign key relationships and data integrity constraints
5. THE Schema_Manager SHALL provide migration scripts for seamless transition from legacy schema

### Requirement 9: Stage Notification System

**User Story:** As a user, I want to receive notifications when stages change, so that I am aware of new actions available to me.

#### Acceptance Criteria

1. WHEN a stage transitions, THE Notification_Service SHALL send emails to affected users based on their role
2. THE Notification_Service SHALL include stage-specific action items in notification content
3. THE Notification_Service SHALL send Teams notifications to managers when their team members have pending actions
4. THE Notification_Service SHALL provide deep links to relevant pages based on the current stage
5. THE Notification_Service SHALL allow users to configure notification preferences per stage type

### Requirement 10: Cycle Performance Metrics

**User Story:** As an admin, I want to track cycle performance metrics, so that I can optimize workflow timing and identify bottlenecks.

#### Acceptance Criteria

1. THE Metrics_Collector SHALL track time spent in each stage per cycle
2. THE Metrics_Collector SHALL measure goal submission rates and approval rates per stage
3. THE Metrics_Collector SHALL identify employees and managers with delayed stage transitions
4. THE Metrics_Collector SHALL generate stage performance dashboards with completion rates and timing metrics
5. THE Metrics_Collector SHALL provide alerts when stage durations exceed configured thresholds

### Requirement 11: Shared Goal Synchronization

**User Story:** As a manager, I want shared goals to maintain synchronization across all stages, so that departmental KPIs remain consistent throughout the cycle.

#### Acceptance Criteria

1. THE Shared_Goal_Manager SHALL maintain shared goal relationships across stage transitions
2. WHEN a shared goal source is updated, THE Shared_Goal_Manager SHALL propagate changes to all linked employee sheets within the same cycle
3. THE Shared_Goal_Manager SHALL preserve shared goal weightage assignments during stage transitions
4. THE Shared_Goal_Manager SHALL prevent orphaned shared goals when cycles transition between stages
5. THE Shared_Goal_Manager SHALL audit all shared goal synchronization actions

### Requirement 12: Stage-Aware Reporting

**User Story:** As an admin, I want reports that are aware of cycle stages, so that I can generate accurate analytics and compliance reports.

#### Acceptance Criteria

1. THE Report_Generator SHALL include current stage information in all goal-related reports
2. THE Report_Generator SHALL filter data based on stage-appropriate visibility rules
3. THE Report_Generator SHALL generate stage transition reports showing workflow progression
4. THE Report_Generator SHALL provide cycle completion reports with stage-by-stage breakdown
5. THE Report_Generator SHALL export stage-aware data for external analytics tools

### Requirement 13: Configuration Parser and Validator

**User Story:** As a system administrator, I want to parse and validate cycle-stage configurations, so that system setup is correct and follows enterprise patterns.

#### Acceptance Criteria

1. THE Configuration_Parser SHALL parse cycle configuration files with stage definitions and timing rules
2. THE Configuration_Parser SHALL validate stage sequences and ensure no gaps or overlaps in timing
3. IF configuration is invalid, THEN THE Configuration_Parser SHALL return detailed validation errors with suggested corrections
4. THE Configuration_Parser SHALL support configuration templates for common enterprise patterns (quarterly, semi-annual, annual cycles)
5. THE Configuration_Parser SHALL validate that stage names follow enterprise naming conventions

### Requirement 14: Stage Transition Audit Trail

**User Story:** As a compliance officer, I want complete audit trails of stage transitions, so that I can verify workflow compliance and investigate issues.

#### Acceptance Criteria

1. THE Audit_Logger SHALL record all stage transition events with timestamp, initiating user, and reason
2. THE Audit_Logger SHALL capture before and after state for each stage transition
3. THE Audit_Logger SHALL log all goal modifications that occur during stage transitions
4. THE Audit_Logger SHALL provide immutable audit records that cannot be modified after creation
5. THE Audit_Logger SHALL generate audit reports filtered by cycle, stage, user, and date range

### Requirement 15: Cycle Archive and Retention

**User Story:** As an admin, I want to archive completed cycles while maintaining data integrity, so that system performance is optimized and historical data is preserved.

#### Acceptance Criteria

1. WHEN a cycle completes all stages, THE Archive_Manager SHALL mark the cycle as completed and eligible for archival
2. THE Archive_Manager SHALL maintain read-only access to archived cycle data for reporting and compliance
3. THE Archive_Manager SHALL compress archived cycle data to optimize storage while preserving data integrity
4. THE Archive_Manager SHALL provide restoration capabilities for archived cycles when needed for audits
5. THE Archive_Manager SHALL enforce retention policies and automatically archive cycles based on configured rules