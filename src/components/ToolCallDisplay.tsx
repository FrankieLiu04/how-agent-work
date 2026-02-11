"use client";

import { useState } from "react";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  status: "pending" | "running" | "completed" | "error";
}

interface ToolCallDisplayProps {
  toolCalls: ToolCall[];
  compact?: boolean;
}

// Tool icons and colors
const TOOL_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  tavily_search: { icon: "🔍", color: "#007aff", label: "Web Search" },
  read_file: { icon: "📖", color: "#34c759", label: "Read File" },
  write_file: { icon: "✏️", color: "#ff9f0a", label: "Write File" },
  list_files: { icon: "📁", color: "#5856d6", label: "List Files" },
  delete_file: { icon: "🗑️", color: "#ff3b30", label: "Delete File" },
  run_command: { icon: "⚡", color: "#af52de", label: "Run Command" },
  search_files: { icon: "🔎", color: "#00c7be", label: "Search Files" },
};

function ToolCallItem({ call, compact }: { call: ToolCall; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = TOOL_CONFIG[call.name] ?? { icon: "🔧", color: "#8e8e93", label: call.name };

  const hasWarning =
    !!call.result &&
    call.result.success === true &&
    !!call.result.data &&
    typeof call.result.data === "object" &&
    !Array.isArray(call.result.data) &&
    typeof (call.result.data as Record<string, unknown>).warning === "string";

  const isError = call.status === "error" || call.result?.success === false || !!call.result?.error;

  const getStatusIcon = () => {
    if (isError) return "❌";
    if (hasWarning) return "⚠️";
    switch (call.status) {
      case "pending":
        return "⏳";
      case "running":
        return "⚙️";
      case "completed":
        return "✅";
      case "error":
        return "❌";
    }
  };

  const formatArguments = () => {
    const entries = Object.entries(call.arguments);
    if (entries.length === 0) return null;
    
    // For compact view, show only key params
    if (compact) {
      const key = entries[0];
      if (!key) return null;
      const value = typeof key[1] === "string" 
        ? key[1].length > 30 ? key[1].slice(0, 30) + "..." : key[1]
        : JSON.stringify(key[1]).slice(0, 30);
      return `${key[0]}: ${value}`;
    }

    return entries.map(([k, v]) => (
      <div key={k} className="arg-item">
        <span className="arg-key">{k}:</span>
        <span className="arg-value">
          {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
        </span>
      </div>
    ));
  };

  const formatResult = () => {
    if (!call.result) return null;
    
    if (call.result.error) {
      return <span className="result-error">{call.result.error}</span>;
    }

    const data = call.result.data;
    if (typeof data === "string") {
      return data.length > 200 ? data.slice(0, 200) + "..." : data;
    }
    return JSON.stringify(data, null, 2);
  };

  if (compact) {
    return (
      <div className="tool-call-compact">
        <span className="tool-icon">{config.icon}</span>
        <span className="tool-label">{config.label}</span>
        <span className="tool-status">{getStatusIcon()}</span>
        <style jsx>{`
          .tool-call-compact {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: rgba(0, 0, 0, 0.03);
            border-radius: 12px;
            font-size: 12px;
          }

          .tool-icon {
            font-size: 12px;
          }

          .tool-label {
            color: var(--text-sec);
          }

          .tool-status {
            font-size: 10px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`tool-call ${isError ? "error" : call.status}`}>
      <div className="tool-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{config.icon}</span>
        <span className="tool-label" style={{ color: config.color }}>{config.label}</span>
        <span className="tool-status">{getStatusIcon()}</span>
        <span className="tool-expand">{expanded ? "▼" : "▶"}</span>
      </div>
      
      {expanded && (
        <div className="tool-details">
          <div className="tool-section">
            <div className="section-title">Arguments</div>
            <div className="section-content args">
              {formatArguments() ?? <span className="no-data">(none)</span>}
            </div>
          </div>
          
          {call.result && (
            <div className="tool-section">
              <div className="section-title">Result</div>
              <pre className={`section-content result ${call.result.error ? "error" : ""}`}>
                {formatResult()}
              </pre>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .tool-call {
          background: var(--bg);
          border-radius: 10px;
          border: 1px solid var(--border);
          overflow: hidden;
          margin: 8px 0;
        }

        .tool-call.running {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent);
        }

        .tool-call.error {
          border-color: var(--error, #ff3b30);
        }

        .tool-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .tool-header:hover {
          background: rgba(0, 0, 0, 0.02);
        }

        .tool-icon {
          font-size: 16px;
        }

        .tool-label {
          flex: 1;
          font-weight: 600;
          font-size: 13px;
        }

        .tool-status {
          font-size: 14px;
        }

        .tool-expand {
          font-size: 10px;
          color: var(--text-sec);
        }

        .tool-details {
          border-top: 1px solid var(--border);
          padding: 12px;
        }

        .tool-section {
          margin-bottom: 12px;
        }

        .tool-section:last-child {
          margin-bottom: 0;
        }

        .section-title {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-sec);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .section-content {
          font-size: 12px;
          font-family: var(--font-mono);
        }

        .section-content.args {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .section-content.result {
          background: rgba(0, 0, 0, 0.03);
          padding: 8px;
          border-radius: 6px;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 200px;
          overflow-y: auto;
        }

        .section-content.result.error {
          background: rgba(255, 59, 48, 0.1);
          color: var(--error, #ff3b30);
        }

        .no-data {
          color: var(--text-sec);
          font-style: italic;
        }

        .result-error {
          color: var(--error, #ff3b30);
        }
      `}</style>
      <style jsx global>{`
        .arg-item {
          display: flex;
          gap: 8px;
        }

        .arg-key {
          color: var(--text-sec);
          flex-shrink: 0;
        }

        .arg-value {
          color: var(--text);
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}

export function ToolCallDisplay({ toolCalls, compact = false }: ToolCallDisplayProps) {
  if (toolCalls.length === 0) return null;

  if (compact) {
    return (
      <div className="tool-calls-compact">
        {toolCalls.map((call) => (
          <ToolCallItem key={call.id} call={call} compact />
        ))}
        <style jsx>{`
          .tool-calls-compact {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="tool-calls">
      <div className="tool-calls-header">
        <span>Tool Calls ({toolCalls.length})</span>
      </div>
      {toolCalls.map((call) => (
        <ToolCallItem key={call.id} call={call} />
      ))}
      <style jsx>{`
        .tool-calls {
          padding: 8px 0;
        }

        .tool-calls-header {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-sec);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}
