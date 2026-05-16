import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../lib/api';
import type { Quarter, Goal, Achievement, CheckIn } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalWithAchievements extends Goal {
  achievements: Achievement[];
}

interface GoalSheetResponse {
  id: string;
  employeeId: string;
  status: string;
  goals: GoalWithAchievements[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

function formatScore(score: number | undefined): string {
  if (score === undefined || score === null) return '—';
  return `${(Number(score) * 100).toFixed(1)}%`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CheckInPage() {
  const { sheetId } = useParams<{ sheetId: string }>();
  const navigate = useNavigate();

  const [sheet, setSheet] = useState<GoalSheetResponse | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>('Q1');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      const [sheetRes, checkInsRes] = await Promise.all([
        api.get<GoalSheetResponse>(`/goals/${sheetId}`),
        api.get<CheckIn[]>(`/checkins/${sheetId}`),
      ]);
      setSheet(sheetRes.data);
      setCheckIns(checkInsRes.data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to load check-in data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!sheetId || !comment.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.post('/checkins', {
        goalSheetId: sheetId,
        quarter: selectedQuarter,
        comment: comment.trim(),
      });
      setSuccessMessage(`Check-in for ${selectedQuarter} completed successfully.`);
      setComment('');
      const checkInsRes = await api.get<CheckIn[]>(`/checkins/${sheetId}`);
      setCheckIns(checkInsRes.data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to submit check-in';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading check-in data…</p>
      </div>
    );
  }

  if (error && !sheet) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{error}</p>
          <button onClick={fetchData} className="mt-2 text-sm underline hover:no-underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const goals = sheet?.goals ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/manager/team" className="mb-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800">
          ← Back to team dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Manager Check-in</h1>
        {sheet && (
          <p className="mt-1 text-sm text-gray-500">
            Status: <span className="font-medium">{sheet.status}</span>
          </p>
        )}
      </div>

      {/* Quarter selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-700">Select Quarter</label>
        <div className="flex gap-2">
          {QUARTERS.map((q) => (
            <button
              key={q}
              onClick={() => setSelectedQuarter(q)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                selectedQuarter === q
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Goals table */}
      <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Goal Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Thrust Area</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">UoM Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target</th>
                {QUARTERS.map((q) => (
                  <th
                    key={q}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${
                      q === selectedQuarter ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500'
                    }`}
                  >
                    {q} Actual / Score
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {goals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    No goals found for this sheet.
                  </td>
                </tr>
              ) : (
                goals.map((goal) => (
                  <tr key={goal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{goal.description}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{goal.thrustArea}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{goal.uomType.replace('_', ' ')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{goal.target}</td>
                    {QUARTERS.map((q) => {
                      const ach = goal.achievements.find((a) => a.quarter === q);
                      return (
                        <td key={q} className={`whitespace-nowrap px-4 py-3 text-sm ${q === selectedQuarter ? 'bg-indigo-50' : ''}`}>
                          {ach ? (
                            <div>
                              <p className="font-medium text-gray-900">{ach.actual}</p>
                              <p className="text-xs text-indigo-600">{formatScore(Number(ach.score))}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comment + submit */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Check-in Comment for {selectedQuarter}</h2>
        <label htmlFor="checkin-comment" className="mb-1 block text-sm font-medium text-gray-700">
          Manager Comment <span className="text-red-500">*</span>
        </label>
        <textarea
          id="checkin-comment"
          rows={5}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={`Add your structured check-in comment for ${selectedQuarter}…`}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-gray-500">Comment is required to complete the check-in.</p>

        {error && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {successMessage && <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={!comment.trim() || submitting}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : `Complete Check-in (${selectedQuarter})`}
          </button>
          <button
            onClick={() => navigate('/manager/team')}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Check-in history */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Check-in History</h2>
        </div>
        {checkIns.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">No check-ins recorded yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {checkIns.map((ci) => (
              <li key={ci.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                        {ci.quarter}
                      </span>
                      {ci.manager && <span className="text-xs text-gray-500">by {ci.manager.name}</span>}
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{ci.comment}</p>
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">
                    {new Date(ci.completedAt).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default CheckInPage;
