import { type ChatMode, type ToolDefinition } from "~/types";
import { executeTavilySearch, formatTavilyResults } from "~/lib/tools/tavily";
import { fetchStooqDailyHistory, fetchStooqQuote } from "~/lib/tools/market";
import { db } from "~/server/db";

export type AccumulatedToolCall = {
  id: string;
  name: string;
  argumentsText: string;
};

export function appendToolCallDelta(
  toolCalls: Map<number, AccumulatedToolCall>,
  delta: { index: number; id?: string; function?: { name?: string; arguments?: string } }
): void {
  const existing = toolCalls.get(delta.index);
  const nextArgs = delta.function?.arguments ?? "";
  if (existing) {
    toolCalls.set(delta.index, {
      ...existing,
      id: delta.id ?? existing.id,
      name: delta.function?.name ?? existing.name,
      argumentsText: existing.argumentsText + nextArgs,
    });
    return;
  }
  toolCalls.set(delta.index, {
    id: delta.id ?? `call_${Date.now()}_${delta.index}`,
    name: delta.function?.name ?? "unknown",
    argumentsText: nextArgs,
  });
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  context?: { userId?: string }
): Promise<string> {
  switch (name) {
    case "tavily_search": {
      const query = typeof args.query === "string" ? args.query : "";
      if (!query.trim()) {
        return "Search skipped: missing query.";
      }
      const response = await executeTavilySearch(query.trim());
      return formatTavilyResults(response);
    }
    case "market_quote": {
      const symbol = typeof args.symbol === "string" ? args.symbol : "";
      if (!symbol.trim()) return "Quote skipped: missing symbol.";
      const quote = await fetchStooqQuote(symbol);
      return JSON.stringify(quote);
    }
    case "market_history_daily": {
      const symbol = typeof args.symbol === "string" ? args.symbol : "";
      const limit =
        typeof args.limit === "number" && Number.isFinite(args.limit)
          ? Math.max(1, Math.min(200, Math.floor(args.limit)))
          : 60;
      if (!symbol.trim()) return "History skipped: missing symbol.";
      const history = await fetchStooqDailyHistory(symbol, limit);
      return JSON.stringify(history);
    }
    case "finance_profile_get": {
      const userId = context?.userId;
      if (!userId) return "Unauthorized: missing user context.";
      const profile = await db.financeProfile.findUnique({ where: { userId } });
      return JSON.stringify({
        profile: profile
          ? { id: profile.id, data: profile.data ?? null, updatedAt: profile.updatedAt.toISOString() }
          : null,
      });
    }
    case "finance_profile_set": {
      const userId = context?.userId;
      if (!userId) return "Unauthorized: missing user context.";
      const raw = typeof args.data === "string" ? args.data : "";
      let data: unknown = raw;
      if (raw) {
        try {
          data = JSON.parse(raw) as unknown;
        } catch {
          data = raw;
        }
      }
      const profile = await db.financeProfile.upsert({
        where: { userId },
        update: { data: data as never },
        create: { userId, data: data as never },
      });
      return JSON.stringify({
        profile: { id: profile.id, data: profile.data ?? null, updatedAt: profile.updatedAt.toISOString() },
      });
    }
    case "finance_card_create": {
      const userId = context?.userId;
      if (!userId) return "Unauthorized: missing user context.";
      const title = typeof args.title === "string" ? args.title : "";
      const content = typeof args.content === "string" ? args.content : "";
      const tagsText = typeof args.tags === "string" ? args.tags : "";
      const sourceUrlsText = typeof args.sourceUrls === "string" ? args.sourceUrls : "";
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20);
      const sourceUrls = sourceUrlsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20);
      if (!title.trim() || !content.trim()) return "Card create skipped: missing title/content.";
      const card = await db.financeKnowledgeCard.create({
        data: {
          userId,
          title: title.trim().slice(0, 120),
          content,
          tags,
          sourceUrls,
        },
      });
      return JSON.stringify({
        card: {
          id: card.id,
          title: card.title,
          tags: card.tags,
          sourceUrls: card.sourceUrls,
          updatedAt: card.updatedAt.toISOString(),
        },
      });
    }
    case "finance_card_list": {
      const userId = context?.userId;
      if (!userId) return "Unauthorized: missing user context.";
      const tag = typeof args.tag === "string" ? args.tag.trim() : "";
      const cards = await db.financeKnowledgeCard.findMany({
        where: { userId, ...(tag ? { tags: { has: tag } } : {}) },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
      return JSON.stringify({
        cards: cards.map((c) => ({
          id: c.id,
          title: c.title,
          tags: c.tags,
          sourceUrls: c.sourceUrls,
          updatedAt: c.updatedAt.toISOString(),
        })),
      });
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

export function buildWorkingSummary(
  name: string,
  args: Record<string, unknown>
): string {
  if (name === "tavily_search") {
    const query = typeof args.query === "string" ? args.query : "";
    return query ? `检索: ${query}` : "检索: 未提供查询词";
  }
  if (name === "market_quote") {
    const symbol = typeof args.symbol === "string" ? args.symbol : "";
    return symbol ? `行情: ${symbol}` : "行情: 未提供标的";
  }
  if (name === "market_history_daily") {
    const symbol = typeof args.symbol === "string" ? args.symbol : "";
    return symbol ? `历史行情: ${symbol}` : "历史行情: 未提供标的";
  }
  if (name === "finance_profile_get") {
    return "读取个人画像";
  }
  if (name === "finance_profile_set") {
    return "更新个人画像";
  }
  if (name === "finance_card_create") {
    const title = typeof args.title === "string" ? args.title : "";
    return title ? `保存知识卡片: ${title}` : "保存知识卡片";
  }
  if (name === "finance_card_list") {
    const tag = typeof args.tag === "string" ? args.tag : "";
    return tag ? `列出知识卡片: #${tag}` : "列出知识卡片";
  }
  return `调用工具: ${name}`;
}

export function getToolsForMode(
  mode: ChatMode
): ToolDefinition[] | undefined {
  switch (mode) {
    case "chat":
      return undefined;
    case "agent":
      return [
        {
          type: "function",
          function: {
            name: "tavily_search",
            description:
              "Search the web for current information using Tavily. Use this when you need real-time data, news, or information that might not be in your training data.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to look up",
                },
              },
              required: ["query"],
            },
          },
        },
      ];
    case "finance":
      return [
        {
          type: "function",
          function: {
            name: "tavily_search",
            description:
              "Search the web for current information using Tavily. Use this when you need real-time data, news, or information that might not be in your training data.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to look up",
                },
              },
              required: ["query"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "market_quote",
            description:
              "Fetch a latest market quote (OHLCV) for a symbol using a public market data source. Return structured JSON with a source URL.",
            parameters: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Symbol (e.g. aapl.us, spy.us, eurusd)",
                },
              },
              required: ["symbol"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "market_history_daily",
            description:
              "Fetch daily historical OHLCV for a symbol. Return structured JSON with a source URL.",
            parameters: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Symbol (e.g. aapl.us, spy.us)",
                },
                limit: {
                  type: "number",
                  description: "Max number of recent bars to return (1-200).",
                },
              },
              required: ["symbol"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "finance_profile_get",
            description: "Get the user's personal finance profile (goals, constraints, risk preference) from the database.",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        },
        {
          type: "function",
          function: {
            name: "finance_profile_set",
            description: "Update the user's personal finance profile in the database.",
            parameters: {
              type: "object",
              properties: {
                data: {
                  type: "string",
                  description:
                    "Arbitrary JSON (as string) to store. Keep it concise and focused on goals, constraints, preferences.",
                },
              },
              required: ["data"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "finance_card_create",
            description: "Create a knowledge card for the user to support future retrieval and learning.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short title." },
                content: { type: "string", description: "Card content." },
                tags: { type: "string", description: "Comma-separated tags." },
                sourceUrls: { type: "string", description: "Comma-separated source URLs." },
              },
              required: ["title", "content"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "finance_card_list",
            description: "List latest knowledge cards, optionally filtered by a tag.",
            parameters: {
              type: "object",
              properties: {
                tag: { type: "string", description: "Optional tag to filter." },
              },
            },
          },
        },
      ];
    case "ide":
      return [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read the content of a file in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path, e.g., /src/index.js",
                },
              },
              required: ["path"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "write_file",
            description: "Create or overwrite a file in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path, e.g., /src/index.js",
                },
                content: {
                  type: "string",
                  description: "The content to write to the file",
                },
              },
              required: ["path", "content"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "list_files",
            description: "List files and directories in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description:
                    "The directory path to list, defaults to root if not provided",
                },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_file",
            description: "Delete a file or empty directory in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The path to delete",
                },
              },
              required: ["path"],
            },
          },
        },
      ];
    case "cli":
      return [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read the content of a file in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path, e.g., /src/index.js",
                },
              },
              required: ["path"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "write_file",
            description: "Create or overwrite a file in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The file path, e.g., /src/index.js",
                },
                content: {
                  type: "string",
                  description: "The content to write to the file",
                },
              },
              required: ["path", "content"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "list_files",
            description: "List files and directories in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description:
                    "The directory path to list, defaults to root if not provided",
                },
              },
            },
          },
        },
        {
          type: "function",
          function: {
            name: "delete_file",
            description: "Delete a file or empty directory in the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "The path to delete",
                },
              },
              required: ["path"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "run_command",
            description:
              "Execute a shell command in the virtual sandbox. Supported commands: ls, cd, pwd, cat, mkdir, touch, rm, echo, grep, find",
            parameters: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The shell command to execute",
                },
              },
              required: ["command"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search_files",
            description:
              "Search for a pattern in file contents within the virtual sandbox",
            parameters: {
              type: "object",
              properties: {
                pattern: {
                  type: "string",
                  description: "The regex pattern to search for",
                },
                path: {
                  type: "string",
                  description: "The directory to search in, defaults to root",
                },
              },
              required: ["pattern"],
            },
          },
        },
      ];
    default:
      return undefined;
  }
}
