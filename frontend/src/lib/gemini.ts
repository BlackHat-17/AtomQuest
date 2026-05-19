/**
 * Gemini AI service — wraps the Google Generative AI REST API.
 * All features are silently disabled when VITE_GEMINI_API_KEY is absent.
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export const geminiEnabled = Boolean(API_KEY);

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

async function callGemini(prompt: string): Promise<string> {
  if (!API_KEY) throw new Error('Gemini API key not configured');

  const res = await fetch(`${BASE_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const data: GeminiResponse = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Extract JSON from AI response, handling markdown code blocks and other formatting
 */
function extractJSON(text: string): string | null {
  // Try to extract from markdown code block first
  const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (markdownMatch) {
    return markdownMatch[1].trim();
  }
  
  // Check for incomplete markdown block (has opening but no closing)
  if (text.includes('```json') || text.includes('```')) {
    // Extract everything after the opening marker
    const incompleteMatch = text.match(/```(?:json)?\s*([\s\S]*)/);
    if (incompleteMatch) {
      const extracted = incompleteMatch[1].trim();
      // Try to parse it anyway - might be valid JSON
      try {
        JSON.parse(extracted);
        return extracted;
      } catch {
        // If it's not valid JSON, it's truly incomplete
        console.warn('Incomplete markdown code block detected - response may be truncated');
      }
    }
  }
  
  // Try to find raw JSON array or object
  const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    return jsonArrayMatch[0];
  }
  
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    return jsonObjectMatch[0];
  }
  
  return null;
}

// ─── Feature: Goal suggestions ────────────────────────────────────────────────

export interface GoalSuggestion {
  title: string;
  description: string;
  thrustArea: string;
  uomType: string;
  suggestedTarget: string;
  weightage: number;
}

export async function suggestGoals(
  role: string,
  department: string,
  existingGoals: string[],
  existingGoalCount: number = 0,
  existingWeightage: number = 0
): Promise<GoalSuggestion[]> {
  const existing = existingGoals.length > 0
    ? `Existing goals: ${existingGoals.join(', ')}.`
    : 'No existing goals yet.';

  const maxGoals = Math.min(8 - existingGoalCount, 3);
  const remainingWeightage = 100 - existingWeightage;

  if (maxGoals <= 0) {
    throw new Error('Cannot suggest more goals - maximum of 8 goals reached.');
  }

  if (remainingWeightage <= 0) {
    throw new Error('Cannot suggest more goals - total weightage already at 100%.');
  }

  const prompt = `You are a performance management expert. Suggest ${maxGoals} SMART goals for an employee.
Role: ${role}
Department: ${department}
${existing}
Current goal count: ${existingGoalCount} / 8
Current total weightage: ${existingWeightage}%
Remaining weightage available: ${remainingWeightage}%

Return ONLY a valid JSON array (no markdown, no explanation) with exactly ${maxGoals} objects.
The weightage values MUST sum to exactly ${remainingWeightage}% (not more, not less).

[
  {
    "title": "short goal title",
    "description": "1-2 sentence description",
    "thrustArea": "one of: Revenue, Cost, Quality, Delivery, Safety, People, Innovation, Customer",
    "uomType": "one of: NUMERIC_MIN, NUMERIC_MAX, TIMELINE, ZERO",
    "suggestedTarget": "e.g. 100 or 2025-12-31",
    "weightage": ${Math.floor(remainingWeightage / maxGoals)}
  }
]

CRITICAL: The sum of all weightage values MUST equal ${remainingWeightage}%.`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) {
    console.error('Failed to extract JSON from Gemini response:', text);
    throw new Error('Could not parse goal suggestions. The AI response may be incomplete or in an unexpected format.');
  }
  try {
    return JSON.parse(jsonText) as GoalSuggestion[];
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    console.error('Extracted text:', jsonText);
    throw new Error('Could not parse goal suggestions. The AI returned invalid JSON.');
  }
}

// ─── Feature: Achievement analysis ───────────────────────────────────────────

export interface AchievementInsight {
  overallScore: string;
  trend: 'improving' | 'declining' | 'stable';
  strengths: string[];
  improvements: string[];
  recommendation: string;
}

export async function analyzeAchievements(
  goals: Array<{ title: string; uomType: string; target: string; achievements: Array<{ quarter: string; actual: string; score: number }> }>
): Promise<AchievementInsight> {
  const goalsText = goals.map(g => {
    const achText = g.achievements.map(a => `${a.quarter}: actual=${a.actual}, score=${(a.score * 100).toFixed(0)}%`).join(', ');
    return `- ${g.title} (${g.uomType}, target: ${g.target}): ${achText || 'no data yet'}`;
  }).join('\n');

  const prompt = `Analyze this employee's goal achievement data and provide insights.

Goals and achievements:
${goalsText}

Return ONLY valid JSON (no markdown):
{
  "overallScore": "e.g. 78%",
  "trend": "improving|declining|stable",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["area 1", "area 2"],
  "recommendation": "1-2 sentence actionable recommendation"
}`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) {
    console.error('Failed to extract JSON from Gemini response:', text);
    throw new Error('Could not parse achievement analysis. The AI response may be incomplete or in an unexpected format.');
  }
  try {
    return JSON.parse(jsonText) as AchievementInsight;
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    console.error('Extracted text:', jsonText);
    throw new Error('Could not parse achievement analysis. The AI returned invalid JSON.');
  }
}

// ─── Feature: Goal description writer ────────────────────────────────────────

export async function writeGoalDescription(
  title: string,
  thrustArea: string,
  uomType: string
): Promise<string> {
  const prompt = `Write a concise, professional 1-2 sentence SMART goal description for:
Title: "${title}"
Thrust Area: ${thrustArea}
Measurement Type: ${uomType}

Return ONLY the description text, no quotes, no explanation.`;

  return callGemini(prompt);
}

// ─── Feature: Chat assistant ──────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithAssistant(
  messages: ChatMessage[],
  userContext: { role: string; department: string; name: string }
): Promise<string> {
  const systemContext = `You are GoalTrack AI, a helpful performance management assistant for ${userContext.name} (${userContext.role} in ${userContext.department} department). 
Help with goal setting, achievement tracking, performance improvement, and career development.
Be concise, practical, and encouraging. Keep responses under 150 words.`;

  const conversationHistory = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `${systemContext}

Conversation:
${conversationHistory}

Assistant:`;

  return callGemini(prompt);
}

// ─── Feature: Team performance summary (Manager) ─────────────────────────────

export async function summarizeTeamPerformance(
  teamData: Array<{ name: string; status: string; checkInStatus: string }>
): Promise<string> {
  const summary = teamData.map(m => `${m.name}: sheet=${m.status}, checkin=${m.checkInStatus}`).join('; ');

  const prompt = `As a management coach, provide a brief 2-3 sentence summary and one actionable tip for this team's goal progress:
${summary}

Be encouraging and specific. Return only the summary text.`;

  return callGemini(prompt);
}

// ─── Feature: Fill goals form from a natural language prompt ─────────────────

export interface GoalFromPrompt {
  title: string;
  description: string;
  thrustArea: string;
  uomType: string;
  target: string;
  weightage: number;
}

export async function fillGoalsFromPrompt(
  prompt: string,
  department: string,
  existingGoalCount: number
): Promise<GoalFromPrompt[]> {
  const maxGoals = Math.min(8 - existingGoalCount, 5);
  const aiPrompt = `You are a performance management expert. The user wants to set goals based on this request:
"${prompt}"

Department: ${department}
They can add up to ${maxGoals} more goals. Total weightage of ALL goals must sum to 100%.
${existingGoalCount > 0 ? `They already have ${existingGoalCount} goals. Distribute remaining weightage accordingly.` : 'Distribute weightage evenly across the goals you create.'}

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "title": "concise goal title",
    "description": "1-2 sentence SMART description",
    "thrustArea": "one of: Revenue, Cost, Quality, Delivery, Safety, People, Innovation, Customer",
    "uomType": "one of: NUMERIC_MIN, NUMERIC_MAX, TIMELINE, ZERO",
    "target": "numeric value or YYYY-MM-DD date",
    "weightage": 25
  }
]

Rules:
- weightage values must sum to exactly 100 if no existing goals, or to (100 - existing_weightage) if there are existing goals
- uomType NUMERIC_MIN = higher is better (revenue, units), NUMERIC_MAX = lower is better (cost, errors), TIMELINE = deadline, ZERO = zero incidents
- target must be a plain number (e.g. "100") or date (e.g. "2025-12-31")`;

  const text = await callGemini(aiPrompt);
  const jsonText = extractJSON(text);
  if (!jsonText) {
    console.error('Failed to extract JSON from Gemini response:', text);
    throw new Error('Could not parse goals from prompt. The AI response may be incomplete or in an unexpected format.');
  }
  try {
    return JSON.parse(jsonText) as GoalFromPrompt[];
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    console.error('Extracted text:', jsonText);
    throw new Error('Could not parse goals from prompt. The AI returned invalid JSON.');
  }
}
