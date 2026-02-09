"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  mode?: "chat" | "agent" | "ide" | "cli";
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  maxLength = 500,
  mode = "chat",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 120); // Max 120px (~4 lines)
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const charCount = value.length;
  const isOverLimit = charCount > maxLength;
  const isNearLimit = charCount >= maxLength * 0.8;

  // Mode-specific placeholders
  const getPlaceholder = () => {
    if (placeholder !== "Type a message...") return placeholder;
    switch (mode) {
      case "chat":
        return "Ask me anything...";
      case "agent":
        return "Ask a question (I can search the web)...";
      case "ide":
        return "Describe what you want to build...";
      case "cli":
        return "Describe a task (e.g., 'create a Python script')...";
      default:
        return placeholder;
    }
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          disabled={disabled}
          rows={1}
          aria-label="Message input"
        />
        <button
          className={`chat-input-send ${!value.trim() || disabled || isOverLimit ? "disabled" : ""}`}
          onClick={handleSubmit}
          disabled={!value.trim() || disabled || isOverLimit}
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
      <div className="chat-input-footer">
        <span className={`char-count ${isOverLimit ? "over" : isNearLimit ? "near" : ""}`}>
          {charCount}/{maxLength}
        </span>
        {disabled && <span className="input-status">Generating...</span>}
      </div>
      <style jsx>{`
        .chat-input-container {
          padding: 12px;
          background: var(--card-bg);
          border-top: 1px solid var(--border);
        }

        .chat-input-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: var(--bg);
          border-radius: 20px;
          border: 1px solid var(--border);
          padding: 8px 12px;
          transition: border-color 0.2s;
        }

        .chat-input-wrapper:focus-within {
          border-color: var(--accent);
        }

        .chat-input-textarea {
          flex: 1;
          border: none;
          background: transparent;
          resize: none;
          font-size: 14px;
          line-height: 1.4;
          color: var(--text);
          min-height: 24px;
          max-height: 120px;
          outline: none;
          font-family: inherit;
        }

        .chat-input-textarea::placeholder {
          color: var(--text-sec);
          opacity: 0.6;
        }

        .chat-input-textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .chat-input-send {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--accent);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          transition: opacity 0.2s, transform 0.1s;
          flex-shrink: 0;
        }

        .chat-input-send:hover:not(.disabled) {
          opacity: 0.9;
          transform: scale(1.05);
        }

        .chat-input-send:active:not(.disabled) {
          transform: scale(0.95);
        }

        .chat-input-send.disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .chat-input-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 4px 0;
          font-size: 11px;
        }

        .char-count {
          color: var(--text-sec);
          opacity: 0.6;
        }

        .char-count.near {
          color: var(--warning, #ff9f0a);
          opacity: 1;
        }

        .char-count.over {
          color: var(--error, #ff3b30);
          opacity: 1;
          font-weight: 600;
        }

        .input-status {
          color: var(--accent);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
