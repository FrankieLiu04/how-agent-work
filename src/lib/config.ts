export const SANDBOX_LIMITS = {
  MAX_FILES_PER_USER: 20,
  MAX_FILE_SIZE_BYTES: 5 * 1024,
  MAX_TOTAL_SIZE_BYTES: 100 * 1024,
} as const;

export const CONVERSATION_LIMITS = {
  MAX_CONVERSATIONS_PER_USER: 10,
  MAX_MESSAGES_PER_CONVERSATION: 40,
} as const;

export const CHAT_LIMITS = {
  MAX_INPUT_LENGTH: 500,
  MAX_OUTPUT_TOKENS: 800,
} as const;

export const AGENT_LIMITS = {
  MAX_TOOL_ROUNDS: 5,
  MAX_TOOL_CALLS_PER_ROUND: 3,
} as const;

export const QUOTA_LIMITS = {
  REQUESTS_PER_HOUR: 60,
} as const;

export const TERMINAL_LIMITS = {
  MAX_COMMAND_LENGTH: 500,
} as const;

export const TOOL_RESULT_LIMITS = {
  MAX_CHARS: 20_000,
} as const;

export const OBSERVABILITY_LIMITS = {
  MAX_TRACES: 200,
  MAX_SAMPLES: 5000,
} as const;

export const DEFAULT_MODEL = "deepseek-chat" as const;

export const DEFAULT_TTFB_MS = {
  MIN: 600,
  MAX: 1200,
} as const;

export const DEFAULT_TOKEN_DELAY_MS = 30;
export const DEFAULT_JITTER_MS = 20;

export function getDefaultTtfbMs(): number {
  return DEFAULT_TTFB_MS.MIN + Math.floor(Math.random() * (DEFAULT_TTFB_MS.MAX - DEFAULT_TTFB_MS.MIN));
}
