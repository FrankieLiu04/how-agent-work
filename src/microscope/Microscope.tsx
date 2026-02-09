"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { init, type EngineAPI } from "./engine";
import { LiveChat } from "~/components/LiveChat";
import type { ProtocolEvent } from "~/hooks/useChat";
import type { Mode } from "./state";

type ViewMode = "demo" | "live";

type ProtocolLogEntry = {
  id: string;
  time: string;
  type: "req" | "res" | "info";
  title: string;
  content: string;
};

type ProtocolPacket = {
  time: string;
  type: "req" | "res" | "info";
  title: string;
  content: string;
};

export function Microscope(props: { isAuthed: boolean; userName: string | null }) {
  const apiRef = useRef<EngineAPI | null>(null);
  const [currentMode, setCurrentMode] = useState<Mode>("chat");
  const [viewMode, setViewMode] = useState<ViewMode>("demo");
  const [protocolLog, setProtocolLog] = useState<ProtocolLogEntry[]>([]);
  const [protocolContext, setProtocolContext] = useState<string>("(Empty)");
  const [protocolTokens, setProtocolTokens] = useState<string[]>([]);
  const [lastPacket, setLastPacket] = useState<ProtocolPacket | null>(null);
  const [liveTraceId, setLiveTraceId] = useState<string | null>(null);

  useEffect(() => {
    apiRef.current = init();
    return () => {
      apiRef.current = null;
    };
  }, []);

  const handleModeChange = (mode: Mode) => {
    setCurrentMode(mode);
    if (viewMode === "demo") {
      apiRef.current?.setMode(mode);
    }
  };

  const handleViewModeChange = (newViewMode: ViewMode) => {
    setViewMode(newViewMode);
    if (newViewMode === "demo") {
      apiRef.current?.setMode(currentMode);
    }
    if (newViewMode === "live") {
      setProtocolLog([]);
      setProtocolTokens([]);
      setProtocolContext("(Empty)");
      setLastPacket(null);
      setLiveTraceId(null);
    }
  };

  const formatProtocolContent = (content?: unknown) => {
    if (content === undefined) return "";
    if (typeof content === "string") return content;
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  };

  const handleProtocolEvent = useCallback((event: ProtocolEvent) => {
    if (event.type === "clear") {
      setProtocolTokens([]);
      setProtocolContext("(Empty)");
      setLastPacket(null);
      return;
    }

    const time = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const content = formatProtocolContent(event.content);

    if (event.traceId) setLiveTraceId(event.traceId);
    if (event.context) setProtocolContext(event.context);
    if (event.type === "req") setProtocolTokens([]);
    if (event.token) {
      setProtocolTokens((prev) => [...prev, event.token].slice(-240));
    }

    const entry: ProtocolLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      time,
      type: event.type,
      title: event.title,
      content,
    };

    setProtocolLog((prev) => [...prev, entry].slice(-200));

    if (event.type === "req" || event.type === "res") {
      setLastPacket({ time, type: event.type, title: event.title, content });
    }
  }, []);

  return (
    <>
      <header>
        <div className="segmented-control">
          <button
            className={`seg-btn ${currentMode === "chat" ? "active" : ""}`}
            onClick={() => handleModeChange("chat")}
          >
            基础 Chat
          </button>
          <button
            className={`seg-btn ${currentMode === "agent" ? "active" : ""}`}
            onClick={() => handleModeChange("agent")}
          >
            Agent (Tool Call)
          </button>
          <button
            className={`seg-btn ${currentMode === "ide" ? "active" : ""}`}
            onClick={() => handleModeChange("ide")}
          >
            IDE Extension
          </button>
          <button
            className={`seg-btn ${currentMode === "cli" ? "active" : ""}`}
            onClick={() => handleModeChange("cli")}
          >
            CLI Coding Agent
          </button>
        </div>
        <div className="header-controls">
          {/* View mode toggle */}
          <div className="view-mode-toggle">
            <button
              className={`view-btn ${viewMode === "demo" ? "active" : ""}`}
              onClick={() => handleViewModeChange("demo")}
              title="Step-by-step demo of LLM protocols"
            >
              📖 演示
            </button>
            <button
              className={`view-btn ${viewMode === "live" ? "active" : ""}`}
              onClick={() => handleViewModeChange("live")}
              title="Real LLM interaction (requires sign-in)"
            >
              ⚡ 实时
            </button>
          </div>
          <div className="auth-panel">
            <a className="auth-btn" href="/api/metrics" target="_blank" rel="noreferrer">
              Metrics
            </a>
            <a className="auth-btn" href="/api/debug/traces" target="_blank" rel="noreferrer">
              Traces
            </a>
            <span className="auth-name" id="traceIdLabel"></span>
            {props.isAuthed ? (
              <>
                <span className="auth-name">{props.userName ?? "User"}</span>
                <a className="auth-btn" href="/api/auth/signout">
                  Sign out
                </a>
              </>
            ) : (
              <a className="auth-btn" href="/api/auth/signin">
                Sign in
              </a>
            )}
          </div>
          {viewMode === "demo" && (
            <label className="toggle-switch">
              <input type="checkbox" id="thinkingToggle" onChange={() => apiRef.current?.toggleThinking()} />
              <span className="toggle-slider"></span>
              <span className="toggle-label">Enable Thinking (CoT)</span>
            </label>
          )}
        </div>
      </header>

      {viewMode === "demo" ? (
        // Demo mode - original visualization
        <>
          <main id="mainStage">
            <div className="zone" id="zoneClient">
              <div className="zone-header">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
                Client App
              </div>
              <div className="card" id="clientCard">
                <div className="client-screen phone">
                  <div className="chat-bubbles" id="chatList">
                    <div className="bubble ai">点击"下一步"开始探索 LLM 协议流程。</div>
                  </div>
                  <div className="input-mock">
                    <div className="input-bar"></div>
                    <div className="input-btn"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="zone" id="zoneNetwork">
              <div className="zone-header">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                Network / Protocol
              </div>
              <div className="network-stage">
                <div className="connection-line">
                  <div className="arrow-head arrow-right"></div>
                  <div className="arrow-head arrow-left"></div>
                </div>
              </div>
            </div>

            <div className="zone" id="zoneServer">
              <div className="zone-header">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                  <line x1="6" y1="6" x2="6.01" y2="6"></line>
                  <line x1="6" y1="18" x2="6.01" y2="18"></line>
                </svg>
                LLM Service
              </div>
              <div className="card" id="serverCard">
                <div className="server-rack">
                  <div className="context-window">
                    <div className="context-title">Context Window (Input)</div>
                    <div id="contextContent" style={{ fontFamily: "var(--font-mono)", opacity: 0.6 }}>
                      (Empty)
                    </div>
                  </div>
                  <div className="context-window">
                    <div className="context-title">Generation (Output)</div>
                    <div className="token-stream" id="tokenStream"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="zone" id="zoneLog">
              <div className="zone-header">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Traffic Log
              </div>
              <div className="card log-card">
                <div className="log-content" id="logContent">
                  <div className="log-empty">No traffic yet.</div>
                </div>
              </div>
            </div>

            <div className="packet-overlay" id="packetStage"></div>
          </main>

          <footer>
            <div className="progress-bar">
              <div className="progress-fill" id="progressFill"></div>
            </div>
            <div className="controls">
              <button className="nav-btn btn-sec" id="prevBtn" onClick={() => apiRef.current?.prevStep()}>
                ← 上一步
              </button>
              <div className="step-info">
                <h3 className="step-title" id="stepTitle">
                  准备就绪
                </h3>
                <p className="step-desc" id="stepDesc">
                  选择模式并点击"下一步"开始
                </p>
              </div>
              <button className="nav-btn btn-primary" id="nextBtn" onClick={() => apiRef.current?.nextStep()}>
                下一步 →
              </button>
            </div>
          </footer>
        </>
      ) : (
        // Live mode - real LLM interaction
        <main id="mainStage" className="live-stage">
          <div className="zone" id="zoneClient">
            <div className="zone-header">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
              </svg>
              Client App
            </div>
            <div className="card" id="clientCard">
              <div className="live-client-card">
                <LiveChat
                  mode={currentMode}
                  isAuthed={props.isAuthed}
                  onProtocolEvent={handleProtocolEvent}
                />
              </div>
            </div>
          </div>

          <div className="zone" id="zoneNetwork">
            <div className="zone-header">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              Network / Protocol
            </div>
            <div className="card">
              <div className="network-stage live-network">
                <div className="connection-line">
                  <div className="arrow-head arrow-right"></div>
                  <div className="arrow-head arrow-left"></div>
                </div>
                {lastPacket ? (
                  <div className={`live-packet ${lastPacket.type}`}>
                    <div className="packet-meta">
                      <span className="packet-time">{lastPacket.time}</span>
                      <span className={`packet-type ${lastPacket.type}`}>{lastPacket.type.toUpperCase()}</span>
                    </div>
                    <div className="packet-title">{lastPacket.title}</div>
                    <pre className="packet-body">{lastPacket.content}</pre>
                  </div>
                ) : (
                  <div className="live-packet empty">No traffic yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="zone" id="zoneServer">
            <div className="zone-header">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
              LLM Service
            </div>
            <div className="card" id="serverCard">
              <div className="server-rack">
                <div className="context-window">
                  <div className="context-title">Context Window (Input)</div>
                  <div className="live-context" style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>
                    {protocolContext || "(Empty)"}
                  </div>
                </div>
                <div className="context-window">
                  <div className="context-title">Generation (Output)</div>
                  <div className="token-stream">
                    {protocolTokens.length === 0 ? (
                      <span className="token-placeholder">Awaiting stream...</span>
                    ) : (
                      protocolTokens.map((token, idx) => (
                        <span key={`${token}-${idx}`} className="token">{token}</span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="zone" id="zoneLog">
            <div className="zone-header">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Traffic Log
              {liveTraceId && (
                <span className="trace-pill">Trace: {liveTraceId.slice(0, 8)}...</span>
              )}
            </div>
            <div className="card log-card">
              <div className="log-content">
                {protocolLog.length === 0 ? (
                  <div className="log-empty">No traffic yet.</div>
                ) : (
                  protocolLog.map((entry) => (
                    <ProtocolLogItem key={entry.id} entry={entry} />
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      <style jsx>{`
        .view-mode-toggle {
          display: flex;
          gap: 4px;
          background: rgba(0, 0, 0, 0.05);
          padding: 4px;
          border-radius: 10px;
          margin-right: 12px;
        }

        .view-btn {
          padding: 6px 12px;
          border: none;
          background: transparent;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-sec);
          transition: all 0.2s;
        }

        .view-btn:hover {
          color: var(--text);
        }

        .view-btn.active {
          background: var(--card-bg);
          color: var(--accent);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .live-stage {
          align-items: stretch;
        }

        .live-client-card {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .live-network {
          padding: 20px;
          position: relative;
        }

        .live-packet {
          position: relative;
          z-index: 1;
          max-width: 100%;
          width: 100%;
          background: var(--card-bg);
          border-radius: 12px;
          border: 1px solid var(--border);
          padding: 12px;
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--text);
          box-shadow: var(--shadow);
        }

        .live-packet.empty {
          text-align: center;
          color: var(--text-sec);
        }

        .packet-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          font-size: 10px;
          color: var(--text-sec);
        }

        .packet-type {
          padding: 2px 6px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .packet-type.req { background: rgba(0, 122, 255, 0.12); color: var(--accent); }
        .packet-type.res { background: rgba(52, 199, 89, 0.12); color: var(--success); }
        .packet-type.info { background: rgba(255, 159, 10, 0.12); color: var(--orange); }

        .packet-title {
          font-weight: 600;
          margin-bottom: 6px;
        }

        .packet-body {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 220px;
          overflow-y: auto;
        }

        .token-placeholder {
          color: var(--text-sec);
          font-size: 11px;
        }

        .trace-pill {
          margin-left: auto;
          font-size: 10px;
          color: var(--text-sec);
          background: var(--bg);
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
        }
      `}</style>
    </>
  );
}

function ProtocolLogItem({ entry }: { entry: ProtocolLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className={`log-entry ${expanded ? "expanded" : ""}`} onClick={() => setExpanded(!expanded)}>
        <div className="log-time">{entry.time}</div>
        <div className={`log-type ${entry.type}`}>{entry.type.toUpperCase()}</div>
        <div className="log-summary">{entry.title}</div>
      </div>
      {expanded && (
        <div className="log-detail" style={{ display: "block" }}>{entry.content}</div>
      )}
    </>
  );
}
