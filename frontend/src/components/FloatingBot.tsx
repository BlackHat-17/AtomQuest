import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { geminiEnabled, chatWithAssistant, fillGoalsFromPrompt, type ChatMessage, type GoalFromPrompt } from '../lib/gemini';

interface FloatingBotProps {
  /** Called when user asks to fill goals — passes the generated goals */
  onFillGoals?: (goals: GoalFromPrompt[]) => void;
  /** Current number of goals (to calculate remaining slots) */
  currentGoalCount?: number;
  /** Current total weightage (to calculate remaining weightage) */
  currentWeightage?: number;
}

export function FloatingBot({ onFillGoals, currentGoalCount = 0, currentWeightage = 0 }: FloatingBotProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'chat' | 'fill-goals'>('chat');
  const [fillLoading, setFillLoading] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize greeting when opened
  useEffect(() => {
    if (open && messages.length === 0 && user) {
      setMessages([{
        role: 'assistant',
        content: `Hi ${user.name.split(' ')[0]}! 👋 I'm your GoalTrack AI assistant.\n\nI can help you:\n• Answer questions about the portal\n• Set up your goals automatically from a description\n• Analyze your performance\n\nWhat would you like to do?`,
      }]);
    }
  }, [open, user, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!geminiEnabled) return null;

  async function sendMessage() {
    if (!input.trim() || loading || !user) return;

    const userMsg = input.trim();
    setInput('');

    // Detect if user wants to fill goals
    const fillKeywords = ['fill', 'create goals', 'add goals', 'set goals', 'generate goals', 'make goals', 'setup goals', 'set up goals'];
    const wantsFill = fillKeywords.some(k => userMsg.toLowerCase().includes(k));

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);

    if (wantsFill && onFillGoals) {
      setMode('fill-goals');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I'll help you create goals! Just describe what you want to achieve and I'll generate them for you.\n\nFor example: "I want to improve team productivity, reduce bugs, and complete the API migration by Q3"\n\nType your goal description below and click "Generate Goals" ✨`,
      }]);
      return;
    }

    setLoading(true);
    try {
      const reply = await chatWithAssistant(newMessages, {
        role: user.role,
        department: user.department,
        name: user.name,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble responding. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleFillGoals() {
    if (!input.trim() || !user || !onFillGoals) return;
    const prompt = input.trim();
    setInput('');
    setFillLoading(true);
    setFillError(null);

    setMessages(prev => [...prev, { role: 'user', content: prompt }]);

    try {
      const goals = await fillGoalsFromPrompt(prompt, user.department, currentGoalCount, currentWeightage);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ Generated ${goals.length} goals for you!\n\n${goals.map((g, i) => `${i + 1}. **${g.title}** (${g.thrustArea}, ${g.weightage}%)`).join('\n')}\n\nClick "Apply Goals" to add them to your sheet.`,
      }]);
      onFillGoals(goals);
      setMode('chat');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate goals';
      setFillError(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I couldn't generate goals: ${msg}. Please try a different description.` }]);
    } finally {
      setFillLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#1f0c25] to-[#2d1238] text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#1f0c25] focus:ring-offset-2"
        aria-label="Open AI assistant"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )}
        {/* Pulse ring */}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-[#1f0c25]/60 animate-ping opacity-30" />
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl ring-1 ring-gray-200 overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1f0c25] to-[#2d1238] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">GoalTrack AI</p>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
                  <p className="text-xs text-white/70">Gemini 2.0 Flash</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setMessages([]); setMode('chat'); }}
              className="text-white/60 hover:text-white text-xs transition-colors"
              title="Clear chat"
            >
              Clear
            </button>
          </div>

          {/* Mode indicator */}
          {mode === 'fill-goals' && (
            <div className="bg-[#2d1238]/5 border-b border-[#2d1238]/10 px-4 py-2 flex items-center justify-between">
              <p className="text-xs font-medium text-[#2d1238]">✨ Goal Generation Mode</p>
              <button onClick={() => setMode('chat')} className="text-xs text-[#2d1238]/70 hover:text-[#2d1238]">
                Back to chat
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="h-72 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#1f0c25] text-white rounded-br-sm'
                    : 'bg-white text-gray-800 rounded-bl-sm shadow-sm ring-1 ring-gray-100'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {(loading || fillLoading) && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm ring-1 ring-gray-100">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#1f0c25] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#1f0c25] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#1f0c25] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          {messages.length <= 1 && (
            <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-gray-100 bg-white">
              {[
                'How do I submit my goals?',
                'Fill my goals automatically',
                'What is weightage?',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="rounded-full border border-[#1f0c25]/20 bg-[#1f0c25]/5 px-2.5 py-1 text-xs text-[#1f0c25] hover:bg-[#1f0c25]/10 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-100 p-3 bg-white">
            {fillError && <p className="mb-2 text-xs text-red-500">{fillError}</p>}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    mode === 'fill-goals' ? handleFillGoals() : sendMessage();
                  }
                }}
                placeholder={mode === 'fill-goals' ? 'Describe your goals…' : 'Ask anything…'}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#1f0c25] focus:outline-none focus:ring-1 focus:ring-[#1f0c25] transition-colors"
              />
              <button
                onClick={mode === 'fill-goals' ? handleFillGoals : sendMessage}
                disabled={!input.trim() || loading || fillLoading}
                className="rounded-xl bg-[#1f0c25] px-3 py-2 text-white hover:bg-[#2d1238] disabled:opacity-40 transition-colors"
              >
                {mode === 'fill-goals' ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            {mode === 'fill-goals' && (
              <p className="mt-1.5 text-xs text-gray-400 text-center">
                Describe your goals in plain English — AI will create them for you
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default FloatingBot;
