"use client";

import { type RefObject } from "react";
import { ConversationList, type Conversation } from "~/components/ConversationList";
import { QuotaIndicator } from "~/components/QuotaIndicator";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";
import { ChatPane } from "~/components/live-chat/ChatPane";

interface ChatLayoutProps {
  mode: ChatMode;
  messages: ChatMessage[];
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  isLoading: boolean;
  quotaUsed: number;
  quotaLimit: number;
  quotaResetAt: Date | null;
  onSend: (content: string) => void;
  isInputDisabled: boolean;
  error?: string | null;
  traceId?: string | null;
  onDismissError: () => void;
  messagesEndRef: RefObject<HTMLDivElement>;
}

export function ChatLayout({
  mode,
  messages,
  conversations,
  currentId,
  onSelect,
  onDelete,
  onNew,
  isLoading,
  quotaUsed,
  quotaLimit,
  quotaResetAt,
  onSend,
  isInputDisabled,
  error,
  traceId,
  onDismissError,
  messagesEndRef,
}: ChatLayoutProps) {
  return (
    <div className="live-chat live-chat--chat">
      <div className="live-chat__sidebar">
        <ConversationList
          conversations={conversations}
          currentId={currentId}
          onSelect={onSelect}
          onDelete={onDelete}
          onNew={onNew}
          disabled={isLoading}
        />
        <div className="live-chat__sidebar-footer">
          <QuotaIndicator used={quotaUsed} max={quotaLimit} resetTime={quotaResetAt} />
        </div>
      </div>

      <ChatPane
        mode={mode}
        messages={messages}
        isInputDisabled={isInputDisabled}
        onSend={onSend}
        error={error}
        traceId={traceId}
        onDismissError={onDismissError}
        quotaUsed={quotaUsed}
        quotaLimit={quotaLimit}
        messagesEndRef={messagesEndRef}
      />
    </div>
  );
}
