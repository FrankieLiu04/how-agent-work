import type { ToolCall } from "~/components/ToolCallDisplay";
import type { ChatMode, WorkingState, ProtocolEvent } from "~/types";

export type { ChatMode, WorkingState, ProtocolEvent };
export type MessageRole = "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  working?: WorkingState;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface UseChatOptions {
  mode: ChatMode;
  conversationId?: string | null;
  onToolCall?: (toolCall: ToolCall) => Promise<unknown>;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
  onProtocolEvent?: (event: ProtocolEvent) => void;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, options?: { conversationId?: string | null }) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  traceId: string | null;
}

export interface StreamRoundResult {
  assistantMessageId: string;
  fullContent: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
  working?: WorkingState;
}

export interface ToolOutcome {
  ok: boolean;
  error?: string;
  warning?: string;
}

export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getToolOutcome(result: unknown): ToolOutcome {
  if (!result || typeof result !== "object") return { ok: true };
  const r = result as Record<string, unknown>;

  const warning = typeof r.warning === "string" ? r.warning : undefined;

  if (r.success === false) {
    const error =
      (typeof r.message === "string" ? r.message : undefined) ??
      (typeof r.error === "string" ? r.error : undefined) ??
      "Tool failed";
    return { ok: false, error, warning };
  }

  if (typeof r.error === "string") {
    const error = (typeof r.message === "string" ? r.message : undefined) ?? r.error;
    return { ok: false, error, warning };
  }

  return { ok: true, warning };
}
