"use client";

import { type RefObject } from "react";
import { ChatInput } from "~/components/ChatInput";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";
import { MessageBubble } from "~/components/live-chat/MessageBubble";
import { ToolRoundBubble } from "~/components/live-chat/ToolRoundBubble";

interface ChatPaneProps {
  mode: ChatMode;
  messages: ChatMessage[];
  isInputDisabled: boolean;
  onSend: (content: string) => void;
  error?: string | null;
  traceId?: string | null;
  onDismissError: () => void;
  quotaUsed: number;
  quotaLimit: number;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  compactTools?: boolean;
  className?: string;
  emptyVariant?: "default" | "copilot";
}

export function ChatPane({
  mode,
  messages,
  isInputDisabled,
  onSend,
  error,
  traceId,
  onDismissError,
  quotaUsed,
  quotaLimit,
  messagesEndRef,
  compactTools = false,
  className,
  emptyVariant = "default",
}: ChatPaneProps) {
  const buildDisplayItems = () => {
    if (mode === "chat") {
      return messages.map((m) => ({ kind: "message" as const, key: m.id, message: m }));
    }

    const items: Array<
      | { kind: "message"; key: string; message: ChatMessage }
      | { kind: "tool_round"; key: string; pre: ChatMessage; toolMessages: ChatMessage[]; post?: ChatMessage }
    > = [];

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;

      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        const toolMessages: ChatMessage[] = [];
        let j = i + 1;
        while (j < messages.length && messages[j]?.role === "tool") {
          toolMessages.push(messages[j]!);
          j++;
        }

        if (toolMessages.length > 0) {
          const post = j < messages.length && messages[j]?.role === "assistant" ? messages[j] : undefined;
          items.push({
            kind: "tool_round",
            key: `${m.id}:${post?.id ?? "pending"}`,
            pre: m,
            toolMessages,
            post,
          });
          i = post ? j : j - 1;
          continue;
        }
      }

      if (m.role === "tool") {
        continue;
      }

      items.push({ kind: "message", key: m.id, message: m });
    }

    return items;
  };

  const displayItems = buildDisplayItems();
  const visibleCount = displayItems.length;

  const renderEmptyState = () => (
    <div className="live-chat__empty">
      <div className="live-chat__empty-icon">
        {mode === "chat" && "💬"}
        {mode === "agent" && "🤖"}
        {mode === "ide" && "💻"}
        {mode === "cli" && "⚡"}
      </div>
      <div className="live-chat__empty-title">
        {emptyVariant === "copilot" && "Ask Copilot"}
        {emptyVariant === "default" && mode === "chat" && "Start a conversation"}
        {emptyVariant === "default" && mode === "agent" && "Ask me anything (I can search the web)"}
        {emptyVariant === "default" && mode === "ide" && "Describe what you want to build"}
        {emptyVariant === "default" && mode === "cli" && "Describe a task in natural language"}
      </div>
      <div className="live-chat__empty-hint">
        {emptyVariant === "copilot" && "Chat with Copilot about the codebase."}
        {emptyVariant === "default" && mode === "chat" && "Type a message below to begin chatting."}
        {emptyVariant === "default" && mode === "agent" && "I'll use tools to help answer your questions."}
        {emptyVariant === "default" && mode === "ide" && "I'll help you write and organize code files."}
        {emptyVariant === "default" && mode === "cli" && "I'll execute commands to complete your task."}
      </div>
    </div>
  );

  return (
    <div className={`live-chat__main ${className ?? ""}`.trim()}>
      <div className="live-chat__shell">
        <div className="live-chat__messages" role="log" aria-live="polite">
          {visibleCount === 0
            ? renderEmptyState()
            : displayItems.map((item) =>
                item.kind === "tool_round" ? (
                  <ToolRoundBubble
                    key={item.key}
                    mode={mode}
                    pre={item.pre}
                    toolMessages={item.toolMessages}
                    post={item.post}
                    compactTools={compactTools}
                  />
                ) : (
                  <MessageBubble
                    key={item.key}
                    message={item.message}
                    compactTools={compactTools}
                    mode={mode}
                  />
                )
              )}
          <div ref={messagesEndRef} />
        </div>

        {(error || traceId) && (
          <div className="live-chat__status">
            {error && (
              <div className="live-chat__error">
                <span>⚠️ {error}</span>
                <button onClick={onDismissError}>Dismiss</button>
              </div>
            )}
            {traceId && (
              <div className="live-chat__trace">
                Trace: <a href={`/api/debug/traces?id=${traceId}`} target="_blank" rel="noreferrer">{traceId.slice(0, 8)}...</a>
              </div>
            )}
          </div>
        )}

        <ChatInput
          onSend={onSend}
          disabled={isInputDisabled || quotaUsed >= quotaLimit}
          mode={mode}
        />
      </div>
    </div>
  );
}
