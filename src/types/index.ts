export type ChatMode = "chat" | "agent" | "ide" | "cli";

export type ConversationMode = "CHAT" | "AGENT" | "IDE" | "CLI";

export type MessageRole = "user" | "assistant" | "tool" | "system";

export function toConversationMode(mode: ChatMode): ConversationMode {
  return mode.toUpperCase() as ConversationMode;
}

export function toChatMode(mode: ConversationMode): ChatMode {
  return mode.toLowerCase() as ChatMode;
}

export interface WorkingState {
  status: "working" | "done";
  summary: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: ToolResult;
  status: "pending" | "running" | "completed" | "error";
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition {
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
}

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

export interface ApiChatMessage {
  role: MessageRole;
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

export interface SandboxFile {
  id?: string;
  path: string;
  content?: string;
  isDir: boolean;
  size: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SandboxLimits {
  maxFiles: number;
  maxFileSize: number;
  maxTotalSize: number;
  currentFileCount: number;
  currentTotalSize: number;
}

export type SandboxWriteResult =
  | { ok: true; file: SandboxFile; refreshed: boolean; warning?: string }
  | { ok: false; error: string; code?: string; httpStatus?: number };

export interface Conversation {
  id: string;
  mode: ConversationMode;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  resetAt: Date | null;
}

export interface TerminalLine {
  id: string;
  type: "command" | "output" | "error" | "system";
  content: string;
  timestamp: Date;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwdChanged?: string;
  filesChanged?: boolean;
}

export interface ProtocolEvent {
  type: "req" | "res" | "info" | "clear";
  title: string;
  content?: unknown;
  token?: string;
  context?: string;
  traceId?: string | null;
}

export interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

export interface ChatStreamRequest {
  model?: string;
  messages?: ApiChatMessage[];
  stream?: boolean;
  x_mode?: ChatMode;
  x_ttfb_ms?: number;
  x_token_delay_ms?: number;
  x_jitter_ms?: number;
  x_conversation_id?: string;
  x_use_real?: boolean;
  tools?: ToolDefinition[];
}

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
