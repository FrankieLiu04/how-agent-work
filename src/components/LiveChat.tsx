"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useChat, type ChatMode, type ChatMessage, type ProtocolEvent } from "~/hooks/useChat";
import { useConversations } from "~/hooks/useConversations";
import { useSandbox } from "~/hooks/useSandbox";
import { useQuota } from "~/hooks/useQuota";
import { ChatInput } from "~/components/ChatInput";
import { QuotaIndicator, LimitIndicator } from "~/components/QuotaIndicator";
import { ConversationList } from "~/components/ConversationList";
import { FileTree } from "~/components/FileTree";
import { ToolCallDisplay, type ToolCall } from "~/components/ToolCallDisplay";
import { TerminalView } from "~/components/TerminalView";

interface LiveChatProps {
  mode: ChatMode;
  isAuthed: boolean;
  onProtocolEvent?: (event: ProtocolEvent) => void;
}

export function LiveChat({
  mode,
  isAuthed,
  onProtocolEvent,
}: LiveChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>("");

  const {
    quota,
    refresh: refreshQuota,
  } = useQuota({ autoLoad: isAuthed });

  const {
    conversations,
    currentConversation,
    isLoading: convLoading,
    createConversation,
    selectConversation,
    deleteConversation,
  } = useConversations({
    mode: mode === "chat" ? "CHAT" : "AGENT",
    autoLoad: isAuthed && (mode === "chat" || mode === "agent"),
  });

  const {
    files,
    limits,
    cwd,
    terminalLines,
    isLoading: sandboxLoading,
    readFile,
    writeFile,
    deleteFile,
    execCommand,
    initSandbox,
  } = useSandbox({
    autoInit: isAuthed && (mode === "ide" || mode === "cli"),
  });

  const handleToolCall = useCallback(async (toolCall: ToolCall): Promise<unknown> => {
    const args = toolCall.arguments;

    switch (toolCall.name) {
      case "tavily_search": {
        return { status: "search_executed" };
      }
      case "read_file": {
        const path = args.path as string;
        const file = files.find((f) => f.path === path);
        return file ? { content: "File content loaded" } : { error: "File not found" };
      }
      case "write_file": {
        const path = args.path as string;
        const content = args.content as string;
        const success = await writeFile(path, content);
        return success ? { success: true } : { error: "Write failed" };
      }
      case "list_files": {
        const path = (args.path as string) ?? "/";
        const dirFiles = files.filter((f) => {
          const parent = f.path.substring(0, f.path.lastIndexOf("/")) || "/";
          return parent === path;
        });
        return { files: dirFiles.map((f) => f.path) };
      }
      case "delete_file": {
        const path = args.path as string;
        const success = await deleteFile(path);
        return success ? { success: true } : { error: "Delete failed" };
      }
      case "run_command": {
        const command = args.command as string;
        const result = await execCommand(command);
        return result;
      }
      case "search_files": {
        const pattern = args.pattern as string;
        const matches = files.filter((f) => f.path.includes(pattern));
        return { matches: matches.map((f) => f.path) };
      }
      default:
        return { error: `Unknown tool: ${toolCall.name}` };
    }
  }, [files, writeFile, deleteFile, execCommand]);

  const {
    messages,
    isLoading: chatLoading,
    error: chatError,
    sendMessage,
    clearMessages,
    traceId,
  } = useChat({
    mode,
    conversationId: currentConversation?.id,
    onToolCall: handleToolCall,
    onSuccess: refreshQuota,
    onProtocolEvent,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (content: string) => {
    if (!isAuthed) {
      return;
    }

    if ((mode === "chat" || mode === "agent") && !currentConversation) {
      await createConversation();
    }

    if ((mode === "ide" || mode === "cli") && files.length === 0) {
      await initSandbox();
    }

    await sendMessage(content);
  }, [isAuthed, mode, currentConversation, files.length, createConversation, initSandbox, sendMessage]);

  const handleFileSelect = useCallback(async (path: string) => {
    if (!path) return;
    setSelectedPath(path);
    const content = await readFile(path);
    setSelectedContent(content ?? "");
  }, [readFile]);

  useEffect(() => {
    if (mode !== "ide") return;
    if (selectedPath || files.length === 0) return;
    void handleFileSelect(files[0]?.path ?? "");
  }, [mode, selectedPath, files, handleFileSelect]);

  if (!isAuthed) {
    return (
      <div className="live-chat-auth">
        <div className="auth-message">
          <span className="auth-icon">🔐</span>
          <span>Please sign in to use the real LLM interaction feature.</span>
          <a href="/api/auth/signin" className="auth-link">Sign in with GitHub</a>
        </div>
        <style jsx>{`
          .live-chat-auth {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 24px;
          }
          .auth-message {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            text-align: center;
            color: var(--text-sec);
            font-size: 14px;
          }
          .auth-icon {
            font-size: 32px;
          }
          .auth-link {
            padding: 8px 16px;
            background: var(--accent);
            color: white;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 500;
          }
          .auth-link:hover {
            opacity: 0.9;
          }
        `}</style>
      </div>
    );
  }

  const isLoading = chatLoading || convLoading || sandboxLoading;

  const renderEmptyState = (variant: "default" | "copilot" = "default") => (
    <div className="messages-empty">
      <div className="empty-icon">
        {mode === "chat" && "💬"}
        {mode === "agent" && "🤖"}
        {mode === "ide" && "💻"}
        {mode === "cli" && "⚡"}
      </div>
      <div className="empty-title">
        {variant === "copilot" && "Ask Copilot"}
        {variant === "default" && mode === "chat" && "Start a conversation"}
        {variant === "default" && mode === "agent" && "Ask me anything (I can search the web)"}
        {variant === "default" && mode === "ide" && "Describe what you want to build"}
        {variant === "default" && mode === "cli" && "Describe a task in natural language"}
      </div>
      <div className="empty-hint">
        {variant === "copilot" && "Chat with Copilot about the codebase."}
        {variant === "default" && mode === "chat" && "Type a message below to begin chatting."}
        {variant === "default" && mode === "agent" && "I'll use tools to help answer your questions."}
        {variant === "default" && mode === "ide" && "I'll help you write and organize code files."}
        {variant === "default" && mode === "cli" && "I'll execute commands to complete your task."}
      </div>
    </div>
  );

  const renderChatPane = (options?: { compactTools?: boolean; className?: string; emptyVariant?: "default" | "copilot" }) => (
    <div className={`live-chat-main ${options?.className ?? ""}`}>
      <div className="messages-container">
        {messages.length === 0 ? (
          renderEmptyState(options?.emptyVariant ?? "default")
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} compactTools={options?.compactTools} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {chatError && (
        <div className="chat-error">
          <span>⚠️ {chatError}</span>
          <button onClick={() => clearMessages()}>Dismiss</button>
        </div>
      )}

      {traceId && (
        <div className="trace-id">
          Trace: <a href={`/api/debug/traces?id=${traceId}`} target="_blank" rel="noreferrer">{traceId.slice(0, 8)}...</a>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        disabled={isLoading || quota.used >= quota.limit}
        mode={mode}
      />
    </div>
  );

  if (mode === "ide") {
    return (
      <div className="live-chat ide-layout">
        <div className="ide-workspace">
          <div className="vscode-titlebar">
            <span className="vscode-dot red"></span>
            <span className="vscode-dot yellow"></span>
            <span className="vscode-dot green"></span>
            <span className="vscode-title">Workspace</span>
          </div>
          <div className="vscode-body">
            <div className="vscode-activitybar">
              <div className="activity-icon active"></div>
              <div className="activity-icon"></div>
              <div className="activity-icon"></div>
              <div className="activity-icon"></div>
            </div>
            <div className="vscode-explorer">
              <div className="explorer-header">Explorer</div>
              <FileTree
                files={files}
                selectedPath={selectedPath}
                onSelect={handleFileSelect}
                onDelete={deleteFile}
                disabled={isLoading}
              />
              {limits && (
                <div className="panel-limits">
                  <LimitIndicator
                    current={limits.currentFileCount}
                    max={limits.maxFiles}
                    label="Files"
                  />
                  <LimitIndicator
                    current={limits.currentTotalSize}
                    max={limits.maxTotalSize}
                    label="Storage"
                    unit="KB"
                  />
                </div>
              )}
            </div>
            <div className="vscode-editor">
              <div className="editor-tabs">
                <div className="editor-tab active">
                  {selectedPath ? selectedPath.split("/").pop() : "Untitled"}
                </div>
              </div>
              <pre className="editor-content">
                {selectedPath ? (selectedContent || "(empty)") : "Select a file to view its contents."}
              </pre>
            </div>
          </div>
        </div>
        <div className="copilot-panel">
          <div className="copilot-header">
            <span>Copilot Chat</span>
            <span className="copilot-status">Live</span>
          </div>
          {renderChatPane({ compactTools: true, className: "copilot-chat", emptyVariant: "copilot" })}
          <div className="panel-footer">
            <QuotaIndicator
              used={quota.used}
              max={quota.limit}
              resetTime={quota.resetAt}
            />
          </div>
        </div>
        <style jsx>{`
          .live-chat {
            display: flex;
            height: 100%;
            gap: 12px;
          }

          .live-chat-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
            background: var(--card-bg);
            border-radius: var(--radius);
            border: 1px solid var(--border);
            overflow: hidden;
          }

          .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .messages-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 24px;
          }

          .empty-icon {
            font-size: 48px;
            margin-bottom: 12px;
          }

          .empty-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 4px;
          }

          .empty-hint {
            font-size: 13px;
            color: var(--text-sec);
          }

          .chat-error {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(255, 59, 48, 0.1);
            border-top: 1px solid rgba(255, 59, 48, 0.2);
            font-size: 13px;
            color: var(--error, #ff3b30);
          }

          .chat-error button {
            padding: 4px 8px;
            background: transparent;
            border: 1px solid currentColor;
            border-radius: 4px;
            color: inherit;
            cursor: pointer;
            font-size: 11px;
          }

          .trace-id {
            padding: 4px 12px;
            font-size: 10px;
            color: var(--text-sec);
            font-family: var(--font-mono);
            border-top: 1px solid var(--border);
          }

          .trace-id a {
            color: var(--accent);
          }

          .ide-layout {
            background: var(--bg);
          }

          .ide-workspace {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #1e1e1e;
            border-radius: var(--radius);
            border: 1px solid #2a2a2a;
            overflow: hidden;
            min-width: 0;
          }

          .vscode-titlebar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            background: #2d2d2d;
            border-bottom: 1px solid #2a2a2a;
            font-size: 11px;
            color: #b8b8b8;
          }

          .vscode-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
          }

          .vscode-dot.red { background: #ff5f56; }
          .vscode-dot.yellow { background: #ffbd2e; }
          .vscode-dot.green { background: #27c93f; }

          .vscode-title {
            margin-left: 8px;
          }

          .vscode-body {
            flex: 1;
            display: grid;
            grid-template-columns: 44px 220px 1fr;
            min-height: 0;
          }

          .vscode-activitybar {
            background: #252526;
            border-right: 1px solid #2a2a2a;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px 0;
            gap: 12px;
          }

          .activity-icon {
            width: 18px;
            height: 18px;
            border-radius: 4px;
            background: #3c3c3c;
          }

          .activity-icon.active {
            background: #007acc;
          }

          .vscode-explorer {
            background: #1f1f1f;
            border-right: 1px solid #2a2a2a;
            display: flex;
            flex-direction: column;
            min-width: 0;
          }

          .explorer-header {
            padding: 8px 12px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #a0a0a0;
            border-bottom: 1px solid #2a2a2a;
            background: #252526;
          }

          .vscode-editor {
            display: flex;
            flex-direction: column;
            min-width: 0;
            background: #1e1e1e;
          }

          .editor-tabs {
            height: 34px;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 0 10px;
            background: #252526;
            border-bottom: 1px solid #2a2a2a;
            color: #bdbdbd;
            font-size: 12px;
          }

          .editor-tab {
            padding: 6px 10px;
            border-radius: 6px 6px 0 0;
            background: #2d2d2d;
          }

          .editor-tab.active {
            background: #1e1e1e;
            border-top: 2px solid #007acc;
            color: #fff;
          }

          .editor-content {
            flex: 1;
            margin: 0;
            padding: 14px 16px;
            font-family: var(--font-mono);
            font-size: 13px;
            color: #9cdcfe;
            overflow: auto;
            white-space: pre-wrap;
            background: #1e1e1e;
          }

          .copilot-panel {
            width: 320px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
            background: var(--card-bg);
            border-radius: var(--radius);
            border: 1px solid var(--border);
            overflow: hidden;
          }

          .copilot-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            font-size: 12px;
            font-weight: 600;
            background: var(--bg);
            border-bottom: 1px solid var(--border);
          }

          .copilot-status {
            font-size: 10px;
            color: var(--text-sec);
          }

          .copilot-chat {
            border: none;
            border-radius: 0;
            background: transparent;
          }

          .panel-limits {
            background: #1b1b1b;
            border-top: 1px solid #2a2a2a;
            border-bottom: 1px solid #2a2a2a;
            padding: 4px 0;
          }

          .panel-footer {
            margin-top: auto;
            padding: 0 10px 10px;
          }
        `}</style>
      </div>
    );
  }

  if (mode === "cli") {
    return (
      <div className="live-chat cli-layout">
        <div className="cli-console">
          <div className="cli-header">
            <span className="cli-title">claude-code</span>
            <span className={`cli-status ${isLoading ? "running" : "idle"}`}>
              {isLoading ? "running" : "idle"}
            </span>
          </div>
          <div className="cli-body">
            {messages.length === 0 ? (
              <div className="cli-empty">Type a task and press Enter.</div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`cli-line ${msg.role}`}>
                  <span className="cli-prefix">
                    {msg.role === "user" ? ">" : msg.role === "assistant" ? "$" : "#"}
                  </span>
                  <div className="cli-text">
                    {msg.content || (msg.isStreaming ? "..." : "")}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="cli-tool-calls">
                        <ToolCallDisplay toolCalls={msg.toolCalls} compact />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          {chatError && (
            <div className="cli-error">Error: {chatError}</div>
          )}
          {traceId && (
            <div className="cli-trace">
              Trace: <a href={`/api/debug/traces?id=${traceId}`} target="_blank" rel="noreferrer">{traceId.slice(0, 8)}...</a>
            </div>
          )}
          <CliInput onSend={handleSend} disabled={isLoading || quota.used >= quota.limit} />
        </div>
        <div className="live-chat-panel">
          <TerminalView
            lines={terminalLines}
            cwd={cwd}
            isRunning={isLoading}
          />
          <div className="panel-footer">
            <QuotaIndicator
              used={quota.used}
              max={quota.limit}
              resetTime={quota.resetAt}
            />
          </div>
        </div>
        <style jsx>{`
          .live-chat {
            display: flex;
            height: 100%;
            gap: 12px;
          }

          .cli-layout {
            background: var(--bg);
          }

          .cli-console {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #0b0d10;
            border-radius: var(--radius);
            border: 1px solid #1f2328;
            overflow: hidden;
            min-width: 0;
            font-family: var(--font-mono);
          }

          .cli-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #111418;
            border-bottom: 1px solid #1f2328;
            font-size: 12px;
            color: #a7b0ba;
          }

          .cli-title {
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-size: 11px;
          }

          .cli-status {
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 999px;
            background: #1f2328;
            color: #9aa4af;
          }

          .cli-status.running {
            color: #7ee787;
            border: 1px solid rgba(126, 231, 135, 0.3);
          }

          .cli-body {
            flex: 1;
            padding: 12px 14px;
            overflow-y: auto;
            font-size: 13px;
            line-height: 1.6;
            color: #e6edf3;
          }

          .cli-empty {
            color: #6b7280;
            font-size: 12px;
          }

          .cli-line {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 8px;
          }

          .cli-prefix {
            color: #7ee787;
            font-weight: 700;
          }

          .cli-line.assistant .cli-prefix {
            color: #58a6ff;
          }

          .cli-line.tool .cli-prefix {
            color: #f2cc60;
          }

          .cli-text {
            flex: 1;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .cli-tool-calls {
            margin-top: 6px;
          }

          .cli-error {
            padding: 6px 12px;
            background: rgba(248, 81, 73, 0.15);
            color: #f85149;
            border-top: 1px solid rgba(248, 81, 73, 0.3);
            font-size: 12px;
          }

          .cli-trace {
            padding: 4px 12px;
            font-size: 10px;
            color: #8b949e;
            border-top: 1px solid #1f2328;
          }

          .cli-trace a {
            color: #58a6ff;
          }

          .live-chat-panel {
            width: 300px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
          }

          .panel-footer {
            margin-top: auto;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="live-chat">
      {(mode === "chat" || mode === "agent") && (
        <div className="live-chat-sidebar">
          <ConversationList
            conversations={conversations}
            currentId={currentConversation?.id ?? null}
            onSelect={selectConversation}
            onDelete={deleteConversation}
            onNew={createConversation}
            disabled={isLoading}
          />
          <div className="sidebar-footer">
            <QuotaIndicator
              used={quota.used}
              max={quota.limit}
              resetTime={quota.resetAt}
            />
          </div>
        </div>
      )}

      {renderChatPane()}

      <style jsx>{`
        .live-chat {
          display: flex;
          height: 100%;
          gap: 12px;
        }

        .live-chat-sidebar {
          width: 240px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
        }

        .sidebar-footer {
          margin-top: auto;
        }

        .live-chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: var(--card-bg);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          overflow: hidden;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .messages-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .empty-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 4px;
        }

        .empty-hint {
          font-size: 13px;
          color: var(--text-sec);
        }

        .chat-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(255, 59, 48, 0.1);
          border-top: 1px solid rgba(255, 59, 48, 0.2);
          font-size: 13px;
          color: var(--error, #ff3b30);
        }

        .chat-error button {
          padding: 4px 8px;
          background: transparent;
          border: 1px solid currentColor;
          border-radius: 4px;
          color: inherit;
          cursor: pointer;
          font-size: 11px;
        }

        .trace-id {
          padding: 4px 12px;
          font-size: 10px;
          color: var(--text-sec);
          font-family: var(--font-mono);
          border-top: 1px solid var(--border);
        }

        .trace-id a {
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}

function MessageBubble({
  message,
  compactTools = false,
}: {
  message: ChatMessage;
  compactTools?: boolean;
}) {
  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="bubble-content">
        {message.content || (message.isStreaming ? "..." : "")}
      </div>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <ToolCallDisplay toolCalls={message.toolCalls} compact={compactTools} />
      )}
      <style jsx>{`
        .message-bubble {
          max-width: 85%;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .message-bubble.user {
          align-self: flex-end;
        }

        .message-bubble.assistant {
          align-self: flex-start;
        }

        .message-bubble.tool {
          align-self: center;
          width: 100%;
          max-width: 100%;
        }

        .bubble-content {
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .message-bubble.user .bubble-content {
          background: var(--accent);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message-bubble.assistant .bubble-content {
          background: var(--bg);
          border: 1px solid var(--border);
          border-bottom-left-radius: 4px;
        }

        .message-bubble.tool .bubble-content {
          background: transparent;
          padding: 0;
        }
      `}</style>
    </div>
  );
}

function CliInput({
  onSend,
  disabled,
}: {
  onSend: (message: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="cli-input">
      <span className="cli-input-prompt">&gt;</span>
      <textarea
        className="cli-input-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Running..." : "Type a command..."}
        disabled={disabled}
        rows={1}
      />
      <button
        className={`cli-input-send ${!value.trim() || disabled ? "disabled" : ""}`}
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
      >
        Run
      </button>
      <style jsx>{`
        .cli-input {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid #1f2328;
          background: #0d1117;
        }

        .cli-input-prompt {
          color: #7ee787;
          font-weight: 700;
        }

        .cli-input-textarea {
          flex: 1;
          background: transparent;
          border: none;
          resize: none;
          color: #e6edf3;
          font-family: var(--font-mono);
          font-size: 13px;
          outline: none;
        }

        .cli-input-textarea::placeholder {
          color: #6b7280;
        }

        .cli-input-send {
          background: #1f6feb;
          border: none;
          color: #fff;
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
        }

        .cli-input-send.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
