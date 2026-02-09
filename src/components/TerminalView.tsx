"use client";

import { useRef, useEffect } from "react";

export interface TerminalLine {
  id: string;
  type: "command" | "output" | "error" | "system";
  content: string;
  timestamp?: Date;
}

interface TerminalViewProps {
  lines: TerminalLine[];
  cwd?: string;
  isRunning?: boolean;
}

export function TerminalView({
  lines,
  cwd = "/",
  isRunning = false,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  const formatTimestamp = (date?: Date) => {
    if (!date) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="terminal-view">
      <div className="terminal-header">
        <div className="terminal-dots">
          <span className="dot red"></span>
          <span className="dot yellow"></span>
          <span className="dot green"></span>
        </div>
        <div className="terminal-title">
          <span className="terminal-icon">⚡</span>
          Terminal
          {isRunning && <span className="running-indicator">Running...</span>}
        </div>
        <div className="terminal-cwd" title={cwd}>
          {cwd}
        </div>
      </div>
      <div className="terminal-content" ref={containerRef}>
        {lines.length === 0 ? (
          <div className="terminal-welcome">
            <div className="welcome-text">Welcome to the virtual terminal!</div>
            <div className="welcome-hint">
              Describe what you want to do in natural language, and the AI agent will execute shell commands for you.
            </div>
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`terminal-line ${line.type}`}>
              {line.type === "command" && (
                <>
                  <span className="prompt">$</span>
                  <span className="command-text">{line.content}</span>
                  {line.timestamp && (
                    <span className="timestamp">{formatTimestamp(line.timestamp)}</span>
                  )}
                </>
              )}
              {line.type === "output" && (
                <pre className="output-text">{line.content}</pre>
              )}
              {line.type === "error" && (
                <pre className="error-text">{line.content}</pre>
              )}
              {line.type === "system" && (
                <span className="system-text">{line.content}</span>
              )}
            </div>
          ))
        )}
        {isRunning && (
          <div className="terminal-line running">
            <span className="prompt">$</span>
            <span className="cursor"></span>
          </div>
        )}
      </div>
      <style jsx>{`
        .terminal-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e1e;
          border-radius: var(--radius);
          border: 1px solid #333;
          overflow: hidden;
          font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", monospace;
        }

        .terminal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: #2d2d2d;
          border-bottom: 1px solid #333;
        }

        .terminal-dots {
          display: flex;
          gap: 6px;
        }

        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .dot.red {
          background: #ff5f56;
        }

        .dot.yellow {
          background: #ffbd2e;
        }

        .dot.green {
          background: #27c93f;
        }

        .terminal-title {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #888;
          font-size: 12px;
          font-weight: 500;
        }

        .terminal-icon {
          font-size: 12px;
        }

        .running-indicator {
          margin-left: 8px;
          color: #27c93f;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .terminal-cwd {
          font-size: 11px;
          color: #666;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .terminal-content {
          flex: 1;
          padding: 12px;
          overflow-y: auto;
          font-size: 13px;
          line-height: 1.5;
        }

        .terminal-welcome {
          color: #888;
          text-align: center;
          padding: 24px;
        }

        .welcome-text {
          font-size: 14px;
          margin-bottom: 8px;
          color: #27c93f;
        }

        .welcome-hint {
          font-size: 12px;
          color: #666;
        }

        .terminal-line {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 4px;
        }

        .terminal-line.command {
          color: #f1f1f1;
        }

        .prompt {
          color: #27c93f;
          font-weight: bold;
          user-select: none;
        }

        .command-text {
          flex: 1;
          color: #f1f1f1;
        }

        .timestamp {
          color: #555;
          font-size: 10px;
          margin-left: auto;
        }

        .output-text {
          color: #ccc;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .error-text {
          color: #ff5f56;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .system-text {
          color: #ffbd2e;
          font-style: italic;
        }

        .terminal-line.running {
          color: #888;
        }

        .cursor {
          display: inline-block;
          width: 8px;
          height: 16px;
          background: #f1f1f1;
          animation: blink 1s step-end infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* Scrollbar styling */
        .terminal-content::-webkit-scrollbar {
          width: 8px;
        }

        .terminal-content::-webkit-scrollbar-track {
          background: #1e1e1e;
        }

        .terminal-content::-webkit-scrollbar-thumb {
          background: #444;
          border-radius: 4px;
        }

        .terminal-content::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </div>
  );
}
