"use client";

import { useMemo, useState } from "react";
import { ToolCallDisplay, type ToolCall } from "~/components/ToolCallDisplay";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";

function MessageContent({ content, isStreaming }: { content?: string | null; isStreaming?: boolean }) {
  if (!content) {
    return isStreaming ? <span className="live-chat__streaming-dots">●●●</span> : null;
  }

  const parts = content.split(/(```[\s\S]*?```)/g);
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

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars) + "\n...(truncated)...", truncated: true };
}

export function ToolRoundBubble({
  mode,
  pre,
  toolMessages,
  post,
  compactTools,
}: {
  mode: ChatMode;
  pre: ChatMessage;
  toolMessages: ChatMessage[];
  post?: ChatMessage;
  compactTools?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toolCalls = pre.toolCalls ?? [];

  const toolResultByCallId = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of toolMessages) {
      if (msg.role !== "tool") continue;
      if (!msg.toolCallId) continue;
      if (typeof msg.content !== "string") continue;
      map.set(msg.toolCallId, msg.content);
    }
    return map;
  }, [toolMessages]);

  const effectiveToolCalls: ToolCall[] = useMemo(() => {
    if (toolCalls.length === 0) return [];
    return toolCalls.map((tc) => {
      const msgContent = toolResultByCallId.get(tc.id);
      if (!msgContent || tc.result) return tc;
      return {
        ...tc,
        status: "completed",
        result: { success: true, data: msgContent },
      };
    });
  }, [toolCalls, toolResultByCallId]);

  return (
    <div className="live-chat__bubble live-chat__bubble--assistant live-chat__bubble--tool-round">
      <div className="live-chat__bubble-avatar">🤖</div>
      <div className="live-chat__bubble-body">
        <div className="live-chat__bubble-content">
          <MessageContent content={pre.content} isStreaming={pre.isStreaming} />
          {pre.isStreaming && pre.content && <span className="live-chat__streaming-cursor">▍</span>}
        </div>

        {effectiveToolCalls.length > 0 && <ToolCallDisplay toolCalls={effectiveToolCalls} compact={compactTools} />}

        {effectiveToolCalls.length > 0 && (
          <div className="live-chat__tool-results">
            {effectiveToolCalls.map((tc) => {
              const raw =
                toolResultByCallId.get(tc.id) ??
                (tc.result?.data != null
                  ? typeof tc.result.data === "string"
                    ? tc.result.data
                    : JSON.stringify(tc.result.data, null, 2)
                  : "");
              if (!raw) return null;

              const isExpanded = expanded[tc.id] === true;
              const { text, truncated } = truncateText(raw, 800);

              return (
                <div key={tc.id} className="live-chat__tool-result">
                  <pre className="live-chat__tool-result-pre">{isExpanded ? raw : text}</pre>
                  {truncated && (
                    <button
                      type="button"
                      className="live-chat__button live-chat__button--secondary live-chat__tool-result-toggle"
                      onClick={() => setExpanded((prev) => ({ ...prev, [tc.id]: !prev[tc.id] }))}
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {post && (
          <div className="live-chat__bubble-content live-chat__bubble-content--post">
            <MessageContent content={post.content} isStreaming={post.isStreaming} />
            {post.isStreaming && post.content && <span className="live-chat__streaming-cursor">▍</span>}
          </div>
        )}
      </div>
    </div>
  );
}

