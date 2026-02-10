"use client";

import { type RefObject } from "react";
import { ConversationList, type Conversation } from "~/components/ConversationList";
import { QuotaIndicator } from "~/components/QuotaIndicator";
import { ToolCallDisplay } from "~/components/ToolCallDisplay";
import { type TerminalLine } from "~/components/TerminalView";
import { type ChatMessage } from "~/hooks/useChat";
import { CliInput } from "~/components/live-chat/CliInput";

interface CliLayoutProps {
  messages: ChatMessage[];
  terminalLines: TerminalLine[];
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
  messagesEndRef: RefObject<HTMLDivElement>;
}

export function CliLayout({
  messages,
  terminalLines,
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
  messagesEndRef,
}: CliLayoutProps) {
  return (
    <div className="live-chat live-chat--cli">
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

      <div className="live-chat__cli-console">
        <div className="live-chat__cli-header">
          <span className="live-chat__cli-title">claude-code</span>
          <span className={`live-chat__cli-status ${isLoading ? "live-chat__cli-status--running" : ""}`}>
            {isLoading ? "running" : "idle"}
          </span>
        </div>
        <div className="live-chat__cli-body">
          {messages.length === 0 ? (
            <div className="live-chat__cli-empty">Type a task and press Enter.</div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`live-chat__cli-line live-chat__cli-line--${msg.role}`}>
                <span className="live-chat__cli-prefix">
                  {msg.role === "user" ? ">" : msg.role === "assistant" ? "$" : "#"}
                </span>
                <div className="live-chat__cli-text">
                  {msg.content || (msg.isStreaming ? "..." : "")}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="live-chat__cli-tool-calls">
                      <ToolCallDisplay toolCalls={msg.toolCalls} compact />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {terminalLines.length > 0 && (
            <div className="live-chat__cli-terminal">
              <div className="live-chat__cli-terminal-title">Terminal Output</div>
              {terminalLines.map((line) => (
                <div key={line.id} className={`live-chat__cli-term-line live-chat__cli-term-line--${line.type}`}>
                  {line.type === "command" && (
                    <>
                      <span className="live-chat__cli-prefix">$</span>
                      <span className="live-chat__cli-text">{line.content}</span>
                    </>
                  )}
                  {line.type === "output" && <pre className="live-chat__cli-output">{line.content}</pre>}
                  {line.type === "error" && <pre className="live-chat__cli-error-text">{line.content}</pre>}
                  {line.type === "system" && <span className="live-chat__cli-system">{line.content}</span>}
                </div>
              ))}
            </div>
          )}
          <CliInput onSend={onSend} disabled={isInputDisabled || quotaUsed >= quotaLimit} />
          <div ref={messagesEndRef} />
        </div>
        {error && <div className="live-chat__cli-error">Error: {error}</div>}
        {traceId && (
          <div className="live-chat__cli-trace">
            Trace: <a href={`/api/debug/traces?id=${traceId}`} target="_blank" rel="noreferrer">{traceId.slice(0, 8)}...</a>
          </div>
        )}
      </div>
    </div>
  );
}
