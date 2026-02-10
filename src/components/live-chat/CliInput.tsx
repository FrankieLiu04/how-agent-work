"use client";

import { useState, type KeyboardEvent } from "react";

interface CliInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function CliInput({ onSend, disabled }: CliInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="live-chat__cli-input">
      <span className="live-chat__cli-input-prompt">$</span>
      <input
        className="live-chat__cli-input-field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Running..." : "Type a command and press Enter"}
        disabled={disabled}
        aria-label="CLI command input"
      />
      <span className={`live-chat__cli-cursor ${disabled ? "live-chat__cli-cursor--dim" : ""}`}></span>
    </div>
  );
}
