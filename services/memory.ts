/**
 * Eburon AI — Agent Memory Service
 * Context memory (session) + Long-term memory (localStorage)
 *
 * Stores:
 * - User preferences and patterns
 * - Past code generation summaries
 * - Design preferences learned over time
 * - Project context and tech stack info
 * - Improvement history (x10 iterations)
 */

const STORAGE_KEY = 'eburon-agent-memory';
const MAX_LONG_TERM_ENTRIES = 100;
const MAX_CONTEXT_ENTRIES = 20;

export interface MemoryEntry {
  id: string;
  type: 'preference' | 'code_summary' | 'design_pattern' | 'tech_stack' | 'improvement' | 'note';
  content: string;
  timestamp: number;
  tags: string[];
}

export interface AgentMemory {
  longTerm: MemoryEntry[];
  context: MemoryEntry[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Load long-term memory from localStorage */
export function loadLongTermMemory(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Save long-term memory to localStorage */
function saveLongTermMemory(entries: MemoryEntry[]): void {
  try {
    const trimmed = entries.slice(-MAX_LONG_TERM_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

/** Add a memory entry to long-term storage */
export function addLongTermMemory(
  type: MemoryEntry['type'],
  content: string,
  tags: string[] = []
): MemoryEntry {
  const entry: MemoryEntry = {
    id: generateId(),
    type,
    content,
    timestamp: Date.now(),
    tags,
  };
  const existing = loadLongTermMemory();
  existing.push(entry);
  saveLongTermMemory(existing);
  return entry;
}

/** Remove a memory entry by ID */
export function removeLongTermMemory(id: string): void {
  const existing = loadLongTermMemory();
  saveLongTermMemory(existing.filter(e => e.id !== id));
}

/** Clear all long-term memory */
export function clearLongTermMemory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Extract code summary from generated code for memory */
export function summarizeCode(code: string): string {
  const lines = code.split('\n');
  const title = lines.find(l => /<title>(.*?)<\/title>/.test(l))?.match(/<title>(.*?)<\/title>/)?.[1] || '';
  const hasNav = code.includes('<nav') || code.includes('bottom-nav') || code.includes('navbar');
  const hasDarkMode = code.includes('dark-mode') || code.includes('theme') || code.includes('prefers-color-scheme');
  const hasGrid = code.includes('grid') || code.includes('flex');
  const hasAnimation = code.includes('@keyframes') || code.includes('animation');
  const hasForm = code.includes('<form') || code.includes('<input');
  const lineCount = lines.length;

  const features: string[] = [];
  if (title) features.push(`title: "${title}"`);
  if (hasNav) features.push('navigation');
  if (hasDarkMode) features.push('dark mode');
  if (hasGrid) features.push('grid/flex layout');
  if (hasAnimation) features.push('animations');
  if (hasForm) features.push('forms');
  features.push(`${lineCount} lines`);

  return features.join(', ');
}

/** Auto-learn from a code generation: extract patterns and save */
export function learnFromGeneration(userPrompt: string, code: string): void {
  const summary = summarizeCode(code);
  addLongTermMemory('code_summary', `User asked: "${userPrompt.slice(0, 100)}". Generated: ${summary}`, ['auto']);

  // Learn design patterns
  if (code.includes('backdrop-filter')) addLongTermMemory('design_pattern', 'User likes glassmorphism effects', ['design', 'auto']);
  if (code.includes('linear-gradient') || code.includes('radial-gradient')) addLongTermMemory('design_pattern', 'User likes gradient effects', ['design', 'auto']);
  if (code.includes('dark') && code.includes('light')) addLongTermMemory('design_pattern', 'User expects dark/light mode toggle', ['design', 'auto']);

  // Deduplicate design patterns
  const ltm = loadLongTermMemory();
  const patterns = ltm.filter(e => e.type === 'design_pattern');
  const seen = new Set<string>();
  const deduped = patterns.filter(e => {
    if (seen.has(e.content)) return false;
    seen.add(e.content);
    return true;
  });
  const nonPatterns = ltm.filter(e => e.type !== 'design_pattern');
  saveLongTermMemory([...nonPatterns, ...deduped]);
}

/** Build a memory context string to inject into the system prompt */
export function buildMemoryContext(): string {
  const ltm = loadLongTermMemory();
  if (ltm.length === 0) return '';

  const sections: string[] = ['═══ AGENT MEMORY (learned from past interactions) ═══'];

  // Recent code summaries (last 5)
  const codeSummaries = ltm.filter(e => e.type === 'code_summary').slice(-5);
  if (codeSummaries.length > 0) {
    sections.push('\nRECENT BUILDS:');
    codeSummaries.forEach(e => sections.push(`• ${e.content}`));
  }

  // Design preferences
  const designPatterns = ltm.filter(e => e.type === 'design_pattern');
  const uniquePatterns = [...new Set(designPatterns.map(e => e.content))];
  if (uniquePatterns.length > 0) {
    sections.push('\nLEARNED DESIGN PREFERENCES:');
    uniquePatterns.forEach(p => sections.push(`• ${p}`));
  }

  // Tech stack preferences
  const techStack = ltm.filter(e => e.type === 'tech_stack');
  if (techStack.length > 0) {
    sections.push('\nTECH STACK:');
    techStack.forEach(e => sections.push(`• ${e.content}`));
  }

  // User notes/preferences
  const prefs = ltm.filter(e => e.type === 'preference');
  if (prefs.length > 0) {
    sections.push('\nUSER PREFERENCES:');
    prefs.forEach(e => sections.push(`• ${e.content}`));
  }

  // Improvement history (last 3)
  const improvements = ltm.filter(e => e.type === 'improvement').slice(-3);
  if (improvements.length > 0) {
    sections.push('\nRECENT IMPROVEMENTS:');
    improvements.forEach(e => sections.push(`• ${e.content}`));
  }

  sections.push('\n═══ Use this memory to personalize and improve output. ═══');
  return sections.join('\n');
}

/** Build the x10 improvement prompt */
export function buildX10Prompt(originalPrompt: string, currentCode: string): string {
  return `You previously generated code for: "${originalPrompt}"

Here is the CURRENT code (use as reference — DO NOT start from scratch):

\`\`\`html
${currentCode}
\`\`\`

═══════════════════════════════════════════════════
X10 IMPROVEMENT PROTOCOL — MANDATORY
═══════════════════════════════════════════════════

Take the code above and improve it 10X. This means:

1. VISUAL UPGRADE: Add premium ambient background effects (gradient orbs, mesh, aurora).
   Add micro-interactions on EVERY interactive element. Make shadows layered and realistic.
   Improve typography with better font pairing and weight hierarchy.

2. COMPLETENESS: Every button must work. Every link must navigate. Every form must validate.
   Add loading states, empty states, error states. Nothing can be incomplete.

3. RESPONSIVE PERFECTION: Add or improve mobile bottom navigation. Test all breakpoints.
   Touch targets 44px+. Mobile-first fluid typography with clamp().

4. ANIMATIONS: Add staggered entry animations. Smooth transitions between states.
   Hover effects on cards (translateY + shadow). Button press feedback (scale 0.97).
   Page load animation. Scroll-triggered reveals.

5. DARK MODE: Add or improve dark/light toggle with proper color mapping.
   Persist preference in localStorage. Smooth transition between modes.

6. ICONS: Replace any text-only buttons with icon + label. Use Lucide CDN or inline SVG.
   Wrap feature icons in soft-colored circle backgrounds.

7. STATE MANAGEMENT: Add proper JavaScript state handling. Data should persist in localStorage.
   Toast notifications for user feedback. Confirmation dialogs for destructive actions.

8. POLISH: Rounded corners consistently. Consistent spacing scale. No orphaned elements.
   Footer with branding. Favicon via inline SVG. Meta tags for SEO.

9. PERFORMANCE: Lazy-load images. Use CSS containment. Minimize reflows.
   Debounce search/filter inputs. Use requestAnimationFrame for animations.

10. WOW FACTOR: Add ONE signature element that makes this stand out —
    a hero animation, a custom cursor effect, a parallax section, or a creative loading screen.

OUTPUT THE COMPLETE IMPROVED CODE. Not a diff. Not patches. The full file, top to bottom.
Do NOT omit any section. Do NOT truncate. Every line must be present.`;
}
