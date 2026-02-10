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
  const [lastConversationByMode, setLastConversationByMode] = useState<
    Record<ChatMode, string | null>
  >({
    chat: null,
    agent: null,
    ide: null,
    cli: null,
  });

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
    mode:
      mode === "chat"
        ? "CHAT"
        : mode === "agent"
          ? "AGENT"
          : mode === "ide"
            ? "IDE"
            : "CLI",
    autoLoad: isAuthed,
  });

  const {
    files,
    limits,
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
    if (!currentConversation?.id) return;
    setLastConversationByMode((prev) => ({
      ...prev,
      [mode]: currentConversation.id,
    }));
  }, [currentConversation?.id, mode]);

  useEffect(() => {
    if (currentConversation || conversations.length === 0) return;
    const remembered = lastConversationByMode[mode];
    const match = remembered
      ? conversations.find((c) => c.id === remembered)
      : null;
    if (match) {
      void selectConversation(match.id);
      return;
    }
    if (conversations[0]) {
      void selectConversation(conversations[0].id);
    }
  }, [mode, conversations, currentConversation, lastConversationByMode, selectConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (content: string) => {
    if (!isAuthed) {
      return;
    }

    let effectiveConversationId = currentConversation?.id ?? null;
    if (!effectiveConversationId) {
      const created = await createConversation();
      effectiveConversationId = created?.id ?? null;
      if (created?.id) {
        await selectConversation(created.id);
      }
    }

    if ((mode === "ide" || mode === "cli") && files.length === 0) {
      await initSandbox();
    }

    await sendMessage(content, { conversationId: effectiveConversationId });
  }, [isAuthed, mode, currentConversation, files.length, createConversation, selectConversation, initSandbox, sendMessage]);

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

  // Only disable input during actual chat generation, not during background loading
  const isInputDisabled = chatLoading;
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
      <div className="chat-shell">
        <div className="messages-container" role="log" aria-live="polite">
          {messages.length === 0 ? (
            renderEmptyState(options?.emptyVariant ?? "default")
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} compactTools={options?.compactTools} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {(chatError || traceId) && (
          <div className="chat-status">
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
          </div>
        )}

        <ChatInput
          onSend={handleSend}
          disabled={isInputDisabled || quota.used >= quota.limit}
          mode={mode}
        />
      </div>
    </div>
  );

  if (mode === "ide") {
    return (
      <div className="live-chat ide-layout">
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
        <div className="ide-files">
          <div className="ide-files-header">Files</div>
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
        <div className="ide-right">
          <div className="ide-editor-panel">
            <div className="editor-tabs">
              <div className="editor-tab active">
                {selectedPath ? selectedPath.split("/").pop() : "Untitled"}
              </div>
            </div>
            <pre className="editor-content">
              {selectedPath ? (selectedContent || "(empty)") : "Select a file to view its contents."}
            </pre>
          </div>
          <div className="ide-chat-panel">
            <div className="ide-chat-header">Extension Chat</div>
            {renderChatPane({ compactTools: true, className: "ide-chat-body", emptyVariant: "copilot" })}
          </div>
        </div>
        <style jsx>{`
          .live-chat {
            position: absolute;
            inset: 0;
            display: flex;
            gap: 12px;
            overflow: hidden;
          }

          .live-chat-sidebar {
            width: 240px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
            overflow: hidden;
          }

          .sidebar-footer {
            margin-top: auto;
            flex-shrink: 0;
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

          .chat-shell {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            overflow: hidden;
          }

          .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 0;
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

          .ide-files {
            width: 220px;
            display: flex;
            flex-direction: column;
            background: #1b1b1d;
            border-radius: var(--radius);
            border: 1px solid #2a2a2a;
            overflow: hidden;
            min-height: 0;
          }

          .ide-files-header {
            padding: 10px 12px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #a0a0a0;
            background: #242426;
            border-bottom: 1px solid #2a2a2a;
          }

          .ide-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-width: 0;
            min-height: 0;
            overflow: hidden;
          }

          .ide-editor-panel {
            flex: 1.2;
            display: flex;
            flex-direction: column;
            background: #1e1e1e;
            border-radius: var(--radius);
            border: 1px solid #2a2a2a;
            overflow: hidden;
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

          .ide-chat-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--card-bg);
            border-radius: var(--radius);
            border: 1px solid var(--border);
            overflow: hidden;
            min-height: 260px;
          }

          .ide-chat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            font-size: 12px;
            font-weight: 600;
            background: var(--bg);
            border-bottom: 1px solid var(--border);
          }

          .ide-chat-body {
            border: none;
            border-radius: 0;
            background: transparent;
          }

          .panel-limits {
            background: #1b1b1d;
            border-top: 1px solid #2a2a2a;
            padding: 4px 0;
          }

        `}</style>
      </div>
    );
  }

  if (mode === "cli") {
    return (
      <div className="live-chat cli-layout">
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
            {terminalLines.length > 0 && (
              <div className="cli-terminal">
                <div className="cli-terminal-title">Terminal Output</div>
                {terminalLines.map((line) => (
                  <div key={line.id} className={`cli-term-line ${line.type}`}>
                    {line.type === "command" && (
                      <>
                        <span className="cli-prefix">$</span>
                        <span className="cli-text">{line.content}</span>
                      </>
                    )}
                    {line.type === "output" && (
                      <pre className="cli-output">{line.content}</pre>
                    )}
                    {line.type === "error" && (
                      <pre className="cli-error-text">{line.content}</pre>
                    )}
                    {line.type === "system" && (
                      <span className="cli-system">{line.content}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <CliInput onSend={handleSend} disabled={isInputDisabled || quota.used >= quota.limit} />
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
        </div>
        <style jsx>{`
          .live-chat {
            position: absolute;
            inset: 0;
            display: flex;
            gap: 12px;
            overflow: hidden;
          }

          .live-chat-sidebar {
            width: 240px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
            overflow: hidden;
          }

          .sidebar-footer {
            margin-top: auto;
            flex-shrink: 0;
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
            min-height: 0;
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

          .cli-terminal {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid #1f2328;
          }

          .cli-terminal-title {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6b7280;
            margin-bottom: 8px;
          }

          .cli-term-line {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 6px;
          }

          .cli-output {
            margin: 0;
            color: #c9d1d9;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .cli-error-text {
            margin: 0;
            color: #f85149;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .cli-system {
            color: #f2cc60;
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
          position: absolute;
          inset: 0;
          display: flex;
          gap: 12px;
          overflow: hidden;
        }

        .live-chat-sidebar {
          width: 240px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
          overflow: hidden;
        }

        .sidebar-footer {
          margin-top: auto;
          flex-shrink: 0;
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

        .chat-shell {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }

        .chat-status {
          border-top: 1px solid var(--border);
          background: var(--bg);
          padding: 6px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          flex-shrink: 0;
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
          background: rgba(255, 59, 48, 0.1);
          border: 1px solid rgba(255, 59, 48, 0.2);
          border-radius: 6px;
          padding: 6px 10px;
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
          font-size: 10px;
          color: var(--text-sec);
          font-family: var(--font-mono);
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
  // Simple markdown-like rendering for assistant messages
  const renderContent = (text: string) => {
    if (!text) return message.isStreaming ? <span className="streaming-dots">●●●</span> : null;
    
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.slice(3, -3);
        const firstNewline = lines.indexOf("\n");
        const code = firstNewline >= 0 ? lines.slice(firstNewline + 1) : lines;
        const lang = firstNewline >= 0 ? lines.slice(0, firstNewline).trim() : "";
        return (
          <pre key={i} className="bubble-code-block">
            {lang && <div className="code-lang">{lang}</div>}
            <code>{code}</code>
          </pre>
        );
      }
      // Handle inline code
      const inlineParts = part.split(/(`[^`]+`)/g);
      return (
        <span key={i}>
          {inlineParts.map((ip, j) => {
            if (ip.startsWith("`") && ip.endsWith("`")) {
              return <code key={j} className="bubble-inline-code">{ip.slice(1, -1)}</code>;
            }
            // Handle **bold**
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
  };

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="bubble-avatar">
        {message.role === "user" ? "👤" : message.role === "assistant" ? "🤖" : "🔧"}
      </div>
      <div className="bubble-body">
        <div className="bubble-content">
          {renderContent(message.content)}
          {message.isStreaming && message.content && <span className="streaming-cursor">▍</span>}
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallDisplay toolCalls={message.toolCalls} compact={compactTools} />
        )}
      </div>
      <style jsx>{`
        .message-bubble {
          max-width: 90%;
          animation: fadeIn 0.2s ease-out;
          display: flex;
          gap: 10px;
          align-items: flex-start;
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
          flex-direction: row-reverse;
        }

        .message-bubble.assistant {
          align-self: flex-start;
        }

        .message-bubble.tool {
          align-self: center;
          width: 100%;
          max-width: 100%;
        }

        .bubble-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--bg);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .message-bubble.tool .bubble-avatar {
          display: none;
        }

        .bubble-body {
          flex: 1;
          min-width: 0;
        }

        .bubble-content {
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
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

        .streaming-cursor {
          display: inline-block;
          animation: blink-cursor 0.8s step-end infinite;
          color: var(--accent);
          font-weight: bold;
          margin-left: 1px;
        }

        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        .streaming-dots {
          color: var(--text-sec);
          animation: pulse-dots 1.5s ease-in-out infinite;
          letter-spacing: 2px;
        }

        @keyframes pulse-dots {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        .bubble-code-block {
          margin: 8px 0;
          padding: 12px;
          background: rgba(0, 0, 0, 0.06);
          border-radius: 8px;
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.5;
          overflow-x: auto;
          white-space: pre;
        }

        .code-lang {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-sec);
          margin-bottom: 6px;
          font-weight: 600;
        }

        .bubble-inline-code {
          padding: 1px 5px;
          background: rgba(0, 0, 0, 0.06);
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 0.9em;
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="cli-input-line">
      <span className="cli-input-prompt">$</span>
      <input
        className="cli-input-field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Running..." : "Type a command and press Enter"}
        disabled={disabled}
        aria-label="CLI command input"
      />
      <span className={`cli-cursor ${disabled ? "dim" : ""}`}></span>
      <style jsx>{`
        .cli-input-line {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px dashed rgba(126, 231, 135, 0.15);
        }

        .cli-input-prompt {
          color: #7ee787;
          font-weight: 700;
        }

        .cli-input-field {
          flex: 1;
          background: transparent;
          border: none;
          color: #e6edf3;
          font-family: var(--font-mono);
          font-size: 13px;
          outline: none;
        }

        .cli-input-field::placeholder {
          color: #6b7280;
        }

        .cli-cursor {
          width: 8px;
          height: 16px;
          background: #7ee787;
          animation: blink 1s step-end infinite;
        }

        .cli-cursor.dim {
          opacity: 0.4;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
