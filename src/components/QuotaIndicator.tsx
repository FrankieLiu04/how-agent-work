"use client";

interface QuotaIndicatorProps {
  used: number;
  max: number;
  label?: string;
  showReset?: boolean;
  resetTime?: Date | null;
}

export function QuotaIndicator({
  used,
  max,
  label = "API calls",
  showReset = true,
  resetTime = null,
}: QuotaIndicatorProps) {
  const remaining = Math.max(0, max - used);
  const percentage = Math.min(100, (used / max) * 100);
  const isLow = remaining <= 1;
  const isEmpty = remaining === 0;

  // Calculate time until reset
  const getResetText = () => {
    if (!resetTime) return null;
    const now = new Date();
    const diff = resetTime.getTime() - now.getTime();
    if (diff <= 0) return "Resetting...";
    
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    }
    return `${minutes}m`;
  };

  const resetText = getResetText();

  return (
    <div className={`quota-indicator ${isLow ? "low" : ""} ${isEmpty ? "empty" : ""}`}>
      <div className="quota-header">
        <span className="quota-label">{label}</span>
        <span className="quota-count">
          {remaining}/{max}
        </span>
      </div>
      <div className="quota-bar">
        <div 
          className="quota-fill" 
          style={{ width: `${100 - percentage}%` }}
        />
      </div>
      {showReset && resetText && (
        <div className="quota-reset">
          Resets in {resetText}
        </div>
      )}
      <style jsx>{`
        .quota-indicator {
          padding: 8px 12px;
          background: var(--bg);
          border-radius: 10px;
          border: 1px solid var(--border);
          font-size: 12px;
        }

        .quota-indicator.low {
          border-color: var(--warning, #ff9f0a);
          background: rgba(255, 159, 10, 0.05);
        }

        .quota-indicator.empty {
          border-color: var(--error, #ff3b30);
          background: rgba(255, 59, 48, 0.05);
        }

        .quota-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .quota-label {
          color: var(--text-sec);
          font-weight: 500;
        }

        .quota-count {
          font-weight: 600;
          color: var(--text);
        }

        .quota-indicator.low .quota-count {
          color: var(--warning, #ff9f0a);
        }

        .quota-indicator.empty .quota-count {
          color: var(--error, #ff3b30);
        }

        .quota-bar {
          height: 4px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }

        .quota-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .quota-indicator.low .quota-fill {
          background: var(--warning, #ff9f0a);
        }

        .quota-indicator.empty .quota-fill {
          background: var(--error, #ff3b30);
        }

        .quota-reset {
          margin-top: 4px;
          font-size: 10px;
          color: var(--text-sec);
          text-align: right;
        }
      `}</style>
    </div>
  );
}

// Limit indicator for conversations/files
interface LimitIndicatorProps {
  current: number;
  max: number;
  label: string;
  unit?: string;
  showWarningAt?: number; // Percentage at which to show warning (default 80%)
}

export function LimitIndicator({
  current,
  max,
  label,
  unit = "",
  showWarningAt = 80,
}: LimitIndicatorProps) {
  const percentage = (current / max) * 100;
  const isWarning = percentage >= showWarningAt;
  const isFull = current >= max;

  const formatValue = (val: number) => {
    if (unit === "KB") {
      return `${(val / 1024).toFixed(1)}KB`;
    }
    return `${val}${unit}`;
  };

  return (
    <div className={`limit-indicator ${isWarning ? "warning" : ""} ${isFull ? "full" : ""}`}>
      <span className="limit-label">{label}</span>
      <span className="limit-value">
        {unit === "KB" ? formatValue(current) : current}/{unit === "KB" ? formatValue(max) : max}
      </span>
      <style jsx>{`
        .limit-indicator {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 8px;
          font-size: 11px;
          color: var(--text-sec);
        }

        .limit-indicator.warning {
          color: var(--warning, #ff9f0a);
        }

        .limit-indicator.full {
          color: var(--error, #ff3b30);
        }

        .limit-label {
          font-weight: 500;
        }

        .limit-value {
          font-family: var(--font-mono);
        }
      `}</style>
    </div>
  );
}
