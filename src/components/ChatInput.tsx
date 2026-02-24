"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { type ChatMode } from "~/types";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  mode?: ChatMode;
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

  const presets: Array<{ label: string; text: string }> =
    mode === "agent"
      ? [
          { label: "热点", text: "帮我检索一下今天美股/科技板块的热点新闻，给出三条要点。" },
          { label: "对比", text: "对比一下 OpenAI 与 Anthropic 近期动态（请用搜索结果佐证）。" },
          { label: "学习", text: "解释一下什么是 SSE，并给一个最小示例。" },
        ]
      : mode === "ide"
        ? [
            { label: "新组件", text: "在 /src/components 下新增一个 Button 组件，支持 primary/secondary 两种样式。" },
            { label: "修 Bug", text: "帮我排查一个 TypeScript 报错并给出修复步骤。" },
            { label: "重构", text: "把一个重复逻辑提取为 util 函数，并补一个单元测试。" },
          ]
        : mode === "cli"
          ? [
              { label: "搜索", text: "在项目里搜索 useReal 的定义与使用位置，并解释其作用。" },
              { label: "跑测试", text: "运行测试并修复失败用例，确保全部通过。" },
              { label: "找入口", text: "找出 /api/chat/stream 的端到端链路并整理成清单。" },
            ]
          : mode === "finance"
            ? [
                { label: "简报", text: "给我一份今日市场简报：指数、利率、美元、黄金、科技股要闻，并附上来源。" },
                { label: "持仓", text: "我有 60% 指数基金、20% 债券基金、20% 现金，风险偏好中等，目标 5 年。给出调整建议与学习清单。" },
                { label: "概念", text: "用通俗方式解释久期与利率风险，并举一个小例子。" },
              ]
            : [];

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
      case "finance":
        return "描述你的目标、约束与想分析的市场/持仓...";
      default:
        return placeholder;
    }
  };

  return (
    <div className="chat-input-container">
      {presets.length > 0 && (
        <div className="chat-input-presets">
          {presets.map((p) => (
            <button
              key={p.label}
              className="chat-input-preset"
              type="button"
              disabled={disabled}
              onClick={() => setValue(p.text)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
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
        {disabled && <span className="input-status">⏳ Generating...</span>}
      </div>
      <style jsx>{`
        .chat-input-container {
          padding: 12px;
          background: var(--card-bg);
          border-top: 1px solid var(--border);
        }

        .chat-input-presets {
          display: flex;
          gap: 8px;
          padding: 0 4px 10px;
          overflow-x: auto;
        }

        .chat-input-preset {
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          opacity: 0.9;
        }

        .chat-input-preset:disabled {
          opacity: 0.4;
          cursor: not-allowed;
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
