"use client";

import { useCallback } from "react";
import type { ToolCall } from "~/components/ToolCallDisplay";
import { apiClient } from "~/lib/api";
import { TOOL_RESULT_LIMITS } from "~/lib/config";

export interface UseToolExecutionOptions {
  onFileChange?: () => void;
}

export interface UseToolExecutionReturn {
  executeTool: (toolCall: ToolCall) => Promise<unknown>;
}

function truncateResult(result: string): string {
  if (result.length <= TOOL_RESULT_LIMITS.MAX_CHARS) return result;
  return `${result.slice(0, TOOL_RESULT_LIMITS.MAX_CHARS)}\n\n...(truncated)...`;
}

export function useToolExecution(options: UseToolExecutionOptions = {}): UseToolExecutionReturn {
  const { onFileChange } = options;

  const executeTool = useCallback(
    async (toolCall: ToolCall): Promise<unknown> => {
      const { name, arguments: args } = toolCall;

      switch (name) {
        case "read_file": {
          const path = typeof args.path === "string" ? args.path : "";
          const content = await apiClient.sandbox.readFile(path);
          if (content === null) {
            return { success: false, error: `File not found: ${path}` };
          }
          return { success: true, path, content };
        }

        case "write_file": {
          const path = typeof args.path === "string" ? args.path : "";
          const content = typeof args.content === "string" ? args.content : "";
          const result = await apiClient.sandbox.writeFile(path, content);
          onFileChange?.();
          return result;
        }

        case "list_files": {
          const path = typeof args.path === "string" ? args.path : "/";
          const files = await apiClient.sandbox.listFiles();
          const filtered = path === "/" 
            ? files 
            : files.filter(f => f.path.startsWith(path));
          return { 
            success: true, 
            path, 
            files: filtered.map(f => ({
              name: f.path.split("/").pop() ?? "",
              path: f.path,
              isDir: f.isDir,
              size: f.size,
            })),
          };
        }

        case "delete_file": {
          const path = typeof args.path === "string" ? args.path : "";
          try {
            await apiClient.sandbox.deleteFile(path);
            onFileChange?.();
            return { success: true, path };
          } catch (error) {
            return { 
              success: false, 
              error: error instanceof Error ? error.message : "Delete failed" 
            };
          }
        }

        case "run_command": {
          const command = typeof args.command === "string" ? args.command : "";
          const cwd = typeof args.cwd === "string" ? args.cwd : "/";
          const result = await apiClient.sandbox.exec(command, cwd);
          onFileChange?.();
          return {
            success: result.exitCode === 0,
            stdout: truncateResult(result.stdout),
            stderr: result.stderr,
            exitCode: result.exitCode,
            cwd: result.cwdChanged ?? cwd,
          };
        }

        case "search_files": {
          const pattern = typeof args.pattern === "string" ? args.pattern : "";
          const searchPath = typeof args.path === "string" ? args.path : "/";
          const files = await apiClient.sandbox.listFiles();
          const results: Array<{ path: string; line: number; content: string }> = [];
          
          try {
            const regex = new RegExp(pattern, "g");
            for (const file of files) {
              if (file.isDir || !file.content) continue;
              if (!file.path.startsWith(searchPath)) continue;
              
              const lines = file.content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i]!)) {
                  results.push({ path: file.path, line: i + 1, content: lines[i]! });
                }
                regex.lastIndex = 0;
              }
            }
            return { success: true, pattern, path: searchPath, results };
          } catch {
            return { success: false, error: `Invalid regex: ${pattern}` };
          }
        }

        case "tavily_search": {
          return { 
            success: true, 
            message: "Search executed (mock response)",
            query: args.query,
          };
        }

        default:
          return { success: false, error: `Unknown tool: ${name}` };
      }
    },
    [onFileChange]
  );

  return { executeTool };
}
