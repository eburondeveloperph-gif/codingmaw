/**
 * Orchestrator — Intent Detection & Skill Routing
 * Detects what the user wants and delegates to the right agent/skill.
 * All skills are accessed from a single input field.
 */

export type SkillIntent =
  | 'code'        // Generate HTML/CSS/JS/Three.js apps
  | 'browse'      // Web search, navigate, scrape
  | 'chat'        // General conversation, questions
  | 'translate'   // Translation tasks
  | 'codemax'     // Complex multi-step coding (agent)
  | 'orbit'       // General assistant (agent)
  | 'debug'       // Debug code errors
  | 'explain'     // Explain concepts
  | 'summarize'   // Summarize text
  | 'math';       // Math/logic problems

interface IntentResult {
  skill: SkillIntent;
  confidence: number;
}

const PATTERNS: { skill: SkillIntent; patterns: RegExp[]; weight: number }[] = [
  // Browse — highest priority for explicit web requests
  {
    skill: 'browse',
    weight: 1.0,
    patterns: [
      /\b(browse|navigate|go to|open|visit)\b.*\b(website|site|page|url|http)/i,
      /\b(search|google|look up|find)\b.*\b(for|about|on the web|online)\b/i,
      /\bhttps?:\/\//i,
      /\b(search|browse)\s+(the\s+)?(web|internet|google)\b/i,
      /\b(scrape|extract|crawl)\b.*\b(from|website|page)\b/i,
      /\b(sign up|register|create account|login|log in)\b.*\b(on|at|to)\b/i,
    ],
  },
  // Code generation — generate apps, UIs, visualizations
  {
    skill: 'code',
    weight: 0.9,
    patterns: [
      /\b(build|create|make|generate|design|code|develop)\b.*\b(app|website|page|dashboard|landing|ui|component|form|game|animation|visualization|3d|three\.?js)\b/i,
      /\b(html|css|javascript|react|vue|svelte|tailwind|three\.?js|canvas|webgl)\b/i,
      /\b(build|create|make)\b.*\b(with|using)\b.*\b(html|css|js|javascript)\b/i,
      /\b(generate|create|build)\b.*\b(full|complete|production|responsive)\b/i,
      /\b(landing page|web app|dashboard|portfolio|todo|calculator|clock|weather)\b/i,
    ],
  },
  // Debug
  {
    skill: 'debug',
    weight: 0.8,
    patterns: [
      /\b(debug|fix|error|bug|issue|broken|not working|crash|exception|traceback|stack trace)\b/i,
      /\b(why|how come)\b.*\b(not|doesn't|won't|can't)\b.*\b(work|run|compile|load)\b/i,
    ],
  },
  // Translate
  {
    skill: 'translate',
    weight: 0.85,
    patterns: [
      /\b(translate|translation|convert)\b.*\b(to|into|from)\b.*\b(english|spanish|french|german|japanese|chinese|korean|tagalog|filipino|arabic|hindi|portuguese|italian|russian|dutch)\b/i,
      /\b(translate|salin|isalin)\b/i,
    ],
  },
  // Math
  {
    skill: 'math',
    weight: 0.7,
    patterns: [
      /\b(solve|calculate|compute|evaluate|prove|derive)\b/i,
      /\b(equation|integral|derivative|matrix|probability|statistics)\b/i,
      /\d+\s*[\+\-\*\/\^]\s*\d+/,
    ],
  },
  // Explain
  {
    skill: 'explain',
    weight: 0.6,
    patterns: [
      /\b(explain|what is|what are|how does|how do|define|describe|tell me about)\b/i,
      /\b(eli5|in simple terms|for beginners)\b/i,
    ],
  },
  // Summarize
  {
    skill: 'summarize',
    weight: 0.65,
    patterns: [
      /\b(summarize|summary|condense|key points|tldr|tl;dr)\b/i,
    ],
  },
  // Chat — lowest priority fallback
  {
    skill: 'chat',
    weight: 0.3,
    patterns: [
      /\b(hi|hello|hey|sup|yo|good morning|good evening)\b/i,
      /\b(how are you|what's up|who are you)\b/i,
      /\b(opinion|think|feel|believe)\b/i,
    ],
  },
];

/**
 * Detect the user's intent from their prompt text.
 * Returns the best matching skill and confidence score.
 */
export function detectIntent(text: string): IntentResult {
  const lower = text.toLowerCase().trim();
  let best: IntentResult = { skill: 'code', confidence: 0.5 }; // default to code mode

  for (const { skill, patterns, weight } of PATTERNS) {
    const matchCount = patterns.filter(p => p.test(lower)).length;
    if (matchCount > 0) {
      const confidence = Math.min(1, (matchCount / patterns.length) * weight + 0.3);
      if (confidence > best.confidence) {
        best = { skill, confidence };
      }
    }
  }

  return best;
}

/**
 * Map a skill intent to the appropriate app mode.
 * Returns the appMode to use and whether to use agent routing.
 */
export function routeSkill(intent: IntentResult): {
  appMode: 'code' | 'chat';
  useAgent: boolean;
  agentSkill?: string;
  label: string;
} {
  switch (intent.skill) {
    case 'code':
    case 'debug':
      return { appMode: 'code', useAgent: false, label: 'Code' };
    case 'browse':
      return { appMode: 'code', useAgent: true, agentSkill: 'web_browse', label: 'Browse' };
    case 'codemax':
      return { appMode: 'code', useAgent: true, agentSkill: 'codemax', label: 'CodeMax' };
    case 'orbit':
      return { appMode: 'chat', useAgent: true, agentSkill: 'orbit', label: 'Orbit' };
    case 'translate':
      return { appMode: 'chat', useAgent: false, label: 'Translate' };
    case 'math':
      return { appMode: 'chat', useAgent: false, label: 'Math' };
    case 'explain':
      return { appMode: 'chat', useAgent: false, label: 'Explain' };
    case 'summarize':
      return { appMode: 'chat', useAgent: false, label: 'Summarize' };
    case 'chat':
    default:
      return { appMode: 'chat', useAgent: false, label: 'Chat' };
  }
}
