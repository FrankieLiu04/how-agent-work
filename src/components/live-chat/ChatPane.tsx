"use client";

import { type RefObject } from "react";
import { ChatInput } from "~/components/ChatInput";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";
import { MessageBubble } from "~/components/live-chat/MessageBubble";

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
          {messages.length === 0
            ? renderEmptyState()
            : (mode === "agent" ? messages.filter((msg) => msg.role !== "tool") : messages).map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  compactTools={compactTools}
                  mode={mode}
                />
              ))}
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
