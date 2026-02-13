export const API_ROUTES = {
  AUTH: {
    SIGNIN: "/api/auth/signin",
    SIGNOUT: "/api/auth/signout",
    CALLBACK: "/api/auth/callback",
    SESSION: "/api/auth/session",
  },
  CHAT: {
    STREAM: "/api/chat/stream",
  },
  CONVERSATIONS: {
    BASE: "/api/conversations",
    BY_ID: (id: string) => `/api/conversations/${id}`,
    MESSAGES: (id: string) => `/api/conversations/${id}/messages`,
  },
  SANDBOX: {
    FILES: "/api/sandbox/files",
    FILE: "/api/sandbox/file",
    INIT: "/api/sandbox/init",
    EXEC: "/api/sandbox/exec",
  },
  QUOTA: "/api/quota",
  METRICS: "/api/metrics",
  DEBUG: {
    TRACES: "/api/debug/traces",
  },
} as const;

export function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export function conversationsListUrl(mode: string): string {
  return `${API_ROUTES.CONVERSATIONS.BASE}${buildQueryString({ mode })}`;
}

export function conversationMessagesUrl(conversationId: string, mode?: string): string {
  const base = API_ROUTES.CONVERSATIONS.MESSAGES(conversationId);
  if (mode) {
    return `${base}${buildQueryString({ mode })}`;
  }
  return base;
}

export function sandboxFileUrl(path: string): string {
  return `${API_ROUTES.SANDBOX.FILE}${buildQueryString({ path })}`;
}

export function sandboxDeleteUrl(path: string): string {
  return `${API_ROUTES.SANDBOX.FILES}${buildQueryString({ path })}`;
}

export function debugTraceUrl(traceId: string): string {
  return `${API_ROUTES.DEBUG.TRACES}${buildQueryString({ id: traceId })}`;
}
