"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ToolCall } from "~/components/ToolCallDisplay";
import type { ChatMode, ProtocolEvent } from "~/types";
import { AGENT_LIMITS, TOOL_RESULT_LIMITS } from "~/lib/config";
import {
  type ChatMessage,
  type UseChatOptions,
  type UseChatReturn,
  type StreamRoundResult,
  generateId,
  getToolOutcome,
} from "./types";
import { parseSSE, parseSSEChunk } from "./sse-parser";
import {
  stringifyToolResult,
  truncateToolResult,
  buildApiMessage,
  buildAssistantWireMessage,
  buildToolWireMessage,
  createWorkingUpdater,
} from "./message-builder";

export type { ChatMessage, UseChatOptions, UseChatReturn };
export type { ChatMode, ProtocolEvent };

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
          role: "user" | "assistant" | "tool";
          content?: string | null;
          toolCalls?: ToolCall[] | null;
          working?: { status: "working" | "done"; summary: string[] } | null;
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
      role: "user" | "assistant" | "tool";
      content?: string;
      toolCalls?: ToolCall[];
      toolCallId?: string;
      working?: { status: "working" | "done"; summary: string[] };
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

  const streamOneRound = useCallback(
    async (
      wireMessages: unknown[],
      round: number,
      context: {
        requestId: number;
        startedKey: string;
        effectiveConversationId: string | null;
        abortController: AbortController;
        guardedSetMessages: (
          updater: (prev: ChatMessage[]) => ChatMessage[]
        ) => void;
      }
    ): Promise<StreamRoundResult> => {
      const { requestId, startedKey, effectiveConversationId, abortController, guardedSetMessages } = context;

      const payload = {
        model: "deepseek-chat",
        stream: true,
        x_mode: mode,
        x_conversation_id: effectiveConversationId,
        messages: wireMessages,
      };

      const contextText = (wireMessages as Array<{ role: string; content?: string }>)
        .map((m) => `[${m.role}] ${m.content ?? ""}`)
        .join("\n");

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
      let currentWorking: { status: "working" | "done"; summary: string[] } | undefined;

      const { appendWorkingSummary, setWorkingStatus } = createWorkingUpdater(
        assistantMessage.id,
        guardedSetMessages
      );

      for await (const data of parseSSE(reader)) {
        if (abortController.signal.aborted) break;

        const parsed = parseSSEChunk(data);
        if (!parsed) continue;

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

      return {
        assistantMessageId: assistantMessage.id,
        fullContent,
        toolCalls,
        finishReason,
        working: currentWorking,
      };
    },
    [mode, onProtocolEvent, saveMessage]
  );

  const sendMessage = useCallback(
    async (content: string, options?: { conversationId?: string | null }) => {
      if (!content.trim() || isLoading) return;

      const conversationIdOverride = options?.conversationId ?? null;
      const effectiveConversationId = conversationIdOverride ?? conversationId ?? null;
      const startedKey = `${mode}:${effectiveConversationId ?? "none"}`;
      const requestId = (requestSeqRef.current += 1);
      activeRequestIdRef.current = requestId;

      const guardedSetMessages = (
        updater: (prev: ChatMessage[]) => ChatMessage[]
      ) =>
        setMessages((prev) => {
          if (activeRequestIdRef.current !== requestId) return prev;
          if (activeKeyRef.current !== startedKey) return prev;
          return updater(prev);
        });

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

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const apiMessages = [...messagesRef.current, userMessage].map(buildApiMessage);

      try {
        let currentWireMessages: unknown[] = apiMessages;

        for (let round = 0; round <= AGENT_LIMITS.MAX_TOOL_ROUNDS; round++) {
          const roundResult = await streamOneRound(currentWireMessages, round, {
            requestId,
            startedKey,
            effectiveConversationId,
            abortController,
            guardedSetMessages,
          });

          const shouldExecuteLocalTools =
            roundResult.finishReason === "tool_calls" &&
            onToolCall != null &&
            roundResult.toolCalls.length > 0 &&
            round < AGENT_LIMITS.MAX_TOOL_ROUNDS;

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

          const limitedToolCalls = roundResult.toolCalls.slice(
            0,
            AGENT_LIMITS.MAX_TOOL_CALLS_PER_ROUND
          );
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

            const toolContent = truncateToolResult(stringifyToolResult(toolResult));
            toolWireMessages.push(buildToolWireMessage(tc.id, toolContent));

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

          const assistantWireMessage = buildAssistantWireMessage(
            roundResult.fullContent,
            limitedToolCalls
          );

          currentWireMessages = [
            ...currentWireMessages,
            assistantWireMessage,
            ...toolWireMessages,
          ];
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
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
    },
    [
      mode,
      conversationId,
      isLoading,
      onToolCall,
      onError,
      onSuccess,
      onProtocolEvent,
      saveMessage,
      streamOneRound,
    ]
  );

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
