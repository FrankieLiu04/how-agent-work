"use client";

import { useState } from "react";

export interface Conversation {
  id: string;
  title: string;
  mode: "CHAT" | "AGENT" | "IDE" | "CLI";
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  maxConversations?: number;
  disabled?: boolean;
}

export function ConversationList({
  conversations,
  currentId,
  onSelect,
  onDelete,
  onNew,
  maxConversations = 10,
  disabled = false,
}: ConversationListProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  const canCreate = conversations.length < maxConversations;

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirm === id) {
      onDelete(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      // Auto-cancel after 3 seconds
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const formatDate = (dateStr: string) => {
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
  };

  return (
    <div className="conversation-list">
      <div className="list-header">
        <span className="list-title">Conversations</span>
        <span className="list-count">{conversations.length}/{maxConversations}</span>
      </div>
      
      <button 
        className={`new-conversation-btn ${!canCreate || disabled ? "disabled" : ""}`}
        onClick={onNew}
        disabled={!canCreate || disabled}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        New Conversation
      </button>

      <div className="list-items">
        {conversations.length === 0 ? (
          <div className="empty-state">
            <span>No conversations yet</span>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${currentId === conv.id ? "active" : ""} ${disabled ? "disabled" : ""}`}
              onClick={() => !disabled && onSelect(conv.id)}
            >
              <div className="item-content">
                <div className="item-title" title={conv.title}>
                  {conv.title || "Untitled"}
                </div>
                <div className="item-meta">
                  <span className="item-date">{formatDate(conv.updatedAt)}</span>
                  {conv.messageCount !== undefined && (
                    <span className="item-messages">{conv.messageCount} msgs</span>
                  )}
                </div>
              </div>
              <button
                className={`delete-btn ${deleteConfirm === conv.id ? "confirm" : ""}`}
                onClick={(e) => handleDelete(conv.id, e)}
                title={deleteConfirm === conv.id ? "Click again to confirm" : "Delete"}
              >
                {deleteConfirm === conv.id ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                )}
              </button>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .conversation-list {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--card-bg);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          overflow: hidden;
        }

        .list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }

        .list-title {
          font-weight: 600;
          font-size: 13px;
          color: var(--text);
        }

        .list-count {
          font-size: 11px;
          color: var(--text-sec);
          font-family: var(--font-mono);
        }

        .new-conversation-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin: 10px;
          padding: 8px 12px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .new-conversation-btn:hover:not(.disabled) {
          opacity: 0.9;
        }

        .new-conversation-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .list-items {
          flex: 1;
          overflow-y: auto;
          padding: 4px;
        }

        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100px;
          color: var(--text-sec);
          font-size: 12px;
        }

        .conversation-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          margin: 2px 0;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .conversation-item:hover:not(.disabled) {
          background: var(--bg);
        }

        .conversation-item.active {
          background: rgba(0, 122, 255, 0.1);
          border: 1px solid rgba(0, 122, 255, 0.2);
        }

        .conversation-item.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .item-content {
          flex: 1;
          min-width: 0;
        }

        .item-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-meta {
          display: flex;
          gap: 8px;
          margin-top: 2px;
          font-size: 11px;
          color: var(--text-sec);
        }

        .delete-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-sec);
          opacity: 0;
          transition: opacity 0.15s, color 0.15s, background 0.15s;
        }

        .conversation-item:hover .delete-btn {
          opacity: 1;
        }

        .delete-btn:hover {
          background: rgba(255, 59, 48, 0.1);
          color: var(--error, #ff3b30);
        }

        .delete-btn.confirm {
          opacity: 1;
          background: var(--error, #ff3b30);
          color: white;
        }
      `}</style>
    </div>
  );
}
