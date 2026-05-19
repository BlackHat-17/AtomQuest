import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import GoalSheetPage from './pages/employee/GoalSheetPage';
import AchievementPage from './pages/employee/AchievementPage';
import TeamDashboardPage from './pages/manager/TeamDashboardPage';
import ApprovalPage from './pages/manager/ApprovalPage';
import CheckInPage from './pages/manager/CheckInPage';
import ReportsPage from './pages/admin/ReportsPage';
import CompletionDashboardPage from './pages/admin/CompletionDashboardPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import CycleManagementPage from './pages/admin/CycleManagementPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import EscalationRulesPage from './pages/admin/EscalationRulesPage';
import EscalationLogPage from './pages/admin/EscalationLogPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import ProfilePage from './pages/ProfilePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes — no layout */}
        <Route path="/login" element={<LoginPage />} />

        {/* All authenticated routes wrapped in AppLayout */}
        <Route element={<AppLayout />}>
          {/* Dashboard — accessible by all authenticated roles */}
          <Route element={<ProtectedRoute allowedRoles={['EMPLOYEE', 'MANAGER', 'ADMIN']} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          {/* Employee routes — also accessible by MANAGER and ADMIN for their own goals */}
          <Route element={<ProtectedRoute allowedRoles={['EMPLOYEE', 'MANAGER', 'ADMIN']} />}>
            <Route path="/employee/goals" element={<GoalSheetPage />} />
            <Route path="/employee/achievements" element={<AchievementPage />} />
            <Route path="/employee/*" element={<Navigate to="/employee/goals" replace />} />
          </Route>

          {/* Manager routes */}
          <Route element={<ProtectedRoute allowedRoles={['MANAGER']} />}>
            <Route path="/manager/team" element={<TeamDashboardPage />} />
            <Route path="/manager/approval/:sheetId" element={<ApprovalPage />} />
            <Route path="/manager/checkin/:sheetId" element={<CheckInPage />} />
            <Route path="/manager/dashboard" element={<Navigate to="/manager/team" replace />} />
            <Route path="/manager/*" element={<Navigate to="/manager/team" replace />} />
          </Route>

          {/* Admin routes */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/reports" element={<ReportsPage />} />
            <Route path="/admin/completion" element={<CompletionDashboardPage />} />
            <Route path="/admin/audit" element={<AuditLogPage />} />
            <Route path="/admin/cycles" element={<CycleManagementPage />} />
            <Route path="/admin/users" element={<UserManagementPage />} />
            <Route path="/admin/escalation-rules" element={<EscalationRulesPage />} />
            <Route path="/admin/escalation-logs" element={<EscalationLogPage />} />
            <Route path="/admin/analytics" element={<AnalyticsPage />} />
            <Route path="/admin/*" element={<Navigate to="/admin/reports" replace />} />
          </Route>
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 404 */}
        <Route path="*" element={
          <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="text-center">
              <p className="text-6xl font-bold text-gray-200">404</p>
              <p className="mt-2 text-lg font-medium text-gray-600">Page not found</p>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
