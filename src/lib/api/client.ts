import type {
  ChatMode,
  Conversation,
  ConversationMode,
  SandboxFile,
  SandboxWriteResult,
  CommandResult,
  QuotaInfo,
} from "~/types";
import {
  API_ROUTES,
  buildQueryString,
  conversationsListUrl,
} from "~/lib/routes";

export interface ApiClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface ChatStreamParams {
  mode: ChatMode;
  messages: Array<{
    role: string;
    content?: string | null;
    tool_calls?: unknown;
    tool_call_id?: string;
  }>;
  conversationId?: string | null;
  useReal?: boolean;
  signal?: AbortSignal;
}

export interface ChatStreamResponse {
  response: Response;
  traceId: string | null;
}

class ApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? "";
    this.headers = config.headers ?? {};
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new ApiError(
        (error as { error?: string }).error ?? `HTTP ${response.status}`,
        response.status,
        response
      );
    }

    return response.json() as Promise<T>;
  }

  chat = {
    stream: async (params: ChatStreamParams): Promise<ChatStreamResponse> => {
      const response = await fetch(`${this.baseUrl}${API_ROUTES.CHAT.STREAM}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          stream: true,
          x_mode: params.mode,
          x_conversation_id: params.conversationId,
          x_use_real: params.useReal,
          messages: params.messages,
        }),
        signal: params.signal,
      });

      const traceId = response.headers.get("x-trace-id");

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new ApiError(
          (error as { error?: string }).error ?? `HTTP ${response.status}`,
          response.status,
          response
        );
      }

      return { response, traceId };
    },
  };

  conversations = {
    list: async (mode: ConversationMode): Promise<Conversation[]> => {
      const data = await this.request<{ conversations: Conversation[] }>(
        conversationsListUrl(mode)
      );
      return data.conversations;
    },

    get: async (id: string): Promise<Conversation> => {
      return this.request<Conversation>(API_ROUTES.CONVERSATIONS.BY_ID(id));
    },

    create: async (mode: ConversationMode): Promise<Conversation> => {
      return this.request<Conversation>(API_ROUTES.CONVERSATIONS.BASE, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
    },

    delete: async (id: string): Promise<void> => {
      await this.request(API_ROUTES.CONVERSATIONS.BY_ID(id), {
        method: "DELETE",
      });
    },

    getMessages: async (
      conversationId: string,
      mode: ConversationMode
    ): Promise<{
      messages: Array<{
        id: string;
        role: string;
        content?: string | null;
        toolCalls?: unknown;
        working?: unknown;
        toolCallId?: string;
        createdAt: string;
      }>;
    }> => {
      return this.request(API_ROUTES.CONVERSATIONS.MESSAGES(conversationId) + buildQueryString({ mode }));
    },

    addMessage: async (
      conversationId: string,
      message: {
        role: string;
        content?: string;
        toolCalls?: unknown;
        toolCallId?: string;
        working?: unknown;
      }
    ): Promise<void> => {
      await this.request(API_ROUTES.CONVERSATIONS.MESSAGES(conversationId), {
        method: "POST",
        body: JSON.stringify(message),
      });
    },
  };

  sandbox = {
    listFiles: async (conversationId?: string): Promise<SandboxFile[]> => {
      const qs = conversationId ? buildQueryString({ conversationId }) : "";
      const data = await this.request<{ files: SandboxFile[] }>(
        `${API_ROUTES.SANDBOX.FILES}${qs}`
      );
      return data.files;
    },

    readFile: async (path: string, conversationId?: string): Promise<string | null> => {
      const qs = buildQueryString({ path, conversationId });
      const data = await this.request<{ content: string | null }>(
        `${API_ROUTES.SANDBOX.FILE}${qs}`
      );
      return data.content;
    },

    writeFile: async (
      path: string,
      content: string,
      conversationId?: string
    ): Promise<SandboxWriteResult> => {
      return this.request<SandboxWriteResult>(API_ROUTES.SANDBOX.FILES, {
        method: "POST",
        body: JSON.stringify({ path, content, conversationId }),
      });
    },

    deleteFile: async (path: string, conversationId?: string): Promise<void> => {
      const qs = buildQueryString({ path, conversationId });
      await this.request(`${API_ROUTES.SANDBOX.FILES}${qs}`, {
        method: "DELETE",
      });
    },

    init: async (conversationId?: string): Promise<{ files: SandboxFile[] }> => {
      return this.request(API_ROUTES.SANDBOX.INIT, {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
    },

    exec: async (
      command: string,
      cwd: string = "/",
      conversationId?: string
    ): Promise<CommandResult> => {
      return this.request<CommandResult>(API_ROUTES.SANDBOX.EXEC, {
        method: "POST",
        body: JSON.stringify({ command, cwd, conversationId }),
      });
    },
  };

  quota = {
    get: async (): Promise<QuotaInfo> => {
      return this.request<QuotaInfo>(API_ROUTES.QUOTA);
    },
  };
}

export class ApiError extends Error {
  status: number;
  response: Response;

  constructor(message: string, status: number, response: Response) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.response = response;
  }
}

export const apiClient = new ApiClient();

export { ApiClient };
