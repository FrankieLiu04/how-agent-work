/**
 * Tool executors for Agent mode
 */

import { env } from "~/env";

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
}

/**
 * Execute Tavily search
 */
export async function executeTavilySearch(
  query: string
): Promise<TavilySearchResponse> {
  const apiKey = env.TAVILY_API_KEY;

  if (!apiKey) {
    // Return mock data if no API key
    return {
      query,
      results: [
        {
          title: "Mock Search Result",
          url: "https://example.com",
          content: `This is a mock search result for: "${query}". Tavily API key not configured.`,
          score: 0.9,
        },
      ],
      answer: `Mock answer for: ${query}`,
    };
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 5,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = (await response.json()) as TavilySearchResponse;
    return data;
  } catch (error) {
    console.error("Tavily search error:", error);
    return {
      query,
      results: [],
      answer: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Format Tavily search results for LLM consumption
 */
export function formatTavilyResults(response: TavilySearchResponse): string {
  let result = `Search results for: "${response.query}"\n\n`;

  if (response.answer) {
    result += `Quick Answer: ${response.answer}\n\n`;
  }

  if (response.results.length > 0) {
    result += "Detailed Results:\n";
    response.results.forEach((item, index) => {
      result += `\n${index + 1}. ${item.title}\n`;
      result += `   URL: ${item.url}\n`;
      result += `   ${item.content.slice(0, 200)}...\n`;
    });
  } else {
    result += "No results found.\n";
  }

  return result;
}
