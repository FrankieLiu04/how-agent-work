"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat, type ChatMode, type ChatMessage } from "~/hooks/useChat";
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
}

export function LiveChat({
  mode,
  isAuthed,
}: LiveChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Quota management
  const {
    quota,
    refresh: refreshQuota,
  } = useQuota({ autoLoad: isAuthed });

  // Conversation management (for chat/agent modes)
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

  // Sandbox (for ide/cli modes)
  const {
    files,
    limits,
    cwd,
    terminalLines,
    isLoading: sandboxLoading,
    loadFiles,
    writeFile,
    deleteFile,
    execCommand,
    initSandbox,
    addTerminalLine,
  } = useSandbox({
    autoInit: isAuthed && (mode === "ide" || mode === "cli"),
  });

  // Tool call handler
  const handleToolCall = useCallback(async (toolCall: ToolCall): Promise<unknown> => {
    const args = toolCall.arguments;

    switch (toolCall.name) {
      case "tavily_search": {
        // Search is handled server-side, just return a placeholder
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
        // Simplified search
        const pattern = args.pattern as string;
        const matches = files.filter((f) => f.path.includes(pattern));
        return { matches: matches.map((f) => f.path) };
      }
      default:
        return { error: `Unknown tool: ${toolCall.name}` };
    }
  }, [files, writeFile, deleteFile, execCommand]);

  // Chat hook
  const {
    messages,
    isLoading: chatLoading,
    error: chatError,
    sendMessage,
    stopGeneration,
    clearMessages,
    traceId,
  } = useChat({
    mode,
    conversationId: currentConversation?.id,
    onToolCall: handleToolCall,
    onSuccess: refreshQuota,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle sending message
  const handleSend = useCallback(async (content: string) => {
    if (!isAuthed) {
      return;
    }

    // For chat/agent modes, ensure we have a conversation
    if ((mode === "chat" || mode === "agent") && !currentConversation) {
      await createConversation();
    }

    // For ide/cli modes, ensure sandbox is initialized
    if ((mode === "ide" || mode === "cli") && files.length === 0) {
      await initSandbox();
    }

    await sendMessage(content);
  }, [isAuthed, mode, currentConversation, files.length, createConversation, initSandbox, sendMessage]);

  // Handle file selection (for IDE mode)
  const handleFileSelect = useCallback((path: string) => {
    addTerminalLine("system", `Selected: ${path}`);
  }, [addTerminalLine]);

  // Not authenticated
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

  return (
    <div className="live-chat">
      {/* Sidebar for Chat/Agent modes */}
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

      {/* Main chat area */}
      <div className="live-chat-main">
        {/* Messages */}
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="messages-empty">
              <div className="empty-icon">
                {mode === "chat" && "💬"}
                {mode === "agent" && "🤖"}
                {mode === "ide" && "💻"}
                {mode === "cli" && "⚡"}
              </div>
              <div className="empty-title">
                {mode === "chat" && "Start a conversation"}
                {mode === "agent" && "Ask me anything (I can search the web)"}
                {mode === "ide" && "Describe what you want to build"}
                {mode === "cli" && "Describe a task in natural language"}
              </div>
              <div className="empty-hint">
                {mode === "chat" && "Type a message below to begin chatting."}
                {mode === "agent" && "I'll use tools to help answer your questions."}
                {mode === "ide" && "I'll help you write and organize code files."}
                {mode === "cli" && "I'll execute commands to complete your task."}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {chatError && (
          <div className="chat-error">
            <span>⚠️ {chatError}</span>
            <button onClick={() => clearMessages()}>Dismiss</button>
          </div>
        )}

        {/* Trace ID display */}
        {traceId && (
          <div className="trace-id">
            Trace: <a href={`/api/debug/traces?id=${traceId}`} target="_blank" rel="noreferrer">{traceId.slice(0, 8)}...</a>
          </div>
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          disabled={isLoading || quota.used >= quota.limit}
          mode={mode}
        />
      </div>

      {/* Right panel for IDE/CLI modes */}
      {(mode === "ide" || mode === "cli") && (
        <div className="live-chat-panel">
          {mode === "ide" ? (
            <>
              <FileTree
                files={files}
                selectedPath={null}
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
            </>
          ) : (
            <TerminalView
              lines={terminalLines}
              cwd={cwd}
              isRunning={isLoading}
            />
          )}
          <div className="panel-footer">
            <QuotaIndicator
              used={quota.used}
              max={quota.limit}
              resetTime={quota.resetAt}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        .live-chat {
          display: flex;
          height: 100%;
          flex: 1;
          min-height: 0;
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

        .live-chat-panel {
          width: 280px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
        }

        .panel-limits {
          background: var(--bg);
          border-radius: 8px;
          border: 1px solid var(--border);
          padding: 4px 0;
        }

        .panel-footer {
          margin-top: auto;
        }
      `}</style>
    </div>
  );
}

// Message bubble component
function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="bubble-content">
        {message.content || (message.isStreaming ? "..." : "")}
      </div>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <ToolCallDisplay toolCalls={message.toolCalls} />
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
