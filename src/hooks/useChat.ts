"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ToolCall } from "~/components/ToolCallDisplay";

export type MessageRole = "user" | "assistant" | "tool";

export type WorkingState = {
  status: "working" | "done";
  summary: string[];
};

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

export type ChatMode = "chat" | "agent" | "ide" | "cli";

export type ProtocolEvent = {
  type: "req" | "res" | "info" | "clear";
  title: string;
  content?: unknown;
  token?: string;
  context?: string;
  traceId?: string | null;
};

interface UseChatOptions {
  mode: ChatMode;
  conversationId?: string | null;
  onToolCall?: (toolCall: ToolCall) => Promise<unknown>;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
  onProtocolEvent?: (event: ProtocolEvent) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, options?: { conversationId?: string | null }) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  traceId: string | null;
}

// Parse SSE stream
async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          return;
        }
        yield data;
      }
    }
  }
}

// Generate unique ID
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getToolOutcome(result: unknown): { ok: boolean; error?: string; warning?: string } {
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

export function useChat({
  mode,
  conversationId,
  onToolCall,
  onError,
  onSuccess,
  onProtocolEvent,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeKeyRef = useRef<string>("none:none");
  const messagesRef = useRef<ChatMessage[]>([]);
  const requestSeqRef = useRef(0);
  const activeRequestIdRef = useRef(0);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    activeRequestIdRef.current = 0;
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    try {
      const conversationMode = mode.toUpperCase();
      const response = await fetch(
        `/api/conversations/${conversationId}/messages?mode=${conversationMode}`
      );
      if (!response.ok) {
        throw new Error(`Failed to load messages: ${response.status}`);
      }
      const data = (await response.json()) as {
        messages: Array<{
          id: string;
          role: MessageRole;
          content?: string | null;
          toolCalls?: ToolCall[] | null;
          working?: WorkingState | null;
          toolCallId?: string | null;
          createdAt: string;
        }>;
      };

      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content ?? "",
          toolCalls: m.toolCalls ?? undefined,
          toolCallId: m.toolCallId ?? undefined,
          working: m.working ?? undefined,
          timestamp: new Date(m.createdAt),
          isStreaming: false,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    }
  }, [conversationId, mode]);

  const saveMessage = useCallback(
    async (args: {
      role: MessageRole;
      content?: string;
      toolCalls?: ToolCall[];
      toolCallId?: string;
      working?: WorkingState;
      conversationIdOverride?: string | null;
    }) => {
      const targetId = args.conversationIdOverride ?? conversationId;
      if (!targetId) return;

      await fetch(`/api/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: args.role,
          content: args.content,
          toolCalls: args.toolCalls,
          toolCallId: args.toolCallId,
          working: args.working,
        }),
      });
    },
    [conversationId]
  );

  useEffect(() => {
    activeKeyRef.current = `${mode}:${conversationId ?? "none"}`;
    activeRequestIdRef.current = 0;
    stopGeneration();
    clearMessages();
    setTraceId(null);
    void loadMessages();
  }, [conversationId, mode, loadMessages, stopGeneration, clearMessages]);

  const sendMessage = useCallback(async (content: string, options?: { conversationId?: string | null }) => {
    if (!content.trim() || isLoading) return;

    const conversationIdOverride = options?.conversationId ?? null;
    const effectiveConversationId = conversationIdOverride ?? conversationId;
    const startedKey = `${mode}:${effectiveConversationId ?? "none"}`;
    const requestId = (requestSeqRef.current += 1);
    activeRequestIdRef.current = requestId;
    const guardedSetMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) =>
      setMessages((prev) => {
        if (activeRequestIdRef.current !== requestId) return prev;
        if (activeKeyRef.current !== startedKey) return prev;
        return updater(prev);
      });

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };
    guardedSetMessages((prev) => [...prev, userMessage]);
    void saveMessage({
      role: "user",
      content: userMessage.content,
      conversationIdOverride: effectiveConversationId,
    });
    setError(null);
    setIsLoading(true);

    // Prepare request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Build messages array for API
    const apiMessages = [...messagesRef.current, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls && { tool_calls: m.toolCalls }),
      ...(m.role === "tool" && m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    }));

    const contextText = apiMessages
      .map((m) => `[${m.role}] ${m.content ?? ""}`)
      .join("\n");

    try {
      const MAX_LOCAL_TOOL_ROUNDS = 4;
      const MAX_LOCAL_TOOL_CALLS_PER_ROUND = 4;
      const MAX_TOOL_RESULT_CHARS = 20_000;

      const stringifyToolResult = (result: unknown) => {
        if (typeof result === "string") return result;
        return JSON.stringify(result ?? "", null, 2);
      };

      const truncate = (text: string) =>
        text.length > MAX_TOOL_RESULT_CHARS
          ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n...(truncated)...`
          : text;

      const streamOneRound = async (wireMessages: unknown[], round: number) => {
        const payload = {
          model: "deepseek-chat",
          stream: true,
          x_mode: mode,
          x_conversation_id: effectiveConversationId,
          messages: wireMessages,
        };

        onProtocolEvent?.({
          type: "req",
          title: `POST /api/chat/stream (round ${round + 1})`,
          content: payload,
          context: round === 0 ? contextText || "(Empty)" : undefined,
        });

        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify(payload),
        });

        const responseTraceId = response.headers.get("x-trace-id");
        if (responseTraceId) {
          if (activeRequestIdRef.current === requestId && activeKeyRef.current === startedKey) {
            setTraceId(responseTraceId);
          }
          onProtocolEvent?.({
            type: "info",
            title: "Trace ID",
            content: responseTraceId,
            traceId: responseTraceId,
          });
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error((errorData as { error?: string }).error ?? `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: true,
        };
        guardedSetMessages((prev) => [...prev, assistantMessage]);

        const reader = response.body.getReader();
        let fullContent = "";
        let toolCalls: ToolCall[] = [];
        let finishReason: string | null = null;
        const toolCallIndexMap = new Map<number, { arrayIndex: number; rawArgs: string }>();
        let currentWorking: WorkingState | undefined;

        const updateWorking = (
          updater: (prev?: WorkingState) => WorkingState | undefined
        ) => {
          guardedSetMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMessage.id) return m;
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

        for await (const data of parseSSE(reader)) {
          if (abortController.signal.aborted) break;

          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              tool_call_id?: string;
              name?: string;
              result?: unknown;
              status?: WorkingState["status"];
              text?: string;
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
            };

            if (parsed.type === "working_summary" && parsed.text) {
              appendWorkingSummary(parsed.text);
              continue;
            }

            if (parsed.type === "working_state" && parsed.status) {
              setWorkingStatus(parsed.status);
              continue;
            }

            if (parsed.type === "tool_result" && parsed.tool_call_id) {
              const resultContent = stringifyToolResult(parsed.result);
              const outcome = getToolOutcome(parsed.result);

              const updated: ToolCall[] = toolCalls.map((tc): ToolCall => {
                if (tc.id !== parsed.tool_call_id) return tc;
                const status: ToolCall["status"] = outcome.ok ? "completed" : "error";
                return {
                  ...tc,
                  status,
                  result: outcome.ok
                    ? { success: true, data: parsed.result }
                    : { success: false, data: parsed.result, error: outcome.error },
                };
              });
              toolCalls = updated;

              guardedSetMessages((prev) => [
                ...prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, toolCalls: updated } : m
                ),
                {
                  id: generateId(),
                  role: "tool",
                  content: resultContent,
                  toolCallId: parsed.tool_call_id,
                  timestamp: new Date(),
                },
              ]);

              void saveMessage({
                role: "tool",
                content: resultContent,
                toolCallId: parsed.tool_call_id,
                conversationIdOverride: effectiveConversationId,
              });

              continue;
            }

            const choice = parsed.choices?.[0];
            const delta = choice?.delta;
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const rawLine = `data: ${data}`;

            if (delta?.content) {
              fullContent += delta.content;
              guardedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, content: fullContent } : m
                )
              );
              onProtocolEvent?.({
                type: "res",
                title: "SSE: Chunk",
                content: rawLine,
                token: delta.content,
              });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                const existing = toolCallIndexMap.get(idx);

                if (existing != null) {
                  existing.rawArgs += tc.function?.arguments ?? "";
                  if (tc.id && toolCalls[existing.arrayIndex]) {
                    toolCalls[existing.arrayIndex] = {
                      ...toolCalls[existing.arrayIndex]!,
                      id: tc.id,
                    };
                  }
                  try {
                    const args = JSON.parse(existing.rawArgs) as Record<string, unknown>;
                    toolCalls[existing.arrayIndex] = {
                      ...toolCalls[existing.arrayIndex]!,
                      arguments: args,
                    };
                  } catch {
                    // ignore partial
                  }
                } else {
                  const rawArgs = tc.function?.arguments ?? "";
                  let args: Record<string, unknown> = {};
                  try {
                    args = JSON.parse(rawArgs) as Record<string, unknown>;
                  } catch {
                    // ignore partial
                  }
                  const arrayIndex = toolCalls.length;
                  toolCalls.push({
                    id: tc.id ?? `pending_${idx}`,
                    name: tc.function?.name ?? "unknown",
                    arguments: args,
                    status: "pending",
                  });
                  toolCallIndexMap.set(idx, { arrayIndex, rawArgs });
                }
              }

              guardedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, toolCalls: [...toolCalls] } : m
                )
              );
              onProtocolEvent?.({
                type: "res",
                title: "SSE: Tool Call",
                content: rawLine,
              });
            }
          } catch {
            // Ignore parse errors for partial chunks
          }
        }

        onProtocolEvent?.({
          type: "info",
          title: "SSE: [DONE]",
          content: "[DONE]",
        });

        guardedSetMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  isStreaming: false,
                  working:
                    m.working?.status === "working"
                      ? { ...m.working, status: "done" }
                      : m.working,
                }
              : m
          )
        );

        if (currentWorking?.status === "working") {
          currentWorking = { ...currentWorking, status: "done" };
        }

        return {
          assistantMessageId: assistantMessage.id,
          fullContent,
          toolCalls,
          finishReason,
          working: currentWorking,
        };
      };

      let currentWireMessages: unknown[] = apiMessages;
      for (let round = 0; round <= MAX_LOCAL_TOOL_ROUNDS; round++) {
        const roundResult = await streamOneRound(currentWireMessages, round);

        const shouldExecuteLocalTools =
          roundResult.finishReason === "tool_calls" &&
          onToolCall != null &&
          roundResult.toolCalls.length > 0 &&
          round < MAX_LOCAL_TOOL_ROUNDS;

        if (!shouldExecuteLocalTools) {
          void saveMessage({
            role: "assistant",
            content: roundResult.fullContent,
            toolCalls: roundResult.toolCalls.length > 0 ? roundResult.toolCalls : undefined,
            working: roundResult.working,
            conversationIdOverride: effectiveConversationId,
          });
          onSuccess?.();
          break;
        }

        const limitedToolCalls = roundResult.toolCalls.slice(0, MAX_LOCAL_TOOL_CALLS_PER_ROUND);
        const toolWireMessages: Array<{
          role: "tool";
          tool_call_id: string;
          content: string;
        }> = [];

        for (const tc of limitedToolCalls) {
          tc.status = "running";
          guardedSetMessages((prev) =>
            prev.map((m) =>
              m.id === roundResult.assistantMessageId
                ? { ...m, toolCalls: [...roundResult.toolCalls] }
                : m
            )
          );

          let toolResult: unknown;
          try {
            toolResult = await onToolCall(tc);
            const outcome = getToolOutcome(toolResult);
            tc.status = outcome.ok ? "completed" : "error";
            tc.result = outcome.ok
              ? { success: true, data: toolResult }
              : { success: false, data: toolResult, error: outcome.error };
          } catch (err) {
            tc.status = "error";
            tc.result = { success: false, error: String(err) };
            toolResult = { error: String(err) };
          }

          guardedSetMessages((prev) =>
            prev.map((m) =>
              m.id === roundResult.assistantMessageId
                ? { ...m, toolCalls: [...roundResult.toolCalls] }
                : m
            )
          );

          const toolContent = truncate(stringifyToolResult(toolResult));
          toolWireMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolContent,
          });

          guardedSetMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "tool",
              content: toolContent,
              toolCallId: tc.id,
              timestamp: new Date(),
            },
          ]);

          void saveMessage({
            role: "tool",
            content: toolContent,
            toolCallId: tc.id,
            conversationIdOverride: effectiveConversationId,
          });
        }

        void saveMessage({
          role: "assistant",
          content: roundResult.fullContent,
          toolCalls: roundResult.toolCalls.length > 0 ? roundResult.toolCalls : undefined,
          working: roundResult.working,
          conversationIdOverride: effectiveConversationId,
        });

        onSuccess?.();

        const assistantWireMessage = {
          role: "assistant",
          content: roundResult.fullContent,
          tool_calls: limitedToolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments ?? {}),
            },
          })),
        };

        currentWireMessages = [
          ...currentWireMessages,
          assistantWireMessage,
          ...toolWireMessages,
        ];
      }

    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User cancelled
        return;
      }
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (activeRequestIdRef.current === requestId && activeKeyRef.current === startedKey) {
        setError(errorMessage);
      }
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      onProtocolEvent?.({
        type: "info",
        title: "Error",
        content: errorMessage,
      });
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsLoading(false);
        abortControllerRef.current = null;
        activeRequestIdRef.current = 0;
      }
    }
  }, [mode, conversationId, isLoading, onToolCall, onError, onSuccess, onProtocolEvent, saveMessage]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
    traceId,
  };
}
