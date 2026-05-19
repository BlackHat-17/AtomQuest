import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';
import { geminiEnabled, summarizeTeamPerformance } from '../lib/gemini';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeDashboard {
  sheetStatus: string | null;
  goalCount: number;
  totalWeightage: number;
  cycleYear: number | null;
  cyclePhase: string | null;
  goals: Array<{ status: string; weightage: number }>;
}

interface ManagerDashboard {
  totalTeam: number;
  submitted: number;
  approved: number;
  rework: number;
  pending: number;
  pendingApprovals: Array<{
    sheetId: string;
    employeeName: string;
    submittedAt: string;
  }>;
  teamRaw: Array<{ name: string; status: string; checkInStatus: string }>;
}

interface AdminDashboard {
  totalUsers: number;
  activeCycle: string | null;
  completionRate: number | null;
}

// ─── useCountUp hook ──────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 800): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) {
      setCount(0);
      return;
    }
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return count;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  displayValue?: string;
  color: 'indigo' | 'emerald' | 'amber' | 'red' | 'purple' | 'blue';
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  animationDelay?: string;
}

const GRADIENT_MAP = {
  indigo: 'bg-gradient-to-br from-[#1f0c25]/5 to-[#1f0c25]/10 border-[#1f0c25]/20 text-[#1f0c25]',
  emerald: 'bg-gradient-to-br from-emerald-50 to-emerald-100/60 border-emerald-200 text-emerald-700',
  amber: 'bg-gradient-to-br from-amber-50 to-amber-100/60 border-amber-200 text-amber-700',
  red: 'bg-gradient-to-br from-red-50 to-red-100/60 border-red-200 text-red-700',
  purple: 'bg-gradient-to-br from-[#2d1238]/5 to-[#2d1238]/10 border-[#2d1238]/20 text-[#2d1238]',
  blue: 'bg-gradient-to-br from-blue-50 to-blue-100/60 border-blue-200 text-blue-700',
};

const ICON_BG = {
  indigo: 'bg-[#1f0c25]/10 text-[#1f0c25]',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
  purple: 'bg-[#2d1238]/10 text-[#2d1238]',
  blue: 'bg-blue-100 text-blue-600',
};

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'neutral' }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center text-emerald-500 text-xs font-semibold ml-1">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex items-center text-red-400 text-xs font-semibold ml-1">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-gray-400 text-xs font-semibold ml-1">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    </span>
  );
}

function StatCard({ label, value, displayValue, color, icon, trend, subtitle, animationDelay }: StatCardProps) {
  const animated = useCountUp(value);
  const shown = displayValue ? displayValue.replace(String(value), String(animated)) : String(animated);

  return (
    <div
      className={`card-hover rounded-xl border p-5 shadow-sm ring-1 ring-gray-100 hover:ring-[#1f0c25]/20 transition-all motion-safe:animate-scale-in ${GRADIENT_MAP[color]} ${animationDelay ?? ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
          <div className="mt-1 flex items-baseline gap-0.5">
            <p className="text-3xl font-bold tabular-nums">{shown}</p>
            {trend && <TrendArrow trend={trend} />}
          </div>
          {subtitle && <p className="mt-1 text-xs opacity-60 truncate">{subtitle}</p>}
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${ICON_BG[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Floating circles background ─────────────────────────────────────────────

function FloatingCircles() {
  return (
    <>
      <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10 animate-float" style={{ animationDelay: '0ms' }} />
      <div className="absolute top-6 right-16 h-14 w-14 rounded-full bg-white/10 animate-float" style={{ animationDelay: '600ms' }} />
      <div className="absolute -bottom-2 right-8 h-16 w-16 rounded-full bg-white/10 animate-float" style={{ animationDelay: '1200ms' }} />
      <div className="absolute top-2 left-1/2 h-10 w-10 rounded-full bg-white/10 animate-float" style={{ animationDelay: '300ms' }} />
      <div className="absolute bottom-4 left-8 h-8 w-8 rounded-full bg-white/10 animate-float" style={{ animationDelay: '900ms' }} />
    </>
  );
}

// ─── Quick action button ──────────────────────────────────────────────────────

function QuickAction({ to, label, description, color, animationDelay }: {
  to: string;
  label: string;
  description: string;
  color: string;
  animationDelay?: string;
}) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm ring-1 ring-gray-100 hover:ring-[#1f0c25]/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${color} ${animationDelay ?? ''}`}
    >
      <div className="flex-1">
        <p className="font-semibold text-gray-900 group-hover:text-[#1f0c25] transition-colors">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <svg className="h-5 w-5 text-gray-400 group-hover:text-[#1f0c25] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ─── Sheet status badge ───────────────────────────────────────────────────────

const SHEET_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  REWORK: 'bg-amber-100 text-amber-700 border-amber-300',
  LOCKED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

// ─── Circular progress ring ───────────────────────────────────────────────────

function CircularProgressRing({ percent, size = 80, strokeWidth = 8, color = '#6366f1' }: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  );
}

// ─── Donut chart (SVG) ────────────────────────────────────────────────────────

interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

function DonutChart({ segments, size = 120, strokeWidth = 22 }: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let offset = 0;
  const arcs = segments.map((seg) => {
    const dash = total > 0 ? (seg.value / total) * circumference : 0;
    const gap = circumference - dash;
    const rotation = (offset / circumference) * 360;
    offset += dash;
    return { ...seg, dash, gap, rotation };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
        {arcs.map((arc, i) =>
          arc.value > 0 ? (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arc.dash} ${arc.gap}`}
              strokeDashoffset={0}
              style={{ transform: `rotate(${arc.rotation}deg)`, transformOrigin: '50% 50%', transition: 'stroke-dasharray 0.8s ease-out' }}
            />
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span>{seg.label}</span>
            <span className="font-semibold text-gray-800">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Employee dashboard ───────────────────────────────────────────────────────

function EmployeeDashboardView() {
  const { user } = useAuth();
  const [data, setData] = useState<EmployeeDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ id: string; status: string; goals: Array<{ status: string; weightage: number }>; cycle?: { year: number; phase: string } }>('/goals/my-sheet')
      .then(({ data }) => {
        // API returns GoalSheet directly
        const goals = Array.isArray(data.goals) ? data.goals : [];
        const totalWeightage = goals.reduce((sum, g) => sum + Number(g.weightage), 0);
        setData({
          sheetStatus: data.status ?? null,
          goalCount: goals.length,
          totalWeightage: Math.round(totalWeightage),
          cycleYear: data.cycle?.year ?? null,
          cyclePhase: data.cycle?.phase ?? null,
          goals,
        });
      })
      .catch(() => {
        setData({ sheetStatus: null, goalCount: 0, totalWeightage: 0, cycleYear: null, cyclePhase: null, goals: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.name.split(' ')[0] ?? 'there';

  // Goal health
  const completedGoals = data?.goals.filter((g) => g.status === 'COMPLETED').length ?? 0;
  const totalGoals = data?.goals.length ?? 0;
  const completionPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  const goalHealth: 'green' | 'amber' | 'red' = (() => {
    if (!data || totalGoals === 0) return 'red';
    if (data.totalWeightage === 100 && totalGoals > 0) return 'green';
    if (totalGoals > 0) return 'amber';
    return 'red';
  })();

  const healthConfig = {
    green: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'All goals set & weightage complete', bg: 'bg-emerald-50 border-emerald-200' },
    amber: { dot: 'bg-amber-400', text: 'text-amber-700', label: 'Partially configured — review weightage', bg: 'bg-amber-50 border-amber-200' },
    red: { dot: 'bg-red-500', text: 'text-red-700', label: 'No goals set yet', bg: 'bg-red-50 border-red-200' },
  };

  return (
    <div className="animate-fade-in">
      {/* Welcome banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-[#1f0c25] to-[#2d1238] p-6 text-white shadow-lg">
        <FloatingCircles />
        <div className="relative z-10">
          <h2 className="text-2xl font-bold">Welcome back, {firstName}! 👋</h2>
          <p className="mt-1 text-indigo-100">
            {data?.cycleYear
              ? `Active cycle: ${data.cycleYear} — ${data.cyclePhase?.replace('_', ' ')}`
              : 'Track your goals and achievements here.'}
          </p>
        </div>
      </div>

      {/* AI insight teaser */}
      {geminiEnabled && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#2d1238]/20 bg-gradient-to-r from-[#2d1238]/5 to-[#1f0c25]/5 px-4 py-3 animate-fade-in delay-75">
          <span className="text-lg">✨</span>
          <p className="text-sm text-[#2d1238] font-medium flex-1">
            AI insights available — visit your{' '}
            <Link to="/profile" className="underline underline-offset-2 hover:text-[#1f0c25] transition-colors">
              Profile
            </Link>{' '}
            to get personalised recommendations.
          </p>
        </div>
      )}

      {/* Stat cards */}
      {!loading && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Goals Set"
            value={data?.goalCount ?? 0}
            color="indigo"
            trend={totalGoals > 0 ? 'up' : 'neutral'}
            subtitle={totalGoals > 0 ? `${completedGoals} completed` : 'No goals yet'}
            animationDelay="delay-75"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <StatCard
            label="Total Weightage"
            value={data?.totalWeightage ?? 0}
            displayValue={`${data?.totalWeightage ?? 0}%`}
            color="purple"
            trend={data?.totalWeightage === 100 ? 'up' : data?.totalWeightage ?? 0 > 0 ? 'neutral' : 'down'}
            subtitle={data?.totalWeightage === 100 ? 'Fully allocated' : 'Target: 100%'}
            animationDelay="delay-150"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
          <div className="card-hover rounded-xl border bg-white p-5 shadow-sm ring-1 ring-gray-100 hover:ring-[#1f0c25]/20 transition-all motion-safe:animate-scale-in delay-225">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sheet Status</p>
            <div className="mt-2">
              {data?.sheetStatus ? (
                <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${SHEET_STATUS_STYLES[data.sheetStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                  {data.sheetStatus}
                </span>
              ) : (
                <span className="text-sm text-gray-400">No sheet yet</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Goal progress & health */}
      {!loading && data && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 animate-fade-in delay-150">
          {/* Circular progress ring */}
          <div className="rounded-xl border bg-white p-5 shadow-sm ring-1 ring-gray-100 hover:ring-[#1f0c25]/20 transition-all">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Goal Completion</p>
            <div className="flex items-center gap-5">
              <div className="relative flex items-center justify-center">
                <CircularProgressRing percent={completionPct} size={80} strokeWidth={8} color="#1f0c25" />
                <span className="absolute text-sm font-bold text-[#1f0c25]">{completionPct}%</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{completedGoals} <span className="text-base font-normal text-gray-400">/ {totalGoals}</span></p>
                <p className="text-xs text-gray-500 mt-0.5">goals completed</p>
              </div>
            </div>
          </div>

          {/* Goal health */}
          <div className={`rounded-xl border p-5 shadow-sm ring-1 ring-gray-100 transition-all ${healthConfig[goalHealth].bg}`}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Goal Health</p>
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full shrink-0 ${healthConfig[goalHealth].dot} animate-pulse-slow`} />
              <p className={`text-sm font-semibold ${healthConfig[goalHealth].text}`}>
                {healthConfig[goalHealth].label}
              </p>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Weightage: <span className="font-semibold">{data.totalWeightage}%</span> · Goals: <span className="font-semibold">{totalGoals}</span>
            </p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Quick Actions</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickAction
          to="/employee/goals"
          label="View My Goals"
          description="Manage your goal sheet for the current cycle"
          color="border-[#1f0c25]/20 hover:border-[#1f0c25]/40"
          animationDelay="delay-75"
        />
        <QuickAction
          to="/employee/achievements"
          label="Log Achievement"
          description="Enter quarterly actuals and track your scores"
          color="border-[#2d1238]/20 hover:border-[#2d1238]/40"
          animationDelay="delay-150"
        />
      </div>
    </div>
  );
}

// ─── Manager dashboard ────────────────────────────────────────────────────────

function ManagerDashboardView() {
  const { user } = useAuth();
  const [data, setData] = useState<ManagerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ team: Array<{ id: string; name: string; goalSheet: { id: string; status: string; submittedAt: string | null } | null }> }>('/manager/team')
      .then(({ data: res }) => {
        const team = res.team ?? [];
        const submitted = team.filter((m) => m.goalSheet?.status === 'SUBMITTED');
        const approved = team.filter((m) => m.goalSheet?.status === 'APPROVED' || m.goalSheet?.status === 'LOCKED');
        const rework = team.filter((m) => m.goalSheet?.status === 'REWORK');
        const pending = team.filter((m) => !m.goalSheet || m.goalSheet.status === 'DRAFT');

        setData({
          totalTeam: team.length,
          submitted: submitted.length,
          approved: approved.length,
          rework: rework.length,
          pending: pending.length,
          pendingApprovals: submitted.slice(0, 5).map((m) => ({
            sheetId: m.goalSheet!.id,
            employeeName: m.name,
            submittedAt: m.goalSheet!.submittedAt ?? '',
          })),
          teamRaw: team.map((m) => ({
            name: m.name,
            status: m.goalSheet?.status ?? 'DRAFT',
            checkInStatus: 'N/A',
          })),
        });
      })
      .catch(() => {
        setData({ totalTeam: 0, submitted: 0, approved: 0, rework: 0, pending: 0, pendingApprovals: [], teamRaw: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.name.split(' ')[0] ?? 'there';

  const handleAiSummary = async () => {
    if (!data) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await summarizeTeamPerformance(data.teamRaw);
      setAiSummary(result);
    } catch {
      setAiError('Could not generate summary. Check your AI configuration.');
    } finally {
      setAiLoading(false);
    }
  };

  const donutSegments = data
    ? [
        { value: data.submitted, color: '#3b82f6', label: 'Submitted' },
        { value: data.approved, color: '#10b981', label: 'Approved' },
        { value: data.rework, color: '#f59e0b', label: 'Rework' },
        { value: data.pending, color: '#e5e7eb', label: 'Pending' },
      ]
    : [];

  return (
    <div className="animate-fade-in">
      {/* Welcome banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-[#1f0c25] to-[#2d1238] p-6 text-white shadow-lg">
        <FloatingCircles />
        <div className="relative z-10">
          <h2 className="text-2xl font-bold">Welcome back, {firstName}! 👋</h2>
          <p className="mt-1 text-white/80">Here's your team's goal progress at a glance.</p>
        </div>
      </div>

      {/* Stat cards */}
      {!loading && data && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Team" value={data.totalTeam} color="indigo" trend="neutral" animationDelay="delay-75" icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          } />
          <StatCard label="Submitted" value={data.submitted} color="blue" trend={data.submitted > 0 ? 'up' : 'neutral'} animationDelay="delay-150" icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          } />
          <StatCard label="Approved" value={data.approved} color="emerald" trend={data.approved > 0 ? 'up' : 'neutral'} animationDelay="delay-225" icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          } />
          <StatCard label="Needs Rework" value={data.rework} color="amber" trend={data.rework > 0 ? 'down' : 'neutral'} animationDelay="delay-300" icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          } />
        </div>
      )}

      {/* Donut chart + AI summary */}
      {!loading && data && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 animate-fade-in delay-150">
          {/* Donut chart */}
          <div className="rounded-xl border bg-white p-5 shadow-sm ring-1 ring-gray-100 hover:ring-[#1f0c25]/20 transition-all">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Team Status Breakdown</p>
            <DonutChart segments={donutSegments} size={120} strokeWidth={22} />
          </div>

          {/* AI Team Summary */}
          {geminiEnabled && (
            <div className="rounded-xl border bg-white p-5 shadow-sm ring-1 ring-gray-100 hover:ring-[#2d1238]/20 transition-all">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">AI Team Summary</p>
              {!aiSummary && !aiLoading && (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-gray-500">Get an AI-generated overview of your team's goal progress and a coaching tip.</p>
                  <button
                    onClick={handleAiSummary}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#1f0c25] to-[#2d1238] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-[#2d1238] hover:to-[#3d1f4a] transition-all"
                  >
                    <span>✨</span> Get AI Summary
                  </button>
                </div>
              )}
              {aiLoading && (
                <div className="flex items-center gap-2 text-sm text-[#2d1238]">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating summary…
                </div>
              )}
              {aiError && (
                <p className="text-sm text-red-500">{aiError}</p>
              )}
              {aiSummary && (
                <div className="rounded-lg border border-[#2d1238]/20 bg-gradient-to-br from-[#2d1238]/5 to-[#1f0c25]/5 p-4">
                  <p className="text-sm text-gray-800 leading-relaxed">{aiSummary}</p>
                  <button
                    onClick={() => { setAiSummary(null); setAiError(null); }}
                    className="mt-3 text-xs text-[#2d1238]/70 hover:text-[#2d1238] underline underline-offset-2 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Quick Actions</h3>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickAction
          to="/manager/team"
          label="View Team Dashboard"
          description="See all team members and their goal sheet status"
          color="border-[#2d1238]/20 hover:border-[#2d1238]/40"
          animationDelay="delay-75"
        />
      </div>

      {/* Pending approvals */}
      {data && data.pendingApprovals.length > 0 && (
        <div className="animate-fade-in delay-150">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Pending Approvals ({data.submitted})
          </h3>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ring-1 ring-gray-100">
            <ul className="divide-y divide-gray-100">
              {data.pendingApprovals.map((item) => (
                <li key={item.sheetId} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.employeeName}</p>
                    {item.submittedAt && (
                      <p className="text-xs text-gray-500">
                        Submitted {new Date(item.submittedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Link
                    to={`/manager/approval/${item.sheetId}`}
                    className="rounded-md bg-[#1f0c25] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2d1238] transition-colors"
                  >
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin dashboard ──────────────────────────────────────────────────────────

function AdminDashboardView() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<unknown[]>('/admin/users').catch(() => ({ data: [] })),
      api.get<Array<{ isActive: boolean; year: number; phase: string }>>('/admin/cycles').catch(() => ({ data: [] })),
    ]).then(([usersRes, cyclesRes]) => {
      const users = (usersRes as { data: unknown[] }).data;
      const cycles = (cyclesRes as { data: Array<{ isActive: boolean; year: number; phase: string }> }).data;
      const activeCycle = cycles.find((c) => c.isActive);
      setData({
        totalUsers: users.length,
        activeCycle: activeCycle ? `${activeCycle.year} — ${activeCycle.phase.replace('_', ' ')}` : null,
        completionRate: null,
      });
    }).finally(() => setLoading(false));
  }, []);

  const firstName = user?.name.split(' ')[0] ?? 'there';

  const adminLinks = [
    { to: '/admin/reports', label: 'Reports', desc: 'Export achievement data', color: 'border-[#1f0c25]/20 hover:border-[#1f0c25]/40', delay: 'delay-75' },
    { to: '/admin/analytics', label: 'Analytics', desc: 'Organisation-wide insights', color: 'border-[#2d1238]/20 hover:border-[#2d1238]/40', delay: 'delay-150' },
    { to: '/admin/cycles', label: 'Cycles', desc: 'Manage goal cycles & phases', color: 'border-emerald-100 hover:border-emerald-300', delay: 'delay-225' },
    { to: '/admin/users', label: 'Users', desc: 'Manage roles & hierarchy', color: 'border-blue-100 hover:border-blue-300', delay: 'delay-300' },
    { to: '/admin/escalation-rules', label: 'Escalations', desc: 'Configure escalation rules', color: 'border-amber-100 hover:border-amber-300', delay: 'delay-375' },
    { to: '/admin/audit', label: 'Audit Log', desc: 'View all system changes', color: 'border-red-100 hover:border-red-300', delay: 'delay-450' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Welcome banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-[#1f0c25] to-[#2d1238] p-6 text-white shadow-lg">
        <FloatingCircles />
        <div className="relative z-10">
          <h2 className="text-2xl font-bold">Welcome back, {firstName}! 👋</h2>
          <p className="mt-1 text-white/80">System overview and administration tools.</p>
        </div>
      </div>

      {/* Stat cards */}
      {!loading && data && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total Users"
            value={data.totalUsers}
            color="indigo"
            trend="neutral"
            animationDelay="delay-75"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
          />
          <div className="card-hover rounded-xl border bg-white p-5 shadow-sm ring-1 ring-gray-100 hover:ring-[#1f0c25]/20 transition-all motion-safe:animate-scale-in delay-150">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active Cycle</p>
            <p className="mt-2 text-lg font-bold text-gray-900">
              {data.activeCycle ?? <span className="text-gray-400 text-sm font-normal">None active</span>}
            </p>
          </div>
          <div className="card-hover rounded-xl border bg-white p-5 shadow-sm ring-1 ring-gray-100 hover:ring-[#1f0c25]/20 transition-all motion-safe:animate-scale-in delay-225">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Completion Rate</p>
            <p className="mt-2 text-lg font-bold text-gray-900">
              {data.completionRate !== null ? `${data.completionRate}%` : <span className="text-gray-400 text-sm font-normal">See Reports</span>}
            </p>
          </div>
        </div>
      )}

      {/* System Health */}
      <div className="mb-8 animate-fade-in delay-150">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">System Health</h3>
        <div className="rounded-xl border bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap gap-6">
            {/* Database */}
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse-slow" />
              <span className="text-sm font-medium text-gray-700">Database</span>
              <span className="text-xs text-emerald-600 font-semibold">Connected</span>
            </div>
            {/* Active Cycle */}
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${data?.activeCycle ? 'bg-emerald-500 animate-pulse-slow' : 'bg-red-400'}`} />
              <span className="text-sm font-medium text-gray-700">Active Cycle</span>
              <span className={`text-xs font-semibold ${data?.activeCycle ? 'text-emerald-600' : 'text-red-500'}`}>
                {data?.activeCycle ? 'Running' : 'None'}
              </span>
            </div>
            {/* AI Features */}
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${geminiEnabled ? 'bg-emerald-500 animate-pulse-slow' : 'bg-gray-300'}`} />
              <span className="text-sm font-medium text-gray-700">AI Features</span>
              <span className={`text-xs font-semibold ${geminiEnabled ? 'text-emerald-600' : 'text-gray-400'}`}>
                {geminiEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Admin Tools</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adminLinks.map((link) => (
          <QuickAction
            key={link.to}
            to={link.to}
            label={link.label}
            description={link.desc}
            color={link.color}
            animationDelay={link.delay}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {user.role === 'EMPLOYEE' && <EmployeeDashboardView />}
      {user.role === 'MANAGER' && <ManagerDashboardView />}
      {user.role === 'ADMIN' && <AdminDashboardView />}
    </div>
  );
}

export default DashboardPage;
