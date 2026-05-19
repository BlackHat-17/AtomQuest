import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { geminiEnabled, analyzeAchievements, chatWithAssistant, type ChatMessage } from '../lib/gemini';
import api from '../lib/api';

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'lg' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-20 w-20 text-2xl',
    xl: 'h-28 w-28 text-3xl',
  };
  return (
    <div className={`flex items-center justify-center rounded-full bg-gradient-to-br from-[#1f0c25] to-[#2d1238] font-bold text-white shadow-lg ring-4 ring-white ${sizeClasses[size]}`}>
      {initials}
    </div>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_STYLES = {
  EMPLOYEE: 'bg-[#1f0c25]/10 text-[#1f0c25] border-[#1f0c25]/20',
  MANAGER: 'bg-[#2d1238]/10 text-[#2d1238] border-[#2d1238]/20',
  ADMIN: 'bg-rose-100 text-rose-700 border-rose-200',
};

// ─── AI Chat panel ────────────────────────────────────────────────────────────

function AIChatPanel({ user }: { user: { name: string; role: string; department: string } }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: `Hi ${user.name.split(' ')[0]}! 👋 I'm your GoalTrack AI assistant. I can help you with goal setting, performance tips, and career advice. What's on your mind?` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const reply = await chatWithAssistant(newMessages, {
        role: user.role,
        department: user.department,
        name: user.name,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-96 rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-[#1f0c25] to-[#2d1238] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">GoalTrack AI</p>
          <p className="text-xs text-indigo-200">Powered by Gemini</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-slow" />
          <span className="text-xs text-indigo-200">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#1f0c25] text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Ask me anything about your goals…"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="rounded-xl bg-[#1f0c25] px-3 py-2 text-white hover:bg-[#2d1238] disabled:opacity-40 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Insights panel ────────────────────────────────────────────────────────

function AIInsightsPanel({ user }: { user: { role: string; department: string; name: string } }) {
  const [insights, setInsights] = useState<{ overallScore: string; trend: string; strengths: string[]; improvements: string[]; recommendation: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInsights() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ goals: Array<{ title: string; uomType: string; target: string; achievements: Array<{ quarter: string; actual: string; score: number }> }> }>('/goals/my-sheet');
      const goals = (data as unknown as { goals: Array<{ title: string; uomType: string; target: string; achievements?: Array<{ quarter: string; actual: string; score: number }> }> }).goals ?? [];
      const result = await analyzeAchievements(goals.map(g => ({ ...g, achievements: g.achievements ?? [] })));
      setInsights(result);
    } catch {
      setError('Could not load insights. Make sure you have goals with achievement data.');
    } finally {
      setLoading(false);
    }
  }

  const trendIcon = insights?.trend === 'improving' ? '📈' : insights?.trend === 'declining' ? '📉' : '➡️';
  const trendColor = insights?.trend === 'improving' ? 'text-emerald-600' : insights?.trend === 'declining' ? 'text-red-600' : 'text-amber-600';

  return (
    <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2d1238]/10">
            <svg className="h-4 w-4 text-[#2d1238]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900">AI Performance Insights</h3>
        </div>
        <button
          onClick={loadInsights}
          disabled={loading}
          className="rounded-lg bg-[#2d1238] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3d1f4a] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Analyzing…' : insights ? 'Refresh' : 'Analyze'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {!insights && !loading && !error && (
        <div className="text-center py-6 text-gray-400">
          <svg className="h-10 w-10 mx-auto mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <p className="text-sm">Click Analyze to get AI-powered insights on your performance</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + i * 10}%` }} />)}
        </div>
      )}

      {insights && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-indigo-600">{insights.overallScore}</p>
              <p className="text-xs text-gray-500">Overall Score</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${trendColor}`}>{trendIcon}</p>
              <p className={`text-xs font-medium capitalize ${trendColor}`}>{insights.trend}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1">Strengths</p>
            <ul className="space-y-1">
              {insights.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-emerald-500 mt-0.5">✓</span> {s}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">Areas to Improve</p>
            <ul className="space-y-1">
              {insights.improvements.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-amber-500 mt-0.5">→</span> {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-[#1f0c25]/5 p-3 border border-[#1f0c25]/10">
            <p className="text-xs font-semibold text-[#1f0c25] mb-1">💡 Recommendation</p>
            <p className="text-sm text-[#2d1238]">{insights.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'ai'>('overview');

  if (!user) return null;

  const joinedDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Profile hero */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1f0c25] via-[#2d1238] to-[#3d1f4a] p-8 text-white shadow-xl">
        {/* Decorative circles */}
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-white/5" />

        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="animate-bounce-in">
            <Avatar name={user.name} size="xl" />
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold">{user.name}</h1>
            <p className="mt-1 text-indigo-200">{user.email}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${ROLE_STYLES[user.role]} bg-white/90`}>
                {user.role}
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                {user.department}
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
                Joined {joinedDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { id: 'overview', label: 'Overview', icon: '👤' },
          { id: 'ai', label: 'AI Assistant', icon: '🤖' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'overview' | 'ai')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 animate-fade-in">
          {/* Account info */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1f0c25]/10 text-[#1f0c25] text-sm">👤</span>
              Account Information
            </h2>
            <dl className="space-y-3">
              {[
                { label: 'Full Name', value: user.name },
                { label: 'Email', value: user.email },
                { label: 'Role', value: user.role },
                { label: 'Department', value: user.department },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="text-sm font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Quick stats */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2d1238]/10 text-[#2d1238] text-sm">📊</span>
              Role Capabilities
            </h2>
            <div className="space-y-3">
              {user.role === 'EMPLOYEE' && [
                { label: 'Set & manage goals', icon: '🎯' },
                { label: 'Log quarterly achievements', icon: '📈' },
                { label: 'Submit for manager approval', icon: '✅' },
                { label: 'View shared KPIs', icon: '🔗' },
              ].map(({ label, icon }) => (
                <div key={label} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <span>{icon}</span>
                  <span className="text-sm text-gray-700">{label}</span>
                </div>
              ))}
              {user.role === 'MANAGER' && [
                { label: 'Review & approve team goals', icon: '✅' },
                { label: 'Conduct quarterly check-ins', icon: '💬' },
                { label: 'Push KPIs to team members', icon: '📤' },
                { label: 'View team performance', icon: '👥' },
              ].map(({ label, icon }) => (
                <div key={label} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <span>{icon}</span>
                  <span className="text-sm text-gray-700">{label}</span>
                </div>
              ))}
              {user.role === 'ADMIN' && [
                { label: 'Manage goal cycles', icon: '🔄' },
                { label: 'Configure escalation rules', icon: '⚡' },
                { label: 'Export achievement reports', icon: '📊' },
                { label: 'Full audit trail access', icon: '🔍' },
              ].map(({ label, icon }) => (
                <div key={label} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <span>{icon}</span>
                  <span className="text-sm text-gray-700">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insights — only for employees */}
          {user.role === 'EMPLOYEE' && geminiEnabled && (
            <div className="lg:col-span-2">
              <AIInsightsPanel user={user} />
            </div>
          )}
        </div>
      )}

      {/* AI tab */}
      {activeTab === 'ai' && (
        <div className="animate-fade-in">
          {geminiEnabled ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h2 className="mb-3 font-semibold text-gray-900">💬 Chat with GoalTrack AI</h2>
                <AIChatPanel user={user} />
              </div>
              <div>
                <h2 className="mb-3 font-semibold text-gray-900">🚀 What AI can help you with</h2>
                <div className="space-y-3">
                  {[
                    { title: 'Goal Suggestions', desc: 'Get AI-generated SMART goal ideas based on your role and department', icon: '🎯', color: 'bg-[#1f0c25]/5 border-[#1f0c25]/10' },
                    { title: 'Performance Analysis', desc: 'Analyze your achievement trends and get personalized recommendations', icon: '📈', color: 'bg-[#2d1238]/5 border-[#2d1238]/10' },
                    { title: 'Goal Descriptions', desc: 'Auto-write professional goal descriptions from just a title', icon: '✍️', color: 'bg-emerald-50 border-emerald-100' },
                    { title: 'Career Coaching', desc: 'Get advice on performance improvement and career development', icon: '🌟', color: 'bg-amber-50 border-amber-100' },
                  ].map(item => (
                    <div key={item.title} className={`rounded-xl border p-4 ${item.color} card-hover`}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div>
                          <p className="font-semibold text-gray-900">{item.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
              <div className="text-5xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold text-gray-700">AI Features Not Configured</h3>
              <p className="mt-2 text-sm text-gray-500">Add your Gemini API key to <code className="bg-gray-200 px-1 rounded">frontend/.env</code> to enable AI features.</p>
              <code className="mt-3 block text-xs text-indigo-600">VITE_GEMINI_API_KEY=your-key-here</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
