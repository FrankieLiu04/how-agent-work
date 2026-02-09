"use client";

import { useState, useMemo } from "react";

export interface FileNode {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  children?: FileNode[];
}

interface FileTreeProps {
  files: Array<{ path: string; isDir: boolean; size: number }>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  disabled?: boolean;
}

// Convert flat file list to tree structure
function buildFileTree(files: Array<{ path: string; isDir: boolean; size: number }>): FileNode[] {
  const root: FileNode[] = [];
  const nodeMap = new Map<string, FileNode>();

  // Sort files to ensure directories come before their children
  const sortedFiles = [...files].sort((a, b) => {
    const aDepth = a.path.split("/").length;
    const bDepth = b.path.split("/").length;
    return aDepth - bDepth || a.path.localeCompare(b.path);
  });

  for (const file of sortedFiles) {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? "";
    
    const node: FileNode = {
      path: file.path,
      name,
      isDir: file.isDir,
      size: file.size,
      children: file.isDir ? [] : undefined,
    };

    nodeMap.set(file.path, node);

    // Find parent
    const parentPath = "/" + parts.slice(0, -1).join("/");
    const parent = nodeMap.get(parentPath);

    if (parent && parent.children) {
      parent.children.push(node);
    } else if (parts.length === 1) {
      root.push(node);
    }
  }

  // Sort children: directories first, then alphabetically
  const sortChildren = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortChildren(node.children);
    }
  };
  sortChildren(root);

  return root;
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  expandedPaths,
  onToggle,
  onSelect,
  onDelete,
  disabled,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  disabled?: boolean;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (disabled) return;
    if (node.isDir) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && !disabled) {
      onDelete(node.path);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  };

  // Get file icon based on extension
  const getFileIcon = () => {
    if (node.isDir) {
      return isExpanded ? "📂" : "📁";
    }
    const ext = node.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "js":
      case "jsx":
        return "📜";
      case "ts":
      case "tsx":
        return "📘";
      case "json":
        return "📋";
      case "md":
        return "📝";
      case "css":
      case "scss":
        return "🎨";
      case "html":
        return "🌐";
      case "py":
        return "🐍";
      default:
        return "📄";
    }
  };

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="node-icon">{getFileIcon()}</span>
        <span className="node-name">{node.name}</span>
        {!node.isDir && <span className="node-size">{formatSize(node.size)}</span>}
        {onDelete && (
          <button className="node-delete" onClick={handleDelete} title="Delete">
            ×
          </button>
        )}
      </div>
      {node.isDir && isExpanded && node.children && (
        <div className="tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              disabled={disabled}
            />
          ))}
          {node.children.length === 0 && (
            <div className="empty-dir" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  files,
  selectedPath,
  onSelect,
  onDelete,
  disabled = false,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["/"]));

  const tree = useMemo(() => buildFileTree(files), [files]);

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Calculate totals
  const totalFiles = files.filter((f) => !f.isDir).length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="file-tree">
      <div className="tree-header">
        <span className="tree-title">Files</span>
        <span className="tree-stats">
          {totalFiles} files, {(totalSize / 1024).toFixed(1)}KB
        </span>
      </div>
      <div className="tree-content">
        {tree.length === 0 ? (
          <div className="tree-empty">
            No files yet. Start by describing what you want to build!
          </div>
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggle={toggleExpand}
              onSelect={onSelect}
              onDelete={onDelete}
              disabled={disabled}
            />
          ))
        )}
      </div>
      <style jsx>{`
        .file-tree {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--card-bg);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          overflow: hidden;
        }

        .tree-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }

        .tree-title {
          font-weight: 600;
          font-size: 13px;
          color: var(--text);
        }

        .tree-stats {
          font-size: 11px;
          color: var(--text-sec);
          font-family: var(--font-mono);
        }

        .tree-content {
          flex: 1;
          overflow-y: auto;
          padding: 4px 0;
        }

        .tree-empty {
          padding: 24px 16px;
          text-align: center;
          color: var(--text-sec);
          font-size: 12px;
        }
      `}</style>
      <style jsx global>{`
        .tree-node-wrapper {
          user-select: none;
        }

        .tree-node {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          cursor: pointer;
          transition: background 0.1s;
        }

        .tree-node:hover:not(.disabled) {
          background: var(--bg);
        }

        .tree-node.selected {
          background: rgba(0, 122, 255, 0.1);
        }

        .tree-node.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .node-icon {
          font-size: 14px;
          flex-shrink: 0;
        }

        .node-name {
          flex: 1;
          font-size: 13px;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .node-size {
          font-size: 10px;
          color: var(--text-sec);
          font-family: var(--font-mono);
        }

        .node-delete {
          width: 18px;
          height: 18px;
          border: none;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-sec);
          font-size: 14px;
          opacity: 0;
          transition: opacity 0.1s;
        }

        .tree-node:hover .node-delete {
          opacity: 1;
        }

        .node-delete:hover {
          background: rgba(255, 59, 48, 0.1);
          color: var(--error, #ff3b30);
        }

        .empty-dir {
          font-size: 11px;
          color: var(--text-sec);
          font-style: italic;
          padding: 4px 8px;
        }
      `}</style>
    </div>
  );
}
