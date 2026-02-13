import { type ChatMode, type StreamChunk, type ApiChatMessage } from "~/types";
import { CHAT_LIMITS, DEFAULT_JITTER_MS, DEFAULT_TOKEN_DELAY_MS, getDefaultTtfbMs } from "~/lib/config";
import { hasToolResult, lastUserContent } from "./message-prepare";

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true }
    );
  });
}

export interface MockStreamOptions {
  traceId: string;
  mode: ChatMode;
  prompt: string;
  messages: ApiChatMessage[];
  ttfbMs?: number;
  tokenDelayMs?: number;
  jitterMs?: number;
  model?: string;
  onWrite: (data: string) => void;
  onWriteJSON: (obj: unknown) => void;
  onWriteDone: () => void;
  signal: AbortSignal;
}

export async function runMockStream(options: MockStreamOptions): Promise<void> {
  const {
    traceId,
    mode,
    prompt,
    messages,
    ttfbMs = getDefaultTtfbMs(),
    tokenDelayMs = DEFAULT_TOKEN_DELAY_MS,
    jitterMs = DEFAULT_JITTER_MS,
    model = "mock-gpt-4",
    onWriteJSON,
    onWriteDone,
    signal,
  } = options;

  await sleep(ttfbMs, signal);

  if (mode === "agent" && !hasToolResult(messages)) {
    onWriteJSON({
      id: traceId,
      object: "chat.completion.chunk",
      created: nowSeconds(),
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                id: `call_${traceId.slice(0, 8)}`,
                type: "function",
                function: {
                  name: "tavily_search",
                  arguments: JSON.stringify({ query: prompt || "latest tech news" }),
                },
              },
            ],
          },
        },
      ],
    });

    await sleep(Math.max(0, tokenDelayMs), signal);

    onWriteJSON({
      id: traceId,
      object: "chat.completion.chunk",
      created: nowSeconds(),
      model,
      choices: [{ index: 0, finish_reason: "tool_calls" }],
    });

    onWriteDone();
    return;
  }

  if ((mode === "ide" || mode === "cli") && !hasToolResult(messages)) {
    onWriteJSON({
      id: traceId,
      object: "chat.completion.chunk",
      created: nowSeconds(),
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                id: `call_${traceId.slice(0, 8)}`,
                type: "function",
                function: {
                  name: "list_files",
                  arguments: JSON.stringify({ path: "/" }),
                },
              },
            ],
          },
        },
      ],
    });

    await sleep(Math.max(0, tokenDelayMs), signal);

    onWriteJSON({
      id: traceId,
      object: "chat.completion.chunk",
      created: nowSeconds(),
      model,
      choices: [{ index: 0, finish_reason: "tool_calls" }],
    });

    onWriteDone();
    return;
  }

  const tokens =
    mode === "chat"
      ? ["HTTP", "是", "互联", "网", "基础", "协议"]
      : mode === "agent"
        ? ["根据", "搜索", "结果", "，", "这是", "最新", "信息", "。"]
        : mode === "ide"
          ? [
              "return ",
              "items",
              ".reduce",
              "((acc, ",
              "item) ",
              "=> ",
              "acc ",
              "+ ",
              "item.price, ",
              "0);",
            ]
          : [
              "我已经",
              "完成了",
              "文件",
              "操作",
              "。",
              "修改了",
              " 2 ",
              "个文件",
              "。",
            ];

  for (const token of tokens) {
    if (signal.aborted) throw new Error("aborted");
    onWriteJSON({
      id: traceId,
      object: "chat.completion.chunk",
      created: nowSeconds(),
      model,
      choices: [
        { index: 0, delta: { content: token }, finish_reason: null },
      ],
    });
    const jitter = Math.floor(Math.random() * Math.max(0, jitterMs));
    await sleep(Math.max(0, tokenDelayMs + jitter), signal);
  }

  onWriteJSON({
    id: traceId,
    object: "chat.completion.chunk",
    created: nowSeconds(),
    model,
    choices: [{ index: 0, finish_reason: "stop" }],
  });

  onWriteDone();
}
