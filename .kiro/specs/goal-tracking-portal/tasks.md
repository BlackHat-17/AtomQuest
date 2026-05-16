# Implementation Tasks — Goal Setting & Tracking Portal

## Overview

Tasks are ordered by dependency. Complete foundational tasks (1–3) before moving to feature tasks (4–9). All phases including SSO, notifications, escalation, and analytics are required.

---

## Phase 0 — Project Setup

- [x] 1. Initialize project structure
  - [x] 1.1 Create monorepo with `/frontend` (React + Vite + TypeScript) and `/backend` (Node.js + Express + TypeScript) directories
  - [x] 1.2 Configure ESLint, Prettier, and TypeScript strict mode for both packages
  - [x] 1.3 Set up Prisma with PostgreSQL connection and initial schema migration
  - [x] 1.4 Configure environment variable management (.env files, validation with zod)
  - [x] 1.5 Set up TailwindCSS and shadcn/ui in the frontend
  - [x] 1.6 Create Docker Compose file for local PostgreSQL and Redis

- [x] 2. Database schema and seed data
  - [x] 2.1 Implement Prisma schema: User, GoalCycle, GoalSheet, Goal, Achievement, CheckIn, AuditLog, SharedGoal
  - [x] 2.2 Write and run initial migration
  - [x] 2.3 Create seed script with 3 demo users (Employee, Manager, Admin), org hierarchy, and an active GoalCycle
  - [x] 2.4 Verify all foreign key constraints and enum types are correct

- [x] 3. Authentication & authorization
  - [x] 3.1 Implement JWT-based login endpoint (POST /api/auth/login)
  - [x] 3.2 Implement JWT refresh token endpoint
  - [x] 3.3 Create authenticate middleware (verify JWT, attach req.user)
  - [x] 3.4 Create authorize middleware (role-based guard: EMPLOYEE, MANAGER, ADMIN)
  - [x] 3.5 Build login page in frontend with role-aware redirect after login
  - [x] 3.6 Implement protected route wrapper in React (redirect to login if unauthenticated)

---

## Phase 1 — Goal Creation & Approval

- [x] 4. Goal sheet CRUD (Employee)
  - [x] 4.1 Implement POST /api/goals — create a new goal on a sheet
  - [x] 4.2 Implement GET /api/goals/:sheetId — fetch full goal sheet with goals
  - [x] 4.3 Implement PUT /api/goals/:goalId — update a goal (blocked if locked)
  - [x] 4.4 Implement DELETE /api/goals/:goalId — delete a goal (blocked if locked)
  - [x] 4.5 Implement server-side validation: max 8 goals, min 10% weightage, total = 100%
  - [x] 4.6 Build GoalForm component: Thrust Area selector, Title, Description, UoM Type, Target, Weightage inputs
  - [x] 4.7 Build WeightageBar component showing real-time total and per-goal breakdown
  - [x] 4.8 Build Employee Goal Sheet page with add/edit/delete goal actions and live validation feedback

- [x] 5. Goal submission and approval workflow
  - [x] 5.1 Implement POST /api/goals/:sheetId/submit — validate and change status to SUBMITTED
  - [x] 5.2 Implement POST /api/goals/:sheetId/approve — lock all goals, record approver and timestamp
  - [x] 5.3 Implement POST /api/goals/:sheetId/rework — return sheet with mandatory comment
  - [x] 5.4 Build Manager Team Dashboard page listing direct reports with submission status badges
  - [x] 5.5 Build Manager Approval page with inline editable Target and Weightage fields
  - [x] 5.6 Add Approve and Return for Rework buttons with confirmation dialogs
  - [x] 5.7 Display rework comment to employee on their goal sheet page

- [x] 6. Shared Goals (KPI push)
  - [x] 6.1 Implement POST /api/shared-goals/push — create SharedGoal records for selected employees
  - [x] 6.2 Implement PUT /api/shared-goals/:id/weightage — employee adjusts weightage only
  - [x] 6.3 Ensure shared goal Title and Target are read-only in employee view
  - [x] 6.4 Build Push KPI modal for manager/admin: select source goal, select target employees
  - [x] 6.5 Display shared goal badge/indicator on employee goal sheet

---

## Phase 2 — Achievement Tracking & Check-ins

- [x] 7. Quarterly achievement updates (Employee)
  - [x] 7.1 Implement PUT /api/achievements/:goalId/:quarter — upsert actual value, compute score
  - [x] 7.2 Implement GET /api/achievements/:sheetId — fetch all achievements for a sheet
  - [x] 7.3 Implement computeScore() for all 4 UoM types (NUMERIC_MIN, NUMERIC_MAX, TIMELINE, ZERO)
  - [x] 7.4 Enforce quarterly window check server-side (reject if window not active)
  - [x] 7.5 Build Achievement Update page: per-goal actual input, status selector, computed score display
  - [x] 7.6 Implement shared goal achievement sync (update linked employee sheets on primary owner update)
  - [x] 7.7 Write property-based tests for computeScore() covering all UoM types and edge cases

- [x] 8. Manager check-in module
  - [x] 8.1 Implement POST /api/checkins — create or update check-in with manager comment
  - [x] 8.2 Implement GET /api/checkins/:sheetId — fetch check-in history
  - [x] 8.3 Build Manager Check-in page: Planned vs. Actual table per employee, progress score column
  - [x] 8.4 Add structured comment input (required to mark check-in complete)
  - [x] 8.5 Show check-in completion status per employee on Manager Dashboard

---

## Phase 3 — Reporting & Governance

- [x] 9. Reports and audit trail
  - [x] 9.1 Implement GET /api/reports/achievement — query all goal sheets with achievements, return structured data
  - [x] 9.2 Implement generateAchievementReport() — produce Excel workbook using exceljs
  - [x] 9.3 Add CSV export option alongside Excel
  - [x] 9.4 Implement GET /api/reports/completion — aggregate check-in completion rates by department/manager
  - [x] 9.5 Implement auditLog middleware — capture pre/post values for all post-lock goal mutations
  - [x] 9.6 Implement GET /api/reports/audit — paginated, filterable audit log endpoint
  - [x] 9.7 Build Admin Reports page: export buttons (CSV/Excel), filter controls (cycle, department, manager)
  - [x] 9.8 Build Completion Dashboard page: table/chart of completion rates with drill-down
  - [x] 9.9 Build Audit Log page: paginated table with filters for date, user, entity type

---

## Phase 4 — Admin & Cycle Management

- [-] 10. Admin portal
  - [x] 10.1 Implement POST/PUT /api/admin/cycles — create and update goal cycles with phase and window dates
  - [x] 10.2 Implement GET/PUT /api/admin/users — list users and update roles/manager assignments
  - [ ] 10.3 Implement POST /api/goals/:goalId/unlock — admin unlock with mandatory reason, write audit log
  - [ ] 10.4 Build Admin Cycle Management page: create/edit cycles, activate/deactivate
  - [ ] 10.5 Build Admin User Management page: view org hierarchy, reassign managers, change roles
  - [ ] 10.6 Build Goal Unlock modal: search for locked goal, enter reason, confirm unlock

---

## Phase 5 — Extended Features

- [ ] 11. Microsoft Entra ID (Azure AD) SSO
  - [ ] 11.1 Register app in Azure AD, configure redirect URIs and API permissions
  - [ ] 11.2 Add MSAL.js to frontend for SSO login flow with silent token refresh
  - [ ] 11.3 Add passport-azure-ad to backend to validate Azure AD tokens
  - [ ] 11.4 Map Azure AD group membership to portal roles (EMPLOYEE / MANAGER / ADMIN) on first login
  - [ ] 11.5 Sync manager attribute from Azure AD user profile to populate org hierarchy automatically
  - [ ] 11.6 Fall back to local JWT login when Azure AD is unavailable (demo mode)

- [ ] 12. Email & Microsoft Teams notifications
  - [ ] 12.1 Set up nodemailer (or SendGrid) for transactional emails with HTML templates
  - [ ] 12.2 Send email on: goal submission, approval, rework return, and quarterly check-in reminders
  - [ ] 12.3 Implement Teams Incoming Webhook or Adaptive Card for manager notifications when a team member submits or updates goals
  - [ ] 12.4 Add deep-link URLs in all notifications pointing directly to the relevant goal sheet
  - [ ] 12.5 Add GET /api/admin/notifications/config endpoint for admin to configure SMTP and Teams webhook settings

- [ ] 13. Escalation module
  - [ ] 13.1 Add EscalationRule model to Prisma schema: trigger type, threshold days, escalation chain (employee → manager → skip-level/HR)
  - [ ] 13.2 Build Escalation Rule configuration UI in Admin portal: create/edit rules, set N-day thresholds per trigger type
  - [ ] 13.3 Implement scheduled job (node-cron, daily at midnight) to evaluate all active escalation rules
  - [ ] 13.4 Trigger conditions to evaluate: goal not submitted within N days of cycle open; manager not approved within N days of submission; check-in not completed within active window
  - [ ] 13.5 Send escalation notifications in sequence: employee first, then manager after next interval, then skip-level/HR
  - [ ] 13.6 Add EscalationLog model and POST /api/admin/escalations endpoint; build Escalation Log page for Admin/HR with filter by status and rule type

- [ ] 14. Analytics module
  - [ ] 14.1 Implement QoQ achievement trend queries aggregated at individual, team, and department levels
  - [ ] 14.2 Build trend line/bar charts using Recharts showing achievement scores across Q1–Q4
  - [ ] 14.3 Build completion heatmap (department × quarter grid) showing check-in completion rates
  - [ ] 14.4 Build goal distribution breakdown charts: by Thrust Area, UoM type, and goal status
  - [ ] 14.5 Build Manager Effectiveness dashboard: table comparing check-in completion rates across all L1 managers
  - [ ] 14.6 Add GET /api/analytics/* endpoints for all chart data with cycle and department filter params

---

## Phase 6 — Testing & Deployment

- [ ] 15. Testing
  - [ ] 15.1 Write unit tests for all validation functions (weightage rules, goal count)
  - [ ] 15.2 Write property-based tests for computeScore() using fast-check
  - [ ] 15.3 Write integration tests for goal submission → approval → lock flow
  - [ ] 15.4 Write integration tests for quarterly window enforcement
  - [ ] 15.5 Write integration tests for shared goal achievement sync
  - [ ] 15.6 Write E2E tests (Playwright) for Employee, Manager, and Admin user journeys

- [ ] 16. Deployment & documentation
  - [ ] 16.1 Deploy backend to Railway (or Render) with PostgreSQL and Redis add-ons
  - [ ] 16.2 Deploy frontend to Vercel with environment variables configured
  - [ ] 16.3 Run seed script on production DB to create demo accounts
  - [ ] 16.4 Write architecture diagram (draw.io or Excalidraw) and export as PDF
  - [ ] 16.5 Document demo login credentials and user journey steps in README
