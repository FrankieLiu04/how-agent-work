"use client";

import { type RefObject } from "react";
import { ConversationList, type Conversation } from "~/components/ConversationList";
import { FileTree, type FileNode } from "~/components/FileTree";
import { QuotaIndicator, LimitIndicator } from "~/components/QuotaIndicator";
import { type ChatMessage, type ChatMode } from "~/hooks/useChat";
import { ChatPane } from "~/components/live-chat/ChatPane";

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
  files: FileNode[];
  limits: SandboxLimits | null;
  selectedPath: string | null;
  selectedContent: string;
  onFileSelect: (path: string) => void;
  onDeleteFile: (path: string) => void;
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
  selectedContent,
  onFileSelect,
  onDeleteFile,
}: IdeLayoutProps) {
  return (
    <div className="live-chat live-chat--ide">
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

      <div className="live-chat__files">
        <div className="live-chat__files-header">Files</div>
        <FileTree
          files={files}
          selectedPath={selectedPath}
          onSelect={onFileSelect}
          onDelete={onDeleteFile}
          disabled={isLoading}
        />
        {limits && (
          <div className="live-chat__panel-limits">
            <LimitIndicator current={limits.currentFileCount} max={limits.maxFiles} label="Files" />
            <LimitIndicator
              current={limits.currentTotalSize}
              max={limits.maxTotalSize}
              label="Storage"
              unit="KB"
            />
          </div>
        )}
      </div>

      <div className="live-chat__ide-right">
        <div className="live-chat__editor">
          <div className="live-chat__editor-tabs">
            <div className="live-chat__editor-tab live-chat__editor-tab--active">
              {selectedPath ? selectedPath.split("/").pop() : "Untitled"}
            </div>
          </div>
          <pre className="live-chat__editor-content">
            {selectedPath ? (selectedContent || "(empty)") : "Select a file to view its contents."}
          </pre>
        </div>
        <div className="live-chat__ide-chat">
          <div className="live-chat__ide-chat-header">Extension Chat</div>
          <ChatPane
            mode={mode}
            messages={messages}
            isInputDisabled={isInputDisabled}
            onSend={onSend}
            error={error}
            traceId={traceId}
            onDismissError={onDismissError}
            quotaUsed={quotaUsed}
            quotaLimit={quotaLimit}
            messagesEndRef={messagesEndRef}
            compactTools
            className="live-chat__ide-chat-body"
            emptyVariant="copilot"
          />
        </div>
      </div>
    </div>
  );
}
