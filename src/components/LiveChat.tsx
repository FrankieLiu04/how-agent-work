"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat, type ChatMode, type ProtocolEvent } from "~/hooks/useChat";
import { useConversations } from "~/hooks/useConversations";
import { useSandbox } from "~/hooks/useSandbox";
import { useQuota } from "~/hooks/useQuota";
import { type ToolCall } from "~/components/ToolCallDisplay";
import { ChatLayout } from "~/components/live-chat/ChatLayout";
import { IdeLayout } from "~/components/live-chat/IdeLayout";
import { CliLayout } from "~/components/live-chat/CliLayout";

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
  const STORAGE_KEY = "livechat:lastConversationByMode";
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
  const [conversationError, setConversationError] = useState<string | null>(null);

  const { quota, refresh: refreshQuota } = useQuota({ autoLoad: isAuthed });

  const {
    conversations,
    currentConversation,
    isLoading: convLoading,
    createConversation,
    selectConversation,
    deleteConversation,
    error: conversationsError,
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

  const handleToolCall = useCallback(
    async (toolCall: ToolCall): Promise<unknown> => {
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
    },
    [files, writeFile, deleteFile, execCommand]
  );

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
    onToolCall: mode === "agent" ? undefined : handleToolCall,
    onSuccess: refreshQuota,
    onProtocolEvent,
  });

  useEffect(() => {
    if (!isAuthed || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<Record<ChatMode, string | null>>;
      setLastConversationByMode((prev) => ({ ...prev, ...parsed }));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [isAuthed]);

  useEffect(() => {
    if (!conversationsError) return;
    setConversationError(conversationsError);
  }, [conversationsError]);

  useEffect(() => {
    if (!currentConversation?.id) return;
    setLastConversationByMode((prev) => {
      const next = { ...prev, [mode]: currentConversation.id };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [currentConversation?.id, mode]);

  useEffect(() => {
    if (currentConversation || conversations.length === 0) return;
    const remembered = lastConversationByMode[mode];
    const match = remembered ? conversations.find((c) => c.id === remembered) : null;
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

  const handleSend = useCallback(
    async (content: string) => {
      if (!isAuthed) {
        return;
      }

      let effectiveConversationId = currentConversation?.id ?? null;
      if (!effectiveConversationId) {
        const created = await createConversation();
        effectiveConversationId = created?.id ?? null;
        if (created?.id) {
          await selectConversation(created.id);
          setConversationError(null);
        } else {
          setConversationError(
            conversationsError ?? "Failed to create conversation. Please try again."
          );
          return;
        }
      }

      if ((mode === "ide" || mode === "cli") && files.length === 0) {
        await initSandbox();
      }

      await sendMessage(content, { conversationId: effectiveConversationId });
    },
    [
      isAuthed,
      mode,
      currentConversation,
      files.length,
      createConversation,
      selectConversation,
      initSandbox,
      sendMessage,
      conversationsError,
    ]
  );

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!path) return;
      setSelectedPath(path);
      const content = await readFile(path);
      setSelectedContent(content ?? "");
    },
    [readFile]
  );

  useEffect(() => {
    if (mode !== "ide") return;
    if (selectedPath || files.length === 0) return;
    void handleFileSelect(files[0]?.path ?? "");
  }, [mode, selectedPath, files, handleFileSelect]);

  if (!isAuthed) {
    return (
      <div className="live-chat__auth">
        <div className="live-chat__auth-message">
          <span className="live-chat__auth-icon">🔐</span>
          <span>Please sign in to use the real LLM interaction feature.</span>
          <a href="/api/auth/signin" className="live-chat__auth-link">Sign in with GitHub</a>
        </div>
      </div>
    );
  }

  const isInputDisabled = chatLoading;
  const isLoading = chatLoading || convLoading || sandboxLoading;
  const onDismissError = () => {
    clearMessages();
    setConversationError(null);
  };
  const displayError = conversationError ?? chatError;

  if (mode === "ide") {
    return (
      <IdeLayout
        mode={mode}
        messages={messages}
        conversations={conversations}
        currentId={currentConversation?.id ?? null}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onNew={createConversation}
        isLoading={isLoading}
        quotaUsed={quota.used}
        quotaLimit={quota.limit}
        quotaResetAt={quota.resetAt}
        onSend={handleSend}
        isInputDisabled={isInputDisabled}
        error={displayError}
        traceId={traceId}
        onDismissError={onDismissError}
        messagesEndRef={messagesEndRef}
        files={files}
        limits={limits}
        selectedPath={selectedPath}
        selectedContent={selectedContent}
        onFileSelect={handleFileSelect}
        onDeleteFile={deleteFile}
      />
    );
  }

  if (mode === "cli") {
    return (
      <CliLayout
        messages={messages}
        terminalLines={terminalLines}
        conversations={conversations}
        currentId={currentConversation?.id ?? null}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onNew={createConversation}
        isLoading={isLoading}
        quotaUsed={quota.used}
        quotaLimit={quota.limit}
        quotaResetAt={quota.resetAt}
        onSend={handleSend}
        isInputDisabled={isInputDisabled}
        error={displayError}
        traceId={traceId}
        messagesEndRef={messagesEndRef}
      />
    );
  }

  return (
    <ChatLayout
      mode={mode}
      messages={messages}
      conversations={conversations}
      currentId={currentConversation?.id ?? null}
      onSelect={selectConversation}
      onDelete={deleteConversation}
      onNew={createConversation}
      isLoading={isLoading}
      quotaUsed={quota.used}
      quotaLimit={quota.limit}
      quotaResetAt={quota.resetAt}
      onSend={handleSend}
      isInputDisabled={isInputDisabled}
      error={displayError}
      traceId={traceId}
      onDismissError={onDismissError}
      messagesEndRef={messagesEndRef}
    />
  );
}
