"use client";

import { FileTree } from "~/components/FileTree";
import { LimitIndicator } from "~/components/QuotaIndicator";
import { type SandboxFile } from "~/hooks/useSandbox";

type SandboxLimits = {
  currentFileCount: number;
  maxFiles: number;
  currentTotalSize: number;
  maxTotalSize: number;
};

export function IdeFilePane({
  files,
  limits,
  selectedPath,
  onSelect,
  onDelete,
  disabled,
}: {
  files: SandboxFile[];
  limits: SandboxLimits | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="live-chat__files">
      <div className="live-chat__files-header">Files</div>
      <FileTree
        files={files}
        selectedPath={selectedPath}
        onSelect={onSelect}
        onDelete={onDelete}
        disabled={disabled}
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
  );
}
