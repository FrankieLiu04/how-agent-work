import { type ToolDefinition } from "~/types";
import { executeTavilySearch, formatTavilyResults } from "~/lib/tools/tavily";

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
  args: Record<string, unknown>
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
  return `调用工具: ${name}`;
}

export function getToolsForMode(
  mode: "chat" | "agent" | "ide" | "cli"
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
