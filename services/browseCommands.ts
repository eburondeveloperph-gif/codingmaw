/**
 * Browse Command Parser & Executor
 * Extracts ```browse JSON blocks from agent streaming text and executes them
 * against the Playwright browse service.
 */

export interface BrowseCommand {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  direction?: string;
  script?: string;
  key?: string;        // press: Enter, Tab, Escape, etc.
  value?: string;      // select: dropdown option value
  from?: string;       // drag: source selector
  to?: string;         // drag: target selector
  timeout?: number;    // wait: ms to wait
  delay?: number;      // type_slow: ms between keystrokes
  checked?: boolean;   // check: true/false
  file?: string;       // upload: file path
  fields?: { selector: string; value: string }[]; // fill: multiple fields
}

export interface BrowseResult {
  ok?: boolean;
  url?: string;
  title?: string;
  screenshot?: string;
  text?: string;
  links?: { text: string; href: string }[];
  inputs?: { tag: string; type: string; name: string; id: string; placeholder: string; selector: string }[];
  error?: string;
}

const BROWSE_BASE = typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')
  ? '/api/browse'
  : 'http://168.231.78.113:18790';

/** Extract all ```browse {...} ``` blocks from text */
export function parseBrowseCommands(text: string): BrowseCommand[] {
  const commands: BrowseCommand[] = [];
  const regex = /```browse\s*\n?\s*(\{[\s\S]*?\})\s*\n?```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const cmd = JSON.parse(match[1]);
      if (cmd.action) commands.push(cmd);
    } catch {
      // skip malformed JSON
    }
  }
  return commands;
}

/** Extract NEW commands that haven't been seen yet */
export function parseNewCommands(fullText: string, executedCount: number): BrowseCommand[] {
  const all = parseBrowseCommands(fullText);
  return all.slice(executedCount);
}

/** Execute a single browse command */
export async function executeBrowseCommand(cmd: BrowseCommand, session = 'agent'): Promise<BrowseResult> {
  const { action, ...params } = cmd;
  try {
    const res = await fetch(`${BROWSE_BASE}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, ...params }),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/** Detect if a user message has browse/search intent */
export function hasBrowseIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /\b(browse|navigate|go to|open|visit)\b.*\b(website|site|page|url|http)/,
    /\b(search|google|look up|find)\b.*\b(for|about|on the web|online)\b/,
    /\b(sign up|register|create account|login|log in)\b.*\b(on|at|to)\b/,
    /\bhttps?:\/\//,
    /\b(browse|navigate to|go to|open up|visit)\b\s+\w/,
    /\bsearch\s+(the\s+)?(web|internet|google)\b/,
    /\b(scrape|extract|crawl)\b.*\b(from|website|page)\b/,
  ];
  return patterns.some(p => p.test(lower));
}
