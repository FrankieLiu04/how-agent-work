/**
 * Tool definitions for different modes
 */

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
};

// Agent 模式: Tavily 搜索工具
export const agentTools: ToolDefinition[] = [
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

// IDE 模式: 文件操作工具
export const ideTools: ToolDefinition[] = [
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

// CLI 模式: 文件操作 + Shell 命令工具
export const cliTools: ToolDefinition[] = [
  ...ideTools,
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

// 根据模式获取工具定义
export function getToolsForMode(
  mode: "chat" | "agent" | "ide" | "cli"
): ToolDefinition[] | undefined {
  switch (mode) {
    case "chat":
      return undefined; // Chat 模式不使用工具
    case "agent":
      return agentTools;
    case "ide":
      return ideTools;
    case "cli":
      return cliTools;
    default:
      return undefined;
  }
}
