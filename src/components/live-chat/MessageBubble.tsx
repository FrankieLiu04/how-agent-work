"use client";

import { ToolCallDisplay } from "~/components/ToolCallDisplay";
import { type ChatMessage } from "~/hooks/useChat";

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
}: {
  message: ChatMessage;
  compactTools?: boolean;
}) {
  const roleClass = `live-chat__bubble--${message.role}`;

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
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallDisplay toolCalls={message.toolCalls} compact={compactTools} />
        )}
      </div>
    </div>
  );
}
