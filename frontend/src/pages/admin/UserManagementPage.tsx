import { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';
import type { Role } from '../../types';

interface UserWithManager {
  id: string; name: string; email: string; role: Role; department: string;
  managerId: string | null; managerName: string | null; managerEmail: string | null;
  azureAdId: string | null; createdAt: string; updatedAt: string;
}

const ROLES: Role[] = ['EMPLOYEE', 'MANAGER', 'ADMIN'];

const ROLE_BADGE: Record<Role, string> = {
  EMPLOYEE: 'bg-blue-100 text-blue-700 border-blue-300',
  MANAGER: 'bg-[#2d1238]/10 text-[#2d1238] border-[#2d1238]/30',
  ADMIN: 'bg-red-100 text-red-700 border-red-300',
};

// ─── Edit Role Modal ──────────────────────────────────────────────────────────

interface EditRoleModalProps { open: boolean; onClose: () => void; onSuccess: () => void; user: UserWithManager | null; managers: UserWithManager[]; }

function EditRoleModal({ open, onClose, onSuccess, user, managers }: EditRoleModalProps) {
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [managerId, setManagerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) { setRole(user.role); setManagerId(user.managerId ?? ''); }
    setError(null);
  }, [user, open]);

  if (!open || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await api.put(`/admin/users/${user.id}/role`, { role, managerId: managerId || null });
      onSuccess(); onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update user');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 motion-safe:animate-fade-in" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl motion-safe:animate-scale-in">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Edit Role</h2>
        <p className="mb-4 text-sm text-gray-500">{user.name} — {user.email}</p>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25]">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Manager</label>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25]">
              <option value="">— No manager —</option>
              {managers.filter(m => m.id !== user.id).map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-[#1f0c25] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d1238] disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Org tree builder ─────────────────────────────────────────────────────────

interface OrgNode extends UserWithManager { depth: number; }

function buildOrgTree(users: UserWithManager[]): OrgNode[] {
  const byId = new Map(users.map(u => [u.id, u]));
  const childrenOf = new Map<string | null, UserWithManager[]>();
  for (const u of users) {
    const parentId = u.managerId && byId.has(u.managerId) ? u.managerId : null;
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(u);
  }
  const result: OrgNode[] = [];
  function visit(parentId: string | null, depth: number) {
    const children = childrenOf.get(parentId) ?? [];
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      result.push({ ...child, depth });
      visit(child.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function UserManagementPage() {
  const [users, setUsers] = useState<UserWithManager[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithManager | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'hierarchy'>('table');

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      if (deptFilter) params.department = deptFilter;
      const { data } = await api.get<UserWithManager[]>('/admin/users', { params });
      setUsers(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load users');
    } finally { setLoading(false); }
  }, [roleFilter, deptFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const departments = Array.from(new Set(users.map(u => u.department))).sort();
  const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN');
  const orgTree = buildOrgTree(users);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">Manage roles, manager assignments, and org hierarchy.</p>
        </div>
        <div className="flex items-center gap-2">
          {(['table', 'hierarchy'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === mode ? 'border-[#1f0c25] bg-[#1f0c25] text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-gray-600">Role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Department</label>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button onClick={() => { setRoleFilter(''); setDeptFilter(''); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Clear</button>
      </div>

      {success && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Email', 'Department', 'Role', 'Manager', 'Actions'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {(viewMode === 'table' ? users : orgTree).map((user) => {
                  const node = user as OrgNode;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                        {viewMode === 'hierarchy' && node.depth > 0 ? (
                          <span style={{ paddingLeft: `${node.depth * 20}px` }} className="flex items-center gap-1">
                            <span className="text-gray-400 text-xs">└</span>
                            {user.name}
                          </span>
                        ) : user.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{user.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{user.department}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE[user.role]}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{user.managerName ?? <span className="text-gray-400">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          onClick={() => { setEditingUser(user); setModalOpen(true); }}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Edit Role
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EditRoleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={async () => { setSuccess('User updated successfully.'); await fetchUsers(); }}
        user={editingUser}
        managers={managers}
      />
    </div>
  );
}

export default UserManagementPage;
