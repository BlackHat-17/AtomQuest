import { useState, useRef, useEffect } from 'react';
import QoQTrendsChart from './analytics/QoQTrendsChart';
import CompletionHeatmap from './analytics/CompletionHeatmap';
import GoalDistribution from './analytics/GoalDistribution';
import ManagerEffectiveness from './analytics/ManagerEffectiveness';

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'qoq' | 'heatmap' | 'distribution' | 'managers';

interface Tab { id: TabId; label: string; }

const TABS: Tab[] = [
  { id: 'qoq', label: 'QoQ Trends' },
  { id: 'heatmap', label: 'Completion Heatmap' },
  { id: 'distribution', label: 'Goal Distribution' },
  { id: 'managers', label: 'Manager Effectiveness' },
];

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 rounded-lg bg-gray-200" />
      <div className="h-64 rounded-xl bg-gray-200" />
      <div className="flex gap-3">
        <div className="h-4 w-24 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="h-4 w-20 rounded bg-gray-200" />
      </div>
    </div>
  );
}

// ─── Tab content with loading state ──────────────────────────────────────────

function TabContent({ activeTab }: { activeTab: TabId }) {
  const [loading, setLoading] = useState(true);
  const prevTab = useRef<TabId | null>(null);

  useEffect(() => {
    if (prevTab.current !== activeTab) {
      setLoading(true);
      prevTab.current = activeTab;
      const t = setTimeout(() => setLoading(false), 300);
      return () => clearTimeout(t);
    }
  }, [activeTab]);

  if (loading) return <ChartSkeleton />;

  return (
    <div className="motion-safe:animate-fade-in">
      {activeTab === 'qoq' && <QoQTrendsChart />}
      {activeTab === 'heatmap' && <CompletionHeatmap />}
      {activeTab === 'distribution' && <GoalDistribution />}
      {activeTab === 'managers' && <ManagerEffectiveness />}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('qoq');
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({} as Record<TabId, HTMLButtonElement | null>);

  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Organisation-wide performance insights and trends.</p>
      </div>

      {/* Tab bar with smooth underline */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="relative -mb-px flex space-x-1 overflow-x-auto" aria-label="Analytics tabs">
          {/* Animated underline indicator */}
          <div
            className="absolute bottom-0 h-0.5 bg-indigo-600 transition-all duration-300 ease-out"
            style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
          />
          {TABS.map((tab) => (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el; }}
              onClick={() => setActiveTab(tab.id)}
              className={`relative whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                activeTab === tab.id ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <TabContent activeTab={activeTab} />
    </div>
  );
}

export default AnalyticsPage;
