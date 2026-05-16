import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/auth/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import TeamDashboardPage from './pages/manager/TeamDashboardPage';
import ApprovalPage from './pages/manager/ApprovalPage';
import CheckInPage from './pages/manager/CheckInPage';
import AchievementPage from './pages/employee/AchievementPage';
import ReportsPage from './pages/admin/ReportsPage';
import CompletionDashboardPage from './pages/admin/CompletionDashboardPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import CycleManagementPage from './pages/admin/CycleManagementPage';
import UserManagementPage from './pages/admin/UserManagementPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Employee routes — EMPLOYEE role only */}
        <Route element={<ProtectedRoute allowedRoles={['EMPLOYEE']} />}>
          <Route path="/employee/achievements" element={<AchievementPage />} />
          <Route path="/employee/*" element={<div>Employee Portal (coming soon)</div>} />
        </Route>

        {/* Manager routes — MANAGER role only */}
        <Route element={<ProtectedRoute allowedRoles={['MANAGER']} />}>
          <Route path="/manager/team" element={<TeamDashboardPage />} />
          <Route path="/manager/approval/:sheetId" element={<ApprovalPage />} />
          <Route path="/manager/checkin/:sheetId" element={<CheckInPage />} />
          <Route path="/manager/*" element={<Navigate to="/manager/team" replace />} />
        </Route>

        {/* Admin routes — ADMIN role only */}
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="/admin/reports" element={<ReportsPage />} />
          <Route path="/admin/completion" element={<CompletionDashboardPage />} />
          <Route path="/admin/audit" element={<AuditLogPage />} />
          <Route path="/admin/cycles" element={<CycleManagementPage />} />
          <Route path="/admin/users" element={<UserManagementPage />} />
          <Route path="/admin/*" element={<Navigate to="/admin/reports" replace />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 404 */}
        <Route path="*" element={<div>404 — Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
