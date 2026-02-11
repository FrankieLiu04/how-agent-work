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
  const [openedPath, setOpenedPath] = useState<string | null>(null);
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

  const expectedConversationMode =
    mode === "chat" ? "CHAT" : mode === "agent" ? "AGENT" : mode === "ide" ? "IDE" : "CLI";
  const effectiveCurrentConversation =
    currentConversation?.mode === expectedConversationMode ? currentConversation : null;

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
          const rawPath = String(args.path ?? "");
          if (!rawPath.trim()) return { error: "Missing path" };
          const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
          const content = await readFile(path);
          if (content == null) return { error: "File not found" };
          if (content.length > 2000) {
            return {
              content: content.slice(0, 2000),
              truncated: true,
              totalChars: content.length,
            };
          }
          return { content };
        }
        case "write_file": {
          const rawPath = String(args.path ?? "");
          if (!rawPath.trim()) return { error: "Missing path" };
          const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
          const content = String(args.content ?? "");
          const maxBytes = limits?.maxFileSize ?? null;
          const actualBytes = new TextEncoder().encode(content).length;
          if (maxBytes != null && actualBytes > maxBytes) {
            return {
              success: false,
              error: "file_too_large",
              maxBytes,
              actualBytes,
              message: `文件内容超过单文件大小限制（${Math.floor(maxBytes / 1024)}KB）`,
              hint: "请只写必要代码（去掉题目与长解释/注释），或拆分为多个更小的文件。",
            };
          }

          const result = await writeFile(path, content);
          if (!result.ok) {
            return {
              success: false,
              error: result.code ?? "write_failed",
              httpStatus: result.httpStatus ?? null,
              message: result.error,
              hint: result.httpStatus === 401 ? "请先完成登录/鉴权后再写入文件。" : undefined,
            };
          }

          const refreshed = await readFile(path);
          if (mode === "ide") {
            setSelectedPath(path);
            setOpenedPath(path);
            setSelectedContent(refreshed ?? content);
          }
          return {
            success: true,
            path,
            bytes: result.file.size,
            refreshed: result.refreshed,
            warning: result.warning,
          };
        }
        case "list_files": {
          const rawPath = String(args.path ?? "/");
          const path = rawPath.trim() ? (rawPath.startsWith("/") ? rawPath : `/${rawPath}`) : "/";
          const dirFiles = files.filter((f) => {
            const parent = f.path.substring(0, f.path.lastIndexOf("/")) || "/";
            return parent === path;
          });
          const sorted = [...dirFiles].sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.path.localeCompare(b.path);
          });
          const limited = sorted.slice(0, 50);
          return {
            files: limited.map((f) => ({ path: f.path, isDir: f.isDir, size: f.size })),
            total: sorted.length,
            truncated: sorted.length > limited.length,
          };
        }
        case "delete_file": {
          const path = args.path as string;
          const ok = window.confirm(`Delete ${path}?`);
          if (!ok) return { cancelled: true };
          const success = await deleteFile(path);
          return success ? { success: true } : { error: "Delete failed" };
        }
        case "run_command": {
          const command = args.command as string;
          const ok = window.confirm(`Run command?\n\n${command}`);
          if (!ok) return { cancelled: true };
          const result = await execCommand(command);
          return result;
        }
        case "search_files": {
          const pattern = args.pattern as string;
          const root = ((args.path as string) ?? "/").startsWith("/")
            ? ((args.path as string) ?? "/")
            : `/${(args.path as string) ?? ""}`;

          let regex: RegExp;
          try {
            regex = new RegExp(pattern, "g");
          } catch {
            return { error: `Invalid regex: ${pattern}` };
          }

          const targetFiles = files.filter((f) => !f.isDir && (root === "/" || f.path.startsWith(`${root}/`) || f.path === root));
          const results: string[] = [];

          for (const f of targetFiles) {
            const content = await readFile(f.path);
            if (content == null) continue;
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i] ?? "";
              if (regex.test(line)) {
                results.push(`${f.path}:${i + 1}:${line}`);
              }
              regex.lastIndex = 0;
            }
          }

          const limited = results.slice(0, 200);
          return { matches: limited, total: results.length, truncated: results.length > limited.length };
        }
        default:
          return { error: `Unknown tool: ${toolCall.name}` };
      }
    },
    [files, limits?.maxFileSize, readFile, writeFile, deleteFile, execCommand, mode]
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
    conversationId: effectiveCurrentConversation?.id,
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
    if (!effectiveCurrentConversation?.id) return;
    setLastConversationByMode((prev) => {
      const bucket =
        effectiveCurrentConversation.mode === "CHAT"
          ? "chat"
          : effectiveCurrentConversation.mode === "AGENT"
            ? "agent"
            : effectiveCurrentConversation.mode === "IDE"
              ? "ide"
              : "cli";
      if (bucket !== mode) return prev;
      const next = { ...prev, [bucket]: effectiveCurrentConversation.id };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [effectiveCurrentConversation?.id, effectiveCurrentConversation?.mode, mode]);

  useEffect(() => {
    if (effectiveCurrentConversation || conversations.length === 0) return;
    const remembered = lastConversationByMode[mode];
    const match = remembered ? conversations.find((c) => c.id === remembered) : null;
    if (match) {
      void selectConversation(match.id);
      return;
    }
    if (conversations[0]) {
      void selectConversation(conversations[0].id);
    }
  }, [mode, conversations, effectiveCurrentConversation, lastConversationByMode, selectConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!isAuthed) {
        return;
      }

      let effectiveConversationId = effectiveCurrentConversation?.id ?? null;
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
      effectiveCurrentConversation,
      files.length,
      createConversation,
      selectConversation,
      initSandbox,
      sendMessage,
      conversationsError,
    ]
  );

  const handleSaveFile = useCallback(
    async (path: string, content: string) => {
      if (!path) return;
      const result = await writeFile(path, content);
      if (!result.ok) return;
      const refreshed = await readFile(result.file.path ?? path);
      if (path === openedPath) {
        setSelectedContent(refreshed ?? "");
      }
    },
    [readFile, writeFile, openedPath]
  );

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!path) return;
      setSelectedPath(path);
      setSelectedContent("");
      const content = await readFile(path);
      setOpenedPath(path);
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
        currentId={effectiveCurrentConversation?.id ?? null}
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
        openedPath={openedPath}
        selectedContent={selectedContent}
        onFileSelect={handleFileSelect}
        onDeleteFile={deleteFile}
        onSaveFile={handleSaveFile}
      />
    );
  }

  if (mode === "cli") {
    return (
      <CliLayout
        messages={messages}
        terminalLines={terminalLines}
        conversations={conversations}
        currentId={effectiveCurrentConversation?.id ?? null}
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
      currentId={effectiveCurrentConversation?.id ?? null}
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
