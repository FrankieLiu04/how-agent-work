import { TOOL_RESULT_LIMITS } from "~/lib/config";
import type { ToolCall } from "~/components/ToolCallDisplay";
import type { ChatMessage, MessageRole, WorkingState } from "./types";

export function stringifyToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result ?? "", null, 2);
}

export function truncateToolResult(text: string): string {
  if (text.length <= TOOL_RESULT_LIMITS.MAX_CHARS) return text;
  return `${text.slice(0, TOOL_RESULT_LIMITS.MAX_CHARS)}\n\n...(truncated)...`;
}

export function buildApiMessage(m: ChatMessage): {
  role: string;
  content?: string;
  tool_calls?: unknown;
  tool_call_id?: string;
} {
  return {
    role: m.role,
    content: m.content,
    ...(m.toolCalls && { tool_calls: m.toolCalls }),
    ...(m.role === "tool" && m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
  };
}

export function buildAssistantWireMessage(
  content: string,
  toolCalls: ToolCall[]
): {
  role: "assistant";
  content: string;
  tool_calls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
} {
  return {
    role: "assistant",
    content,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments ?? {}),
      },
    })),
  };
}

export function buildToolWireMessage(
  toolCallId: string,
  content: string
): { role: "tool"; tool_call_id: string; content: string } {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content,
  };
}

export function createWorkingUpdater(
  messageId: string,
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void
): {
  updateWorking: (updater: (prev?: WorkingState) => WorkingState | undefined) => void;
  appendWorkingSummary: (text: string) => void;
  setWorkingStatus: (status: WorkingState["status"]) => void;
} {
  let currentWorking: WorkingState | undefined;

  const updateWorking = (
    updater: (prev?: WorkingState) => WorkingState | undefined
  ) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const nextWorking = updater(m.working);
        currentWorking = nextWorking;
        return { ...m, working: nextWorking };
      })
    );
  };

  const appendWorkingSummary = (text: string) => {
    updateWorking((prev) => ({
      status: prev?.status ?? "working",
      summary: [...(prev?.summary ?? []), text],
    }));
  };

  const setWorkingStatus = (status: WorkingState["status"]) => {
    updateWorking((prev) => ({
      status,
      summary: prev?.summary ?? [],
    }));
  };

  return { updateWorking, appendWorkingSummary, setWorkingStatus };
}
