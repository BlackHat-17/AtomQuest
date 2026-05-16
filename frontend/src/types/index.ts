// ─── Enums ────────────────────────────────────────────────────────────────────

export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';

export type Phase = 'GOAL_SETTING' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type SheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REWORK' | 'LOCKED';

export type UomType = 'NUMERIC_MIN' | 'NUMERIC_MAX' | 'TIMELINE' | 'ZERO';

export type GoalStatus = 'NOT_STARTED' | 'ON_TRACK' | 'COMPLETED';

export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type ThrustArea =
  | 'Revenue'
  | 'Cost'
  | 'Quality'
  | 'Delivery'
  | 'Safety'
  | 'People'
  | 'Innovation'
  | 'Customer';

// ─── Models ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId: string | null;
  department: string;
  azureAdId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalCycle {
  id: string;
  year: number;
  phase: Phase;
  windowOpen: string;
  windowClose: string;
  isActive: boolean;
  createdById: string;
  createdAt: string;
}

export interface GoalSheet {
  id: string;
  employeeId: string;
  cycleId: string;
  cycle?: GoalCycle;
  status: SheetStatus;
  reworkComment: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
  goals: Goal[];
}

export interface Goal {
  id: string;
  goalSheetId: string;
  thrustArea: ThrustArea;
  title: string;
  description: string;
  uomType: UomType;
  target: string;
  weightage: number;
  status: GoalStatus;
  isShared: boolean;
  sharedFromId: string | null;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Achievement {
  id: string;
  goalId: string;
  quarter: Quarter;
  actual: string;
  score: number;
  updatedAt: string;
  updatedById: string;
}

export interface CheckIn {
  id: string;
  goalSheetId: string;
  quarter: Quarter;
  managerId: string;
  comment: string;
  completedAt: string;
  manager?: { id: string; name: string; email: string };
}

// ─── Form types ───────────────────────────────────────────────────────────────

export interface GoalFormData {
  goalSheetId: string;
  thrustArea: ThrustArea;
  title: string;
  description: string;
  uomType: UomType;
  target: string;
  weightage: number;
}
