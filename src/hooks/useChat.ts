"use client";

import { useState, useCallback, useRef } from "react";
import type { ToolCall } from "~/components/ToolCallDisplay";

export type MessageRole = "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
  isStreaming?: boolean;
}

export type ChatMode = "chat" | "agent" | "ide" | "cli";

interface UseChatOptions {
  mode: ChatMode;
  conversationId?: string | null;
  onToolCall?: (toolCall: ToolCall) => Promise<unknown>;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
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

export function useChat({
  mode,
  conversationId,
  onToolCall,
  onError,
  onSuccess,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setError(null);
    setIsLoading(true);

    // Prepare request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Build messages array for API
    const apiMessages = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls && { tool_calls: m.toolCalls }),
    }));

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          model: "deepseek-chat",
          stream: true,
          x_mode: mode,
          conversation_id: conversationId,
          messages: apiMessages,
        }),
      });

      // Get trace ID
      const responseTraceId = response.headers.get("x-trace-id");
      if (responseTraceId) {
        setTraceId(responseTraceId);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error ?? `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      // Create assistant message placeholder
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Parse SSE stream
      const reader = response.body.getReader();
      let fullContent = "";
      let toolCalls: ToolCall[] = [];

      for await (const data of parseSSE(reader)) {
        if (abortController.signal.aborted) break;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  id: string;
                  function: { name: string; arguments: string };
                }>;
              };
              finish_reason?: string | null;
            }>;
          };

          const delta = parsed.choices?.[0]?.delta;
          
          // Handle content
          if (delta?.content) {
            fullContent += delta.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: fullContent }
                  : m
              )
            );
          }

          // Handle tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existingIndex = toolCalls.findIndex((t) => t.id === tc.id);
              if (existingIndex >= 0) {
                // Append to existing tool call arguments
                const existing = toolCalls[existingIndex]!;
                try {
                  const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                  toolCalls[existingIndex] = {
                    ...existing,
                    arguments: { ...existing.arguments, ...args },
                  };
                } catch {
                  // Arguments might be streamed in chunks
                }
              } else {
                // New tool call
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                } catch {
                  // Arguments might be incomplete
                }
                toolCalls.push({
                  id: tc.id,
                  name: tc.function.name,
                  arguments: args,
                  status: "pending",
                });
              }
            }
            
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, toolCalls: [...toolCalls] }
                  : m
              )
            );
          }

          // Check for finish
          if (parsed.choices?.[0]?.finish_reason === "tool_calls") {
            // Execute tool calls
            if (onToolCall && toolCalls.length > 0) {
              for (const tc of toolCalls) {
                tc.status = "running";
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, toolCalls: [...toolCalls] }
                      : m
                  )
                );

                try {
                  const result = await onToolCall(tc);
                  tc.status = "completed";
                  tc.result = { success: true, data: result };
                } catch (err) {
                  tc.status = "error";
                  tc.result = { success: false, error: String(err) };
                }

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, toolCalls: [...toolCalls] }
                      : m
                  )
                );
              }
            }
          }
        } catch {
          // Ignore parse errors for partial chunks
        }
      }

      // Mark streaming as complete
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false }
            : m
        )
      );

      // Notify success (e.g., to refresh quota)
      onSuccess?.();

    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User cancelled
        return;
      }
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, mode, conversationId, isLoading, onToolCall, onError, onSuccess]);

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
