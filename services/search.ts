/**
 * Google Custom Search API service
 * Performs web searches and returns structured results for AI context
 */

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export async function googleSearch(query: string): Promise<SearchResult[]> {
  const apiKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY?.trim();
  const cx = import.meta.env.VITE_GOOGLE_SEARCH_CX?.trim();

  if (!apiKey) {
    throw new Error('Google Search API key not configured. Set VITE_GOOGLE_SEARCH_API_KEY in .env.local');
  }
  if (!cx) {
    throw new Error('Google Search Engine ID not configured. Set VITE_GOOGLE_SEARCH_CX in .env.local');
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx: cx,
    q: query,
    num: '5',
  });

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Eburon AI Orbit error: search failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    return [];
  }

  return data.items.map((item: any) => ({
    title: item.title || '',
    link: item.link || '',
    snippet: item.snippet || '',
  }));
}

export function formatSearchResultsForPrompt(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `[Web search for "${query}" returned no results.]`;
  }

  let context = `[Web search results for "${query}"]\n\n`;
  results.forEach((r, i) => {
    context += `${i + 1}. **${r.title}**\n   ${r.link}\n   ${r.snippet}\n\n`;
  });
  context += `[Use these search results to inform your response. Cite sources when relevant.]`;
  return context;
}
