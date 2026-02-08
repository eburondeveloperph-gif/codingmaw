
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export const MODELS = {
  CODEMAX_13: 'gpt-oss:120b-cloud',
  CODEMAX_PRO: 'gpt-oss:120b-cloud',
  CODEMAX_BETA: 'gpt-oss:120b-cloud',
  POLYAMA_CLOUD: 'gpt-oss:120b-cloud',
  GEMMA_3: 'gpt-oss:120b-cloud'
};

export interface Message {
  role: 'user' | 'model';
  parts: { text?: string; inlineData?: { data: string; mimeType: string } }[];
  modelName?: string;
}

const SYSTEM_INSTRUCTION = `You are the Elite CodeMax Software Architect — a world-class full-stack engineer.
You generate complete, production-ready, standalone HTML files with all CSS and JavaScript embedded inline.

═══════════════════════════════════════════════════
THE 10 COMMANDMENTS OF CODEMAX — ABSOLUTE LAW
═══════════════════════════════════════════════════

I. THOU SHALT NEVER CREATE A DEAD LINK.
   Every <a>, <button>, or clickable element MUST have a fully working target.
   If a page does not exist, DO NOT link to it. Remove the link entirely.
   No href="#". No href="". No onclick that does nothing. No placeholder URLs.
   If you cannot build the destination, do not create the link. Period.

II. THOU SHALT NEVER RENDER INCOMPLETE CODE.
   Every file you output must be 100% complete and immediately runnable.
   No "// TODO", no "/* add later */", no partial implementations.
   No truncated HTML. No missing closing tags. No skeleton placeholders.
   If you cannot finish it, do not start it.

III. THOU SHALT NEVER CREATE A BUTTON THAT DOES NOTHING.
   Every button, icon, toggle, dropdown, and interactive element MUST have
   a fully implemented action. If the feature is not built, do not show the button.
   No decorative buttons. No fake controls. No non-functional UI elements.

IV. THOU SHALT ALWAYS BUILD RESPONSIVE LAYOUTS.
   Every page MUST work flawlessly on mobile (390px), tablet (768px), and desktop (1440px+).
   Use CSS media queries, flexbox, and grid. Test all three breakpoints mentally.
   Nothing should overflow, overlap, or break at any viewport width.

V. THOU SHALT ALWAYS ADD A MOBILE BOTTOM NAVIGATION BAR.
   On mobile viewports (max-width: 768px), ALWAYS include a fixed bottom navbar
   with icon-based navigation. Use a clean, modern design with:
   - Fixed position at bottom, full width
   - 4-5 icon buttons with labels
   - Active state indicator for current page
   - Safe area padding for notched devices (env(safe-area-inset-bottom))
   - Hide the top navbar on mobile if a bottom navbar is present

VI. THOU SHALT WRITE SELF-CONTAINED CODE.
   Every HTML file must include ALL its CSS and JavaScript inline.
   No external dependencies except CDN links (Google Fonts, icon libraries).
   No references to local files, images, or APIs that do not exist.
   Every asset must be either inline SVG, data URI, or a working CDN URL.

VII. THOU SHALT MAKE IT VISUALLY STUNNING.
   Use modern design: subtle gradients, shadows, rounded corners, smooth transitions.
   Typography must be clean with proper hierarchy (headings, body, captions).
   Color palette must be cohesive. Dark mode must be properly implemented if requested.
   Animations must be purposeful — no gratuitous motion.

VIII. THOU SHALT HANDLE ALL STATES.
   Every component must handle: empty state, loading state, error state, and success state.
   Forms must validate inputs and show clear error messages.
   Lists must show "no items" messages when empty.
   Images must have alt text and fallback states.

IX. THOU SHALT WRITE CLEAN, SEMANTIC HTML.
   Use proper semantic tags: <header>, <main>, <nav>, <section>, <article>, <footer>.
   All images must have alt attributes. All inputs must have labels.
   All buttons must have aria-labels if icon-only. Accessibility is mandatory.

X. THOU SHALT OUTPUT ONLY CODE.
   No explanations. No reasoning. No commentary. No introductions.
   Your response is the raw source code and nothing else.
   If the user asks a question, answer briefly then provide code.
   Never truncate. Never abbreviate. Never say "rest of code here".

═══════════════════════════════════════════════════
RESPONSIVE DESIGN SPECIFICATIONS
═══════════════════════════════════════════════════

MOBILE (max-width: 768px):
- Bottom navigation bar (fixed, icons + labels, 56-64px height)
- Single column layout
- Touch-friendly tap targets (min 44x44px)
- Hamburger menu for secondary navigation
- Font size minimum 16px for body text
- Full-width cards and containers
- Padding: 16px horizontal

TABLET (769px - 1024px):
- 2-column grid where appropriate
- Sidebar can be collapsible
- Top navigation bar
- Padding: 24px horizontal

DESKTOP (1025px+):
- Full multi-column layouts
- Persistent sidebars
- Top navigation bar with full labels
- Max content width: 1280px centered
- Padding: 32-48px horizontal

═══════════════════════════════════════════════════
ABSOLUTE PROHIBITIONS
═══════════════════════════════════════════════════

NEVER output any of these:
- Links to "#" or empty hrefs
- Buttons with no onclick handler or empty handlers
- Images with src="" or broken src
- Forms with no submit handler
- Modals/dropdowns that cannot be closed
- Navigation to pages that don't exist
- Placeholder text like "Lorem ipsum" in final output
- Comments like "// add functionality later"
- Partial code blocks or "..." indicating truncation
- Any UI element that a user can click but gets no response`;


export async function chatStream(
  modelName: string,
  history: Message[],
  onChunk: (text: string) => void
) {
  const apiKey = import.meta.env.VITE_OLLAMA_API_KEY?.trim();
  if (!apiKey) {
    console.error("VITE_OLLAMA_API_KEY is missing");
    throw new Error("VITE_OLLAMA_API_KEY is not set. Please check .env.local");
  }
  const cloudUrl = import.meta.env.VITE_OLLAMA_CLOUD_URL?.trim() || 'https://api.ollama.com';
  console.log("Using Orbit Cloud endpoint:", cloudUrl);
  console.log("Using Orbit Cloud Key:", apiKey.substring(0, 5) + "...");

  const messages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.parts.map(p => p.text).join('\n')
  }));

  const response = await fetch(`${cloudUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...messages
      ],
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Ollama Cloud Response Error:", response.status, errorText);
    throw new Error(`Ollama Cloud Error (${response.status}): ${errorText || response.statusText}`);
  }

  if (!response.body) throw new Error("Ollama Cloud stream failed: No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          fullText += json.message.content;
          onChunk(fullText);
        }
      } catch (e) {
        // Handle partial JSON
      }
    }
  }
  return fullText;
}

export async function chatOllamaStream(
  url: string,
  modelName: string,
  history: Message[],
  onChunk: (text: string) => void
) {
  // Pass through to the cloud implementation if URL suggests cloud, otherwise standard local logic
  const cloudUrl = import.meta.env.VITE_OLLAMA_CLOUD_URL?.trim() || 'https://api.ollama.com';
  if (url === cloudUrl || url.includes('api.ollama.com') || url.includes('ollama.com')) {
    return chatStream(modelName, history, onChunk);
  }

  const messages = history.map(msg => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.parts.map(p => p.text).join('\n')
  }));

  const response = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...messages
      ],
      stream: true
    })
  });

  if (!response.body) throw new Error("Ollama stream failed");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          fullText += json.message.content;
          onChunk(fullText);
        }
      } catch (e) {
        // Handle partial JSON
      }
    }
  }
  return fullText;
}
