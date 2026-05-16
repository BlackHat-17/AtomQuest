import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import type { SheetStatus } from '../../types';
import { PushKpiModal } from '../../components/PushKpiModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMemberSheet {
  id: string;
  status: SheetStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  reworkComment: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  goalSheet: TeamMemberSheet | null;
  checkInStatus: 'DONE' | 'PENDING';
}

interface TeamResponse {
  cycle: { id: string; year: number; phase: string } | null;
  activeQuarter: string | null;
  team: TeamMember[];
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  SheetStatus | 'NOT_SUBMITTED',
  { label: string; className: string }
> = {
  NOT_SUBMITTED: {
    label: 'Not Submitted',
    className: 'bg-gray-100 text-gray-600 border-gray-300',
  },
  DRAFT: {
    label: 'Draft',
    className: 'bg-gray-100 text-gray-600 border-gray-300',
  },
  SUBMITTED: {
    label: 'Submitted',
    className: 'bg-blue-100 text-blue-700 border-blue-300',
  },
  APPROVED: {
    label: 'Approved',
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  LOCKED: {
    label: 'Locked / Approved',
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  REWORK: {
    label: 'Rework',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushKpiOpen, setPushKpiOpen] = useState(false);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: response } = await api.get<TeamResponse>('/manager/team');
      setData(response);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load team data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading team dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading team data</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={fetchTeam}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const team = data?.team ?? [];
  const cycle = data?.cycle;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Team Dashboard</h1>
            {cycle && (
              <p className="mt-1 text-sm text-gray-500">
                Active cycle: {cycle.year} — {cycle.phase.replace('_', ' ')}
              </p>
            )}
          </div>
          <button
            onClick={() => setPushKpiOpen(true)}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            Push KPI
          </button>
        </div>
      </div>

      {team.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
          <p className="text-sm">No direct reports found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Employee Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Sheet Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Submitted At
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Check-in Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {team.map((member) => {
                  const sheetStatus = member.goalSheet?.status ?? 'NOT_SUBMITTED';
                  const badge =
                    STATUS_BADGE[sheetStatus as keyof typeof STATUS_BADGE] ??
                    STATUS_BADGE['NOT_SUBMITTED'];
                  const submittedAt = member.goalSheet?.submittedAt
                    ? new Date(member.goalSheet.submittedAt).toLocaleDateString()
                    : '—';
                  const isSubmitted = sheetStatus === 'SUBMITTED';

                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {member.department}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {submittedAt}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {member.checkInStatus === 'DONE' ? (
                          <span className="inline-flex rounded-full border border-green-300 bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                            Done
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-gray-300 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {member.goalSheet ? (
                            <>
                              <button
                                onClick={() =>
                                  navigate(`/manager/approval/${member.goalSheet!.id}`)
                                }
                                className={`rounded px-3 py-1.5 text-xs font-medium ${
                                  isSubmitted
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                {isSubmitted ? 'Review' : 'View'}
                              </button>
                              <button
                                onClick={() =>
                                  navigate(`/manager/checkin/${member.goalSheet!.id}`)
                                }
                                className="rounded border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                              >
                                Check-in
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">No sheet</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary counts */}
      {team.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
          <span>
            Total:{' '}
            <span className="font-medium text-gray-700">{team.length}</span>
          </span>
          <span>
            Submitted:{' '}
            <span className="font-medium text-blue-700">
              {team.filter((m) => m.goalSheet?.status === 'SUBMITTED').length}
            </span>
          </span>
          <span>
            Approved/Locked:{' '}
            <span className="font-medium text-green-700">
              {
                team.filter(
                  (m) =>
                    m.goalSheet?.status === 'LOCKED' || m.goalSheet?.status === 'APPROVED'
                ).length
              }
            </span>
          </span>
          <span>
            Rework:{' '}
            <span className="font-medium text-yellow-700">
              {team.filter((m) => m.goalSheet?.status === 'REWORK').length}
            </span>
          </span>
          <span>
            Not Submitted:{' '}
            <span className="font-medium text-gray-700">
              {team.filter((m) => !m.goalSheet || m.goalSheet.status === 'DRAFT').length}
            </span>
          </span>
        </div>
      )}

      {/* Push KPI Modal */}
      <PushKpiModal
        open={pushKpiOpen}
        onClose={() => setPushKpiOpen(false)}
        onSuccess={() => {
          setPushKpiOpen(false);
          fetchTeam();
        }}
      />
    </div>
  );
}

export default TeamDashboardPage;
