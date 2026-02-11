"use client";

import { type RefObject } from "react";
import { type Conversation } from "~/components/ConversationList";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";
import { type SandboxFile } from "~/hooks/useSandbox";
import { IdeFilePane } from "~/components/live-chat/ide/IdeFilePane";
import { IdeEditorPane } from "~/components/live-chat/ide/IdeEditorPane";
import { IdeCopilotPane } from "~/components/live-chat/ide/IdeCopilotPane";

interface SandboxLimits {
  currentFileCount: number;
  maxFiles: number;
  currentTotalSize: number;
  maxTotalSize: number;
}

interface IdeLayoutProps {
  mode: ChatMode;
  messages: ChatMessage[];
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
  onDismissError: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  files: SandboxFile[];
  limits: SandboxLimits | null;
  selectedPath: string | null;
  openedPath: string | null;
  selectedContent: string;
  onFileSelect: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onSaveFile: (path: string, content: string) => void | Promise<void>;
}

export function IdeLayout({
  mode,
  messages,
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
  onDismissError,
  messagesEndRef,
  files,
  limits,
  selectedPath,
  openedPath,
  selectedContent,
  onFileSelect,
  onDeleteFile,
  onSaveFile,
}: IdeLayoutProps) {
  return (
    <div className="live-chat live-chat--ide">
      <IdeFilePane
        files={files}
        limits={limits}
        selectedPath={selectedPath}
        onSelect={onFileSelect}
        onDelete={onDeleteFile}
        disabled={isLoading}
      />

      <IdeEditorPane
        selectedPath={openedPath}
        selectedContent={selectedContent}
        disabled={isLoading}
        onSaveFile={onSaveFile}
      />

      <IdeCopilotPane
        mode={mode}
        messages={messages}
        conversations={conversations}
        currentId={currentId}
        onSelect={onSelect}
        onDelete={onDelete}
        onNew={onNew}
        isLoading={isLoading}
        quotaUsed={quotaUsed}
        quotaLimit={quotaLimit}
        quotaResetAt={quotaResetAt}
        onSend={onSend}
        isInputDisabled={isInputDisabled}
        error={error}
        traceId={traceId}
        onDismissError={onDismissError}
        messagesEndRef={messagesEndRef}
      />
    </div>
  );
}
