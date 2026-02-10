"use client";

import { type RefObject, useEffect, useState } from "react";
import { QuotaIndicator } from "~/components/QuotaIndicator";
import { type Conversation } from "~/components/ConversationList";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";
import { ChatPane } from "~/components/live-chat/ChatPane";

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function IdeCopilotPane({
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
}: {
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
  messagesEndRef: RefObject<HTMLDivElement | null>;
}) {
  const [view, setView] = useState<"history" | "chat">(currentId ? "chat" : "history");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!currentId) {
      setView("history");
    }
  }, [currentId]);

  const currentConversation = currentId
    ? conversations.find((c) => c.id === currentId) ?? null
    : null;

  const title = currentConversation?.title || "Untitled";

  return (
    <div className="live-chat__ide-copilot">
      <div className="live-chat__ide-copilot-header">
        <div className="live-chat__ide-copilot-left">
          {view === "chat" && (
            <button
              className="live-chat__button live-chat__button--secondary"
              disabled={isLoading}
              onClick={() => setView("history")}
            >
              Back
            </button>
          )}
          <div className="live-chat__ide-copilot-title">
            {view === "chat" ? title : "History"}
          </div>
        </div>
        <div className="live-chat__ide-copilot-actions">
          <button
            className="live-chat__button"
            disabled={isLoading}
            onClick={() => {
              onNew();
              setView("chat");
            }}
          >
            New Conversation
          </button>
        </div>
      </div>

      <div className="live-chat__ide-copilot-body">
        {view === "history" ? (
          <div className="live-chat__ide-history" role="list">
            {conversations.length === 0 ? (
              <div className="live-chat__ide-history-empty">No conversations yet</div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`live-chat__ide-history-item ${
                    currentId === conv.id ? "is-active" : ""
                  } ${isLoading ? "is-disabled" : ""}`}
                  role="listitem"
                  onClick={() => {
                    if (isLoading) return;
                    onSelect(conv.id);
                    setView("chat");
                  }}
                >
                  <div className="live-chat__ide-history-bubble">
                    <div className="live-chat__ide-history-row">
                      <div className="live-chat__ide-history-name" title={conv.title}>
                        {conv.title || "Untitled"}
                      </div>
                      <button
                        className={`live-chat__ide-history-delete ${
                          deleteConfirm === conv.id ? "is-confirm" : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isLoading) return;
                          if (deleteConfirm === conv.id) {
                            onDelete(conv.id);
                            setDeleteConfirm(null);
                            return;
                          }
                          setDeleteConfirm(conv.id);
                          setTimeout(() => setDeleteConfirm(null), 3000);
                        }}
                        title={deleteConfirm === conv.id ? "Click again to confirm" : "Delete"}
                      >
                        {deleteConfirm === conv.id ? "✓" : "×"}
                      </button>
                    </div>
                    <div className="live-chat__ide-history-meta">
                      <span>{formatDate(conv.updatedAt)}</span>
                      {conv.messageCount !== undefined && <span>{conv.messageCount} msgs</span>}
                      <span className="live-chat__ide-history-mode">{conv.mode}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
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
            compactTools
            className="live-chat__ide-copilot-chat"
            emptyVariant="copilot"
          />
        )}
      </div>

      <div className="live-chat__ide-copilot-footer">
        <QuotaIndicator used={quotaUsed} max={quotaLimit} resetTime={quotaResetAt} />
      </div>
    </div>
  );
}
