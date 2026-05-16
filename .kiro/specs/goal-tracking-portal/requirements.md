# Requirements — Goal Setting & Tracking Portal

## Introduction

This document captures the functional and non-functional requirements for the Goal Setting & Tracking Portal, derived from the ATOMQUEST Hackathon 1.0 problem statement and the technical design.

---

## User Stories

### Role: Employee

**US-E1 — Create Goal Sheet**
As an employee, I want to create a goal sheet for the active cycle so that I can define my objectives for the year.

Acceptance Criteria:
- I can add up to 8 goals per cycle
- Each goal requires: Thrust Area, Title, Description, UoM Type, Target, and Weightage
- UoM Type options are: Numeric (Min), Numeric (Max), Timeline, Zero
- I cannot save/submit if any goal has weightage below 10%
- I cannot save/submit if total weightage does not equal 100%
- I cannot add more than 8 goals; the system blocks the action with a clear error

**US-E2 — Submit Goal Sheet**
As an employee, I want to submit my goal sheet to my manager for approval so that my goals can be reviewed and locked.

Acceptance Criteria:
- Submit button is only enabled when all validation rules pass
- On submission, sheet status changes to SUBMITTED
- I can no longer edit goals once submitted (unless returned for rework)
- I receive confirmation that submission was successful

**US-E3 — Rework Goal Sheet**
As an employee, I want to revise my goal sheet when my manager returns it for rework so that I can address their feedback.

Acceptance Criteria:
- When sheet status is REWORK, I can edit goals and resubmit
- Manager's rework comment is visible to me
- After resubmission, status returns to SUBMITTED

**US-E4 — View Locked Goals**
As an employee, I want to view my approved and locked goals so that I have a clear reference for the year.

Acceptance Criteria:
- Locked goals are displayed in read-only mode
- All goal details including target and weightage are visible
- Lock status is clearly indicated in the UI

**US-E5 — Log Quarterly Achievement**
As an employee, I want to enter my actual achievement for each goal each quarter so that my progress is tracked.

Acceptance Criteria:
- Achievement input is only available during the active quarterly window
- I can enter actual values for each goal (numeric or date depending on UoM)
- I can set goal status: Not Started / On Track / Completed
- System computes and displays the progress score automatically
- I can update my achievement multiple times within the open window

**US-E6 — View Shared Goals**
As an employee, I want to see goals pushed to me by my manager or admin so that I am aware of departmental KPIs assigned to me.

Acceptance Criteria:
- Shared goals appear in my goal sheet with Title and Target read-only
- I can adjust the weightage of shared goals within the 10%–100% range
- Total weightage including shared goals must still equal 100%
- Achievement for shared goals is synced from the primary owner automatically

---

### Role: Manager (L1)

**US-M1 — View Team Goal Sheets**
As a manager, I want to see all goal sheets submitted by my direct reports so that I can review and act on them.

Acceptance Criteria:
- Dashboard shows all direct reports with their submission status
- I can click into any employee's goal sheet
- Status indicators show: Not Submitted / Submitted / Approved / Rework

**US-M2 — Approve Goal Sheet**
As a manager, I want to approve an employee's goal sheet so that their goals are locked and the cycle can proceed.

Acceptance Criteria:
- I can approve a sheet only when it is in SUBMITTED status
- On approval, all goals in the sheet are locked
- Employee is notified of approval
- Approved date and approver name are recorded

**US-M3 — Edit Goals During Approval**
As a manager, I want to edit goal targets and weightages inline before approving so that I can make corrections without returning the sheet.

Acceptance Criteria:
- I can edit Target and Weightage fields inline on the approval screen
- Validation rules (100% total, min 10%, max 8 goals) apply to my edits
- I cannot change Goal Title or Thrust Area
- Edits are saved only when I click Approve

**US-M4 — Return Goal Sheet for Rework**
As a manager, I want to return a goal sheet to the employee with comments so that they can revise it.

Acceptance Criteria:
- I can add a mandatory comment when returning for rework
- Sheet status changes to REWORK
- Employee is notified with the comment

**US-M5 — Conduct Quarterly Check-in**
As a manager, I want to review each team member's planned vs. actual achievement each quarter and add a structured comment so that the discussion is documented.

Acceptance Criteria:
- Check-in view shows Planned Target vs. Actual Achievement per goal
- Computed progress score is displayed per goal
- I can add a check-in comment (required to mark check-in complete)
- Check-in is timestamped and attributed to me
- I can only complete check-ins during the active quarterly window

**US-M6 — Push Shared Goal (KPI)**
As a manager, I want to push a departmental KPI to one or more employees so that team-wide objectives are reflected in individual goal sheets.

Acceptance Criteria:
- I can select a goal and choose target employees
- The goal appears in each selected employee's sheet with Title and Target locked
- Employees can only adjust the weightage
- Achievement entered by the primary owner syncs to all linked sheets

---

### Role: Admin / HR

**US-A1 — Manage Goal Cycles**
As an admin, I want to configure goal cycles (open/close dates per phase) so that the system enforces the correct windows.

Acceptance Criteria:
- I can create, edit, and activate/deactivate cycles
- Each cycle has a phase (Goal Setting, Q1, Q2, Q3, Q4) and open/close dates
- Only one cycle per phase can be active at a time
- Changes to active cycles are logged in the audit trail

**US-A2 — Manage Org Hierarchy**
As an admin, I want to manage the reporting structure (employee → manager mapping) so that approval workflows route correctly.

Acceptance Criteria:
- I can assign or change a manager for any employee
- Changes take effect immediately for new submissions
- In-flight approvals are not disrupted by hierarchy changes

**US-A3 — Unlock a Goal**
As an admin, I want to unlock a specific goal after it has been locked so that corrections can be made in exceptional cases.

Acceptance Criteria:
- I can unlock any locked goal with a mandatory reason
- The unlock action is recorded in the audit log (who, when, reason)
- After unlock, the employee can edit the goal and resubmit for approval

**US-A4 — View Completion Dashboard**
As an admin, I want to see a real-time dashboard of which employees and managers have completed their goal submissions and quarterly check-ins so that I can track overall compliance.

Acceptance Criteria:
- Dashboard shows completion rates by department and manager
- Drill-down to individual employee status is available
- Data refreshes in real time (or near real time)

**US-A5 — Export Achievement Report**
As an admin, I want to export a report of all employees' planned targets vs. actual achievements so that I can use it for appraisal and HR analysis.

Acceptance Criteria:
- Export is available in CSV and Excel formats
- Report includes: Employee, Department, Goal Title, Thrust Area, UoM, Target, Weightage, Q1–Q4 Actuals, Final Score
- I can filter by cycle, department, or manager before exporting

**US-A6 — View Audit Log**
As an admin, I want to see a log of all changes made to goals after the lock date so that I have a complete audit trail.

Acceptance Criteria:
- Log shows: Entity, Field Changed, Old Value, New Value, Changed By, Timestamp
- Log is filterable by date range, user, and entity type
- Log is read-only and cannot be deleted

---

### Role: Employee / Manager — SSO & Notifications

**US-SSO1 — Single Sign-On via Azure AD**
As an employee or manager, I want to log in using my Microsoft work account so that I don't need a separate password for the portal.

Acceptance Criteria:
- A "Sign in with Microsoft" button is available on the login page
- Successful Azure AD authentication creates or updates my portal account automatically
- My role is assigned based on my Azure AD group membership
- My manager is populated from my Azure AD profile attributes
- If Azure AD is unavailable, local JWT login remains available as a fallback

**US-SSO2 — Org Hierarchy Sync**
As an admin, I want the reporting structure to be automatically derived from Azure AD so that I don't have to manually maintain manager assignments.

Acceptance Criteria:
- On first SSO login, the system reads the user's manager attribute from Azure AD
- Manager assignments in the portal reflect the Azure AD hierarchy
- Admin can override individual assignments when needed

**US-N1 — Email Notifications**
As an employee or manager, I want to receive email notifications for key workflow events so that I am always aware of actions required from me.

Acceptance Criteria:
- Employee receives email when: goal sheet is approved, returned for rework, or a check-in reminder is due
- Manager receives email when: a team member submits a goal sheet or updates quarterly achievement
- Emails contain a deep-link to the relevant goal sheet in the portal
- Admin can configure SMTP settings from the admin portal

**US-N2 — Microsoft Teams Notifications**
As a manager, I want to receive Teams notifications when a team member submits or updates goals so that I can act without switching to email.

Acceptance Criteria:
- An Adaptive Card is posted to the manager's configured Teams channel on goal submission and achievement update
- The card includes employee name, action taken, and a deep-link to the goal sheet
- Admin can configure the Teams webhook URL from the admin portal

---

### Role: Admin / HR — Escalation & Analytics

**US-ESC1 — Configure Escalation Rules**
As an admin, I want to define escalation rules with configurable thresholds so that overdue actions are automatically flagged and notified.

Acceptance Criteria:
- I can create rules for three trigger types: goal not submitted N days after cycle open; manager not approved N days after submission; check-in not completed within the active window
- Each rule has a configurable N-day threshold and an escalation chain (employee → manager → skip-level/HR)
- Rules can be enabled or disabled without deleting them

**US-ESC2 — Automatic Escalation Notifications**
As an admin, I want the system to automatically send escalation notifications when rules are triggered so that no action falls through the cracks.

Acceptance Criteria:
- A daily scheduled job evaluates all active escalation rules
- Notifications are sent in sequence: employee first, then manager after the next interval, then skip-level/HR
- Each escalation event is logged with timestamp, rule triggered, and recipient

**US-ESC3 — View Escalation Log**
As an admin or HR, I want to see a log of all escalation events so that I can track resolution and identify patterns.

Acceptance Criteria:
- Log shows: rule triggered, employee affected, notification sent to, timestamp, and current status
- Log is filterable by rule type, department, and date range
- Log is read-only

**US-AN1 — QoQ Achievement Trends**
As an admin or HR, I want to see quarter-on-quarter achievement trends at individual, team, and department levels so that I can identify performance patterns over time.

Acceptance Criteria:
- Charts show achievement scores for Q1–Q4 per employee, team, and department
- I can filter by cycle year, department, and manager
- Data is exportable alongside the chart view

**US-AN2 — Completion Heatmap**
As an admin, I want to see a heatmap of check-in completion rates across departments and quarters so that I can spot compliance gaps at a glance.

Acceptance Criteria:
- Heatmap grid shows department (rows) × quarter (columns) with colour-coded completion rates
- Clicking a cell drills down to the list of employees in that department/quarter

**US-AN3 — Goal Distribution Analysis**
As an admin, I want to see how goals are distributed by Thrust Area, UoM type, and status so that I can understand organisational focus areas.

Acceptance Criteria:
- Breakdown charts show goal counts and weightage by Thrust Area, UoM type, and current status
- Filterable by cycle and department

**US-AN4 — Manager Effectiveness Dashboard**
As an admin or HR, I want to compare check-in completion rates across all L1 managers so that I can identify managers who need support.

Acceptance Criteria:
- Table or bar chart ranks managers by check-in completion rate
- Shows number of direct reports, completed check-ins, and pending check-ins per manager
- Filterable by quarter and department

---

## Non-Functional Requirements

**NFR-1 — Validation Enforcement**
All weightage validation rules (total = 100%, min 10% per goal, max 8 goals) must be enforced both client-side (for UX) and server-side (for integrity).

**NFR-2 — Goal Lock Integrity**
Goal lock state must be enforced server-side. A locked goal cannot be modified via any API call without an explicit admin unlock action.

**NFR-3 — Window Enforcement**
Achievement updates and check-in submissions must be rejected by the server if the corresponding quarterly window is not active.

**NFR-4 — Audit Completeness**
Every change to a goal or achievement after the lock date must be captured in the audit log with full before/after values.

**NFR-5 — Role-Based Access**
All API endpoints must enforce role-based access control. Employees cannot access manager or admin endpoints, and vice versa.

**NFR-6 — Performance**
Page load time for the employee goal sheet and manager team dashboard must be under 2 seconds for up to 500 concurrent users.

**NFR-7 — Export Reliability**
Achievement report export must complete within 10 seconds for up to 1,000 employee records.

**NFR-8 — Accessibility**
UI must meet WCAG 2.1 AA standards for keyboard navigation and screen reader compatibility.

---

## Correctness Properties (for Property-Based Testing)

**P1 — Weightage Invariant**
For any submitted or approved goal sheet, the sum of all goal weightages must equal exactly 100.0 (±0.01 tolerance for floating point).

**P2 — Minimum Weightage**
For any goal in any submitted or approved sheet, weightage ≥ 10.0.

**P3 — Goal Count Bound**
For any goal sheet, the number of goals must be in the range [1, 8].

**P4 — Score Monotonicity (NUMERIC_MIN)**
For NUMERIC_MIN goals, if actual₂ > actual₁ and target is constant, then score₂ ≥ score₁.

**P5 — Score Monotonicity (NUMERIC_MAX)**
For NUMERIC_MAX goals, if actual₂ < actual₁ and target is constant, then score₂ ≥ score₁.

**P6 — Zero Goal Binary**
For ZERO UoM goals, score is exactly 1.0 when actual = 0, and exactly 0.0 when actual > 0.

**P7 — Lock Immutability**
A locked goal cannot be modified without a preceding admin unlock action recorded in the audit log.

**P8 — Shared Goal Sync**
When the primary owner updates achievement for a shared goal, all linked employee sheets reflect the same actual value and score within the same transaction.

**P9 — Window Guard**
Achievement updates submitted outside the active quarterly window must be rejected with a 400 error.

**P10 — Approval Idempotency**
Approving an already-approved goal sheet must return an error, not create a duplicate lock event.
