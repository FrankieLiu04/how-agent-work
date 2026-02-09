"use client";

import { useEffect, useRef, useState } from "react";
import { init, type EngineAPI } from "./engine";
import { LiveChat } from "~/components/LiveChat";
import type { Mode } from "./state";

type ViewMode = "demo" | "live";

export function Microscope(props: { isAuthed: boolean; userName: string | null }) {
  const apiRef = useRef<EngineAPI | null>(null);
  const [currentMode, setCurrentMode] = useState<Mode>("chat");
  const [viewMode, setViewMode] = useState<ViewMode>("demo");

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
  };

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
        <main className="live-main">
          <LiveChat
            mode={currentMode}
            isAuthed={props.isAuthed}
          />
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

        .live-main {
          flex: 1;
          padding: 24px 32px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          overflow: hidden;
        }
      `}</style>
    </>
  );
}
