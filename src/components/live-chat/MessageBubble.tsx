"use client";

import { useEffect, useState } from "react";
import { ToolCallDisplay } from "~/components/ToolCallDisplay";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";

function MessageContent({ message }: { message: ChatMessage }) {
  if (!message.content) {
    return message.isStreaming ? (
      <span className="live-chat__streaming-dots">●●●</span>
    ) : null;
  }

  const parts = message.content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const lines = part.slice(3, -3);
      const firstNewline = lines.indexOf("\n");
      const code = firstNewline >= 0 ? lines.slice(firstNewline + 1) : lines;
      const lang = firstNewline >= 0 ? lines.slice(0, firstNewline).trim() : "";
      return (
        <pre key={i} className="live-chat__code-block">
          {lang && <div className="live-chat__code-lang">{lang}</div>}
          <code>{code}</code>
        </pre>
      );
    }

    const inlineParts = part.split(/(`[^`]+`)/g);
    return (
      <span key={i}>
        {inlineParts.map((ip, j) => {
          if (ip.startsWith("`") && ip.endsWith("`")) {
            return (
              <code key={j} className="live-chat__inline-code">
                {ip.slice(1, -1)}
              </code>
            );
          }

          const boldParts = ip.split(/(\*\*[^*]+\*\*)/g);
          return boldParts.map((bp, k) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              return <strong key={`${j}-${k}`}>{bp.slice(2, -2)}</strong>;
            }
            return bp;
          });
        })}
      </span>
    );
  });
}

export function MessageBubble({
  message,
  compactTools = false,
  mode,
}: {
  message: ChatMessage;
  compactTools?: boolean;
  mode: ChatMode;
}) {
  const roleClass = `live-chat__bubble--${message.role}`;
  const hasWorking =
    mode === "agent" &&
    message.role === "assistant" &&
    message.working &&
    message.working.summary.length > 0;
  const [workingCollapsed, setWorkingCollapsed] = useState(
    message.working?.status === "done"
  );

  useEffect(() => {
    if (message.working?.status === "done") {
      setWorkingCollapsed(true);
    }
  }, [message.working?.status]);

  const showToolCalls = !(hasWorking && message.role === "assistant");
  const workingStatusLabel =
    message.working?.status === "working" ? "Working" : "Done";

  return (
    <div className={`live-chat__bubble ${roleClass}`}>
      <div className="live-chat__bubble-avatar">
        {message.role === "user" ? "👤" : message.role === "assistant" ? "🤖" : "🔧"}
      </div>
      <div className="live-chat__bubble-body">
        <div className="live-chat__bubble-content">
          <MessageContent message={message} />
          {message.isStreaming && message.content && (
            <span className="live-chat__streaming-cursor">▍</span>
          )}
        </div>
        {hasWorking && message.working && (
          <div className={`live-chat__working ${workingCollapsed ? "is-collapsed" : ""}`}>
            <button
              type="button"
              className="live-chat__working-toggle"
              onClick={() => setWorkingCollapsed((prev) => !prev)}
            >
              <span className="live-chat__working-icon">🔍</span>
              <span className="live-chat__working-title">Working</span>
              <span className={`live-chat__working-status live-chat__working-status--${message.working.status}`}>
                {workingStatusLabel}
              </span>
              <span className="live-chat__working-caret">
                {workingCollapsed ? "▶" : "▼"}
              </span>
            </button>
            {!workingCollapsed && (
              <div className="live-chat__working-body">
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <ToolCallDisplay toolCalls={message.toolCalls} compact />
                )}
                <div className="live-chat__working-summary">
                  {message.working.summary.map((item, index) => (
                    <div key={`${message.id}-work-${index}`} className="live-chat__working-line">
                      <span className="live-chat__working-bullet">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {showToolCalls && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallDisplay toolCalls={message.toolCalls} compact={compactTools} />
        )}
      </div>
    </div>
  );
}
