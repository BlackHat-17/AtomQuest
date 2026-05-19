import { useState } from 'react';
import { suggestGoals, writeGoalDescription, type GoalSuggestion } from '../lib/gemini';
import type { ThrustArea, UomType } from '../types';

interface AIGoalSuggestionsProps {
  department: string;
  role: string;
  existingGoalTitles: string[];
  onApply: (suggestion: { thrustArea: ThrustArea; title: string; description: string; uomType: UomType; target: string; weightage: number }) => void;
}

export function AIGoalSuggestions({ department, role, existingGoalTitles, onApply }: AIGoalSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function loadSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const results = await suggestGoals(role, department, existingGoalTitles);
      setSuggestions(results);
      setOpen(true);
    } catch {
      setError('Could not generate suggestions. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={loadSuggestions}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
      >
        <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        {loading ? 'Generating…' : '✨ AI Suggest Goals'}
      </button>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {open && suggestions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl animate-scale-in overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1f0c25] to-[#2d1238] px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">✨ AI Goal Suggestions</h2>
                <p className="text-xs text-purple-200 mt-0.5">Powered by Gemini · Tailored for {department}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Suggestions */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {suggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all duration-200 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-gray-900">{s.title}</span>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{s.thrustArea}</span>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{s.uomType}</span>
                      </div>
                      <p className="text-xs text-gray-600">{s.description}</p>
                      <p className="text-xs text-gray-500 mt-1">Target: <span className="font-medium">{s.suggestedTarget}</span> · Weightage: <span className="font-medium">{s.weightage}%</span></p>
                    </div>
                    <button
                      onClick={() => {
                        onApply({
                          thrustArea: s.thrustArea as ThrustArea,
                          title: s.title,
                          description: s.description,
                          uomType: s.uomType as UomType,
                          target: s.suggestedTarget,
                          weightage: s.weightage,
                        });
                        setOpen(false);
                      }}
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                      Use This
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 px-6 py-3 flex justify-between items-center">
              <button onClick={loadSuggestions} disabled={loading} className="text-xs text-purple-600 hover:underline disabled:opacity-50">
                {loading ? 'Regenerating…' : '↻ Regenerate'}
              </button>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── AI Description Writer ────────────────────────────────────────────────────

interface AIDescriptionWriterProps {
  title: string;
  thrustArea: string;
  uomType: string;
  onGenerated: (description: string) => void;
}

export function AIDescriptionWriter({ title, thrustArea, uomType, onGenerated }: AIDescriptionWriterProps) {
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const desc = await writeGoalDescription(title, thrustArea, uomType);
      onGenerated(desc);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={generate}
      disabled={loading || !title.trim()}
      className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 disabled:opacity-40 transition-colors"
      title="Auto-write description with AI"
    >
      <svg className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      {loading ? 'Writing…' : '✨ AI Write'}
    </button>
  );
}
