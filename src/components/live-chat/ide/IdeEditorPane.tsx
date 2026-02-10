"use client";

import { useEffect, useMemo, useState } from "react";

export function IdeEditorPane({
  selectedPath,
  selectedContent,
  disabled,
  onSaveFile,
}: {
  selectedPath: string | null;
  selectedContent: string;
  disabled: boolean;
  onSaveFile: (path: string, content: string) => void | Promise<void>;
}) {
  const [draftContent, setDraftContent] = useState(selectedContent);

  useEffect(() => {
    setDraftContent(selectedContent);
  }, [selectedPath, selectedContent]);

  const isDirty = useMemo(() => {
    if (!selectedPath) return false;
    return draftContent !== selectedContent;
  }, [draftContent, selectedContent, selectedPath]);

  return (
    <div className="live-chat__editor">
      <div className="live-chat__editor-tabs">
        <div className="live-chat__editor-tab live-chat__editor-tab--active">
          {selectedPath ? selectedPath.split("/").pop() : "Untitled"}
        </div>
        <div className="live-chat__editor-actions">
          <button
            className="live-chat__button"
            disabled={disabled || !selectedPath || !isDirty}
            onClick={() => {
              if (!selectedPath) return;
              void onSaveFile(selectedPath, draftContent);
            }}
          >
            Save
          </button>
          <button
            className="live-chat__button live-chat__button--secondary"
            disabled={disabled || !selectedPath || !isDirty}
            onClick={() => setDraftContent(selectedContent)}
          >
            Revert
          </button>
        </div>
      </div>
      {selectedPath ? (
        <textarea
          className="live-chat__editor-content"
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <pre className="live-chat__editor-content">Select a file to view its contents.</pre>
      )}
    </div>
  );
}
