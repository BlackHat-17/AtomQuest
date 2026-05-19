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

// ─── Feature: Goal progress prediction ───────────────────────────────────────

export interface ProgressPrediction {
  predictedYearEndScore: string;
  confidence: 'high' | 'medium' | 'low';
  trajectory: 'on-track' | 'at-risk' | 'ahead' | 'behind';
  quarterlyForecast: { quarter: string; predictedScore: string }[];
  keyDrivers: string[];
  actionItems: string[];
}

export async function predictYearEndPerformance(
  goals: Array<{
    title: string;
    weightage: number;
    achievements: Array<{ quarter: string; actual: string; score: number }>;
  }>
): Promise<ProgressPrediction> {
  const goalsText = goals.map(g => {
    const ach = g.achievements.map(a => `${a.quarter}: score=${(a.score * 100).toFixed(0)}%`).join(', ');
    return `- ${g.title} (weight: ${g.weightage}%): ${ach || 'no data yet'}`;
  }).join('\n');

  const prompt = `You are a performance analytics expert. Based on quarterly achievement data, predict year-end performance.

Goals and current progress:
${goalsText}

Return ONLY valid JSON (no markdown):
{
  "predictedYearEndScore": "e.g. 82%",
  "confidence": "high|medium|low",
  "trajectory": "on-track|at-risk|ahead|behind",
  "quarterlyForecast": [
    { "quarter": "Q3", "predictedScore": "79%" },
    { "quarter": "Q4", "predictedScore": "84%" }
  ],
  "keyDrivers": ["key factor 1", "key factor 2"],
  "actionItems": ["specific action 1", "specific action 2"]
}`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) throw new Error('Could not parse performance prediction.');
  return JSON.parse(jsonText) as ProgressPrediction;
}

// ─── Feature: Smart check-in questions ───────────────────────────────────────

export interface CheckInQuestions {
  openingQuestion: string;
  progressQuestions: string[];
  blockerQuestions: string[];
  supportQuestion: string;
  closingQuestion: string;
}

export async function generateCheckInQuestions(
  employeeName: string,
  goals: Array<{ title: string; status: string; lastAchievement?: string }>,
  quarter: string
): Promise<CheckInQuestions> {
  const goalsText = goals.map(g =>
    `- ${g.title} (status: ${g.status}${g.lastAchievement ? `, last update: ${g.lastAchievement}` : ''})`
  ).join('\n');

  const prompt = `You are an expert management coach. Generate tailored, empathetic check-in questions for a ${quarter} performance conversation.

Employee: ${employeeName}
Goals:
${goalsText}

Generate specific, open-ended questions that encourage honest dialogue. Avoid generic questions.

Return ONLY valid JSON (no markdown):
{
  "openingQuestion": "a warm, engaging opener",
  "progressQuestions": ["specific question about goal 1", "specific question about goal 2"],
  "blockerQuestions": ["what obstacles question", "what support question"],
  "supportQuestion": "what can I do as your manager question",
  "closingQuestion": "forward-looking closing question"
}`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) throw new Error('Could not parse check-in questions.');
  return JSON.parse(jsonText) as CheckInQuestions;
}

// ─── Feature: SMART goal quality review ──────────────────────────────────────

export interface GoalQualityReview {
  score: number; // 0-100
  grade: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  isSpecific: boolean;
  isMeasurable: boolean;
  isAchievable: boolean;
  isRelevant: boolean;
  isTimeBound: boolean;
  strengths: string[];
  improvements: string[];
  rewrittenGoal: string;
  rewrittenDescription: string;
}

export async function reviewGoalQuality(goal: {
  title: string;
  description: string;
  thrustArea: string;
  uomType: string;
  target: string;
  weightage: number;
}): Promise<GoalQualityReview> {
  const prompt = `You are a performance management expert. Critically evaluate this goal against SMART criteria and provide a rewrite.

Goal Title: "${goal.title}"
Description: "${goal.description}"
Thrust Area: ${goal.thrustArea}
Measurement Type: ${goal.uomType}
Target: ${goal.target}
Weightage: ${goal.weightage}%

Return ONLY valid JSON (no markdown):
{
  "score": 75,
  "grade": "Good",
  "isSpecific": true,
  "isMeasurable": true,
  "isAchievable": true,
  "isRelevant": true,
  "isTimeBound": false,
  "strengths": ["clear metric", "aligned to thrust area"],
  "improvements": ["add deadline", "be more specific about method"],
  "rewrittenGoal": "improved title",
  "rewrittenDescription": "improved 1-2 sentence SMART description"
}`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) throw new Error('Could not parse goal quality review.');
  return JSON.parse(jsonText) as GoalQualityReview;
}

// ─── Feature: Performance review draft ───────────────────────────────────────

export interface PerformanceReviewDraft {
  summary: string;
  accomplishments: string[];
  areasForGrowth: string[];
  managerComment: string;
  selfAssessmentPrompt: string;
  overallRating: 'Exceptional' | 'Exceeds Expectations' | 'Meets Expectations' | 'Needs Improvement';
}

export async function generatePerformanceReviewDraft(
  employee: { name: string; role: string; department: string },
  goals: Array<{
    title: string;
    weightage: number;
    achievements: Array<{ quarter: string; score: number; actual: string }>;
  }>,
  perspective: 'manager' | 'self'
): Promise<PerformanceReviewDraft> {
  const goalsText = goals.map(g => {
    const avg = g.achievements.length
      ? (g.achievements.reduce((s, a) => s + a.score, 0) / g.achievements.length * 100).toFixed(0)
      : 'N/A';
    return `- ${g.title} (weight: ${g.weightage}%, avg score: ${avg}%)`;
  }).join('\n');

  const prompt = `You are writing a ${perspective === 'manager' ? 'manager' : 'self'} performance review for an employee.

Employee: ${employee.name}
Role: ${employee.role}
Department: ${employee.department}

Goal Performance:
${goalsText}

Write a professional, balanced, and specific review. Be honest about areas needing growth while recognizing achievements.

Return ONLY valid JSON (no markdown):
{
  "summary": "2-3 sentence overall performance summary",
  "accomplishments": ["specific accomplishment 1", "specific accomplishment 2", "specific accomplishment 3"],
  "areasForGrowth": ["development area 1", "development area 2"],
  "managerComment": "2-3 sentence ${perspective === 'manager' ? 'manager' : 'reflective'} comment",
  "selfAssessmentPrompt": "A question to prompt deeper ${perspective === 'manager' ? 'employee' : 'self'} reflection",
  "overallRating": "Meets Expectations"
}`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) throw new Error('Could not parse performance review draft.');
  return JSON.parse(jsonText) as PerformanceReviewDraft;
}

// ─── Feature: Goal risk detection ────────────────────────────────────────────

export interface GoalRisk {
  goalTitle: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  riskReason: string;
  recommendedAction: string;
  timeToIntervene: string;
}

export interface RiskAssessment {
  overallRisk: 'critical' | 'high' | 'medium' | 'low';
  atRiskGoals: GoalRisk[];
  onTrackGoals: string[];
  immediateActions: string[];
}

export async function assessGoalRisks(
  goals: Array<{
    title: string;
    weightage: number;
    status: string;
    achievements: Array<{ quarter: string; score: number }>;
  }>,
  currentQuarter: string
): Promise<RiskAssessment> {
  const goalsText = goals.map(g => {
    const scores = g.achievements.map(a => `${a.quarter}:${(a.score * 100).toFixed(0)}%`).join(', ');
    return `- ${g.title} | weight:${g.weightage}% | status:${g.status} | scores:[${scores || 'none'}]`;
  }).join('\n');

  const prompt = `You are a performance risk analyst. Assess which goals are at risk of not being achieved by year-end.

Current Quarter: ${currentQuarter}
Goals:
${goalsText}

A goal is "critical" if score < 50%, "high" if 50-65%, "medium" if 65-80%, "low/on-track" if > 80%.
Consider weightage — high-weight goals with low scores are higher risk.

Return ONLY valid JSON (no markdown):
{
  "overallRisk": "medium",
  "atRiskGoals": [
    {
      "goalTitle": "goal name",
      "riskLevel": "high",
      "riskReason": "why this goal is at risk",
      "recommendedAction": "specific intervention",
      "timeToIntervene": "e.g. within 2 weeks"
    }
  ],
  "onTrackGoals": ["goal title 1", "goal title 2"],
  "immediateActions": ["priority action 1", "priority action 2"]
}`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) throw new Error('Could not parse risk assessment.');
  return JSON.parse(jsonText) as RiskAssessment;
}

// ─── Feature: Goal-to-OKR converter ──────────────────────────────────────────

export interface OKR {
  objective: string;
  keyResults: Array<{
    description: string;
    metric: string;
    baseline: string;
    target: string;
    unit: string;
  }>;
  alignedThemes: string[];
}

export async function convertGoalsToOKR(
  goals: Array<{ title: string; description: string; thrustArea: string; target: string }>,
  teamName: string
): Promise<OKR> {
  const goalsText = goals.map(g =>
    `- ${g.title}: ${g.description} (thrust: ${g.thrustArea}, target: ${g.target})`
  ).join('\n');

  const prompt = `You are an OKR expert. Convert these individual performance goals into a cohesive OKR framework.

Team/Department: ${teamName}
Goals:
${goalsText}

Group related goals into a single inspiring Objective with measurable Key Results.

Return ONLY valid JSON (no markdown):
{
  "objective": "A qualitative, inspiring objective statement",
  "keyResults": [
    {
      "description": "what we will achieve",
      "metric": "what we measure",
      "baseline": "current state",
      "target": "end state",
      "unit": "%, units, days, etc."
    }
  ],
  "alignedThemes": ["Strategic theme 1", "Strategic theme 2"]
}`;

  const text = await callGemini(prompt);
  const jsonText = extractJSON(text);
  if (!jsonText) throw new Error('Could not parse OKR conversion.');
  return JSON.parse(jsonText) as OKR;
}

