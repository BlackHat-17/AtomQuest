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

function getScoreColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-600';
  if (score >= 0.5) return 'text-amber-600';
  return 'text-red-600';
}

// ─── Progress indicator ───────────────────────────────────────────────────────

function GoalProgress({ goal, selectedQuarter }: { goal: GoalWithAchievements; selectedQuarter: Quarter }) {
  const completedQuarters = QUARTERS.filter((q) => goal.achievements?.some((a) => a.quarter === q));
  const pct = (completedQuarters.length / 4) * 100;

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1f0c25] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">{completedQuarters.length}/4</span>
      </div>
      <div className="mt-1 flex gap-1">
        {QUARTERS.map((q) => {
          const ach = goal.achievements?.find((a) => a.quarter === q);
          return (
            <span
              key={q}
              className={`inline-flex h-5 w-7 items-center justify-center rounded text-xs font-medium ${
                q === selectedQuarter ? 'ring-2 ring-[#1f0c25]/40' : ''
              } ${
                ach ? 'bg-[#1f0c25]/10 text-[#1f0c25]' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {q}
            </span>
          );
        })}
      </div>
    </div>
  );
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
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load check-in data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!sheetId || !comment.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.post('/checkins', { goalSheetId: sheetId, quarter: selectedQuarter, comment: comment.trim() });
      setSuccessMessage(`Check-in for ${selectedQuarter} completed successfully.`);
      setComment('');
      const checkInsRes = await api.get<CheckIn[]>(`/checkins/${sheetId}`);
      setCheckIns(checkInsRes.data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to submit check-in';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading check-in data…
        </div>
      </div>
    );
  }

  if (error && !sheet) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-xl bg-red-50 p-6 text-red-700 shadow-sm max-w-sm w-full text-center">
          <p className="font-semibold">Error loading data</p>
          <p className="mt-1 text-sm">{error}</p>
          <button onClick={fetchData} className="mt-3 text-sm underline hover:no-underline">Try again</button>
        </div>
      </div>
    );
  }

  const goals = sheet?.goals ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link to="/manager/team" className="mb-3 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to team dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Manager Check-in</h1>
        {sheet && (
          <p className="mt-1 text-sm text-gray-500">
            Status: <span className="font-medium">{sheet.status}</span>
          </p>
        )}
      </div>

      {/* Quarter selector — pill tabs */}
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-gray-700">Select Quarter</p>
        <div className="flex gap-2 flex-wrap">
          {QUARTERS.map((q) => (
            <button
              key={q}
              onClick={() => setSelectedQuarter(q)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                selectedQuarter === q
                  ? 'bg-[#1f0c25] text-white shadow-sm'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-[#1f0c25]/30'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Goals table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Goal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Thrust Area</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">UoM</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target</th>
                {QUARTERS.map((q) => (
                  <th key={q} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${q === selectedQuarter ? 'bg-[#1f0c25]/5 text-[#1f0c25]' : 'text-gray-500'}`}>
                    {q} Actual / Score
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {goals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">No goals found for this sheet.</td>
                </tr>
              ) : (
                goals.map((goal) => (
                  <tr key={goal.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">{goal.description}</p>
                      <GoalProgress goal={goal} selectedQuarter={selectedQuarter} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{goal.thrustArea}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">{goal.uomType.replace('_', ' ')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{goal.target}</td>
                    {QUARTERS.map((q) => {
                      const ach = goal.achievements?.find((a) => a.quarter === q);
                      return (
                        <td key={q} className={`whitespace-nowrap px-4 py-3 text-sm ${q === selectedQuarter ? 'bg-[#1f0c25]/5' : ''}`}>
                          {ach ? (
                            <div>
                              <p className="font-medium text-gray-900">{ach.actual}</p>
                              <p className={`text-xs font-semibold ${getScoreColor(Number(ach.score))}`}>
                                {formatScore(Number(ach.score))}
                              </p>
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
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        <p className="mt-1 text-xs text-gray-500">Comment is required to complete the check-in.</p>

        {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {successMessage && <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</div>}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={!comment.trim() || submitting}
            className="rounded-lg bg-[#1f0c25] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#2d1238] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : `Complete Check-in (${selectedQuarter})`}
          </button>
          <button
            onClick={() => navigate('/manager/team')}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Check-in history */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
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
                      <span className="inline-flex rounded-full bg-[#1f0c25]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1f0c25]">{ci.quarter}</span>
                      {ci.manager && <span className="text-xs text-gray-500">by {ci.manager.name}</span>}
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{ci.comment}</p>
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">{new Date(ci.completedAt).toLocaleString()}</time>
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
