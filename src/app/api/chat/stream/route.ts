import { randomUUID } from "crypto";

import { auth } from "~/server/auth";
import { consumeHourlyQuota } from "~/server/quota";
import {
  finishSpan,
  finishTrace,
  incrementCounter,
  recordSample,
  startSpan,
  startTrace,
} from "~/server/observability";
import { env } from "~/env";
import { getToolsForMode } from "~/lib/tools/definitions";
import { getSystemPrompt } from "~/lib/tools/prompts";

type ChatMessage = {
  role: "user" | "assistant" | "tool" | "system" | string;
  content?: string;
  tool_calls?: unknown;
  tool_call_id?: string;
};

type ChatCompletionRequest = {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  x_mode?: "chat" | "agent" | "ide" | "cli";
  x_ttfb_ms?: number;
  x_token_delay_ms?: number;
  x_jitter_ms?: number;
  x_conversation_id?: string;
  x_use_real?: boolean; // Force real API mode (for authenticated users)
  tools?: unknown;
};

const MAX_INPUT_LENGTH = 500;
const MAX_OUTPUT_TOKENS = 800;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
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

function pickMode(req: ChatCompletionRequest): "chat" | "agent" | "ide" | "cli" {
  const mode = req.x_mode;
  if (mode) return mode;
  return "chat";
}

function lastUserContent(messages: ChatMessage[] | undefined): string {
  const ms = messages ?? [];
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i];
    if (m?.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

function hasToolResult(messages: ChatMessage[] | undefined): boolean {
  return (messages ?? []).some((m) => m?.role === "tool");
}

/**
 * Prepare messages with system prompt injection
 */
function prepareMessages(
  mode: "chat" | "agent" | "ide" | "cli",
  messages: ChatMessage[]
): ChatMessage[] {
  const systemPrompt = getSystemPrompt(mode);

  // Check if there's already a system message
  const hasSystemMessage = messages.some((m) => m.role === "system");

  if (hasSystemMessage) {
    // Prepend our system prompt to existing one
    return messages.map((m) => {
      if (m.role === "system") {
        return {
          ...m,
          content: `${systemPrompt}\n\n${m.content ?? ""}`,
        };
      }
      return m;
    });
  }

  // Add system message at the beginning
  return [{ role: "system", content: systemPrompt }, ...messages];
}

export async function POST(request: Request): Promise<Response> {
  const traceId = randomUUID().replaceAll("-", "").slice(0, 16);

  let reqBody: ChatCompletionRequest;
  try {
    reqBody = (await request.json()) as ChatCompletionRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mode = pickMode(reqBody);
  const prompt = lastUserContent(reqBody.messages);

  // Validate input length
  if (prompt.length > MAX_INPUT_LENGTH) {
    return new Response(
      JSON.stringify({
        error: "input_too_long",
        max_length: MAX_INPUT_LENGTH,
        actual_length: prompt.length,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const trace = startTrace({
    traceId,
    route: "/api/chat/stream",
    mode,
    provider: "mock",
  });
  incrementCounter("requests_total{route=/api/chat/stream}");

  const ttfbMs =
    typeof reqBody.x_ttfb_ms === "number"
      ? reqBody.x_ttfb_ms
      : 600 + Math.floor(Math.random() * 600);
  const tokenDelayMs =
    typeof reqBody.x_token_delay_ms === "number" ? reqBody.x_token_delay_ms : 30;
  const jitterMs =
    typeof reqBody.x_jitter_ms === "number" ? reqBody.x_jitter_ms : 20;

  let userId: string | undefined;
  const authSpan = startSpan(trace, "auth");
  try {
    const session = await auth();
    userId = session?.user?.id;
  } catch {
    userId = undefined;
  } finally {
    finishSpan(authSpan);
  }

  let quota: Awaited<ReturnType<typeof consumeHourlyQuota>> | null = null;
  // Use real API if:
  // 1. User is authenticated AND has API key configured
  // 2. OR x_use_real is explicitly set to true (and user is authenticated)
  const useReal = Boolean(userId && env.OPENAI_API_KEY && reqBody.x_use_real !== false);
  trace.provider = useReal ? "deepseek" : "mock";

  if (useReal && userId) {
    const quotaSpan = startSpan(trace, "quota.consume");
    try {
      quota = await consumeHourlyQuota({ userId, limit: 60 });
    } catch {
      quota = null;
    } finally {
      finishSpan(quotaSpan);
    }
  }

  if (quota && !quota.allowed) {
    incrementCounter("quota_denied_total{route=/api/chat/stream}");
    recordSample(
      "request_latency_ms{route=/api/chat/stream}",
      Date.now() - trace.startMs
    );
    finishTrace(trace, { status: 429, ttfbMs: null });
    return new Response(
      JSON.stringify({
        error: "quota_exceeded",
        limit: quota.limit,
        remaining: quota.remaining,
        reset_at: quota.resetAt.toISOString(),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-Trace-Id": traceId,
          "X-Quota-Remaining": String(quota.remaining),
          "X-Quota-Reset": quota.resetAt.toISOString(),
        },
      }
    );
  }

  if (useReal) {
    incrementCounter("streams_total{route=/api/chat/stream,provider=deepseek}");

    // Use DeepSeek API (OpenAI compatible)
    const baseUrl = env.OPENAI_BASE_URL ?? "https://api.deepseek.com";
    const upstreamSpan = startSpan(trace, "deepseek.upstream");

    // Prepare messages with system prompt
    const messages = reqBody.messages ?? [{ role: "user", content: prompt }];
    const preparedMessages = prepareMessages(mode, messages);

    // Get tools for the mode
    const tools = getToolsForMode(mode);

    const upstream = await fetch(
      `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: preparedMessages,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          ...(tools ? { tools } : {}),
        }),
        signal: request.signal,
      }
    );
    finishSpan(upstreamSpan);

    const contentType =
      upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8";

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      incrementCounter(
        "upstream_error_total{provider=deepseek,route=/api/chat/stream}"
      );
      recordSample(
        "request_latency_ms{route=/api/chat/stream}",
        Date.now() - trace.startMs
      );
      finishTrace(trace, { status: 502, ttfbMs: null });
      return new Response(
        JSON.stringify({
          error: "upstream_error",
          status: upstream.status,
          body: text,
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": traceId,
            ...(quota
              ? {
                  "X-Quota-Remaining": String(quota.remaining),
                  "X-Quota-Reset": quota.resetAt.toISOString(),
                }
              : {}),
          },
        }
      );
    }

    const upstreamReader = upstream.body.getReader();
    let firstByteAt: number | null = null;

    const wrapped = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          while (true) {
            const { value, done } = await upstreamReader.read();
            if (done) break;
            if (value) {
              if (firstByteAt === null) {
                firstByteAt = Date.now();
                recordSample(
                  "ttfb_ms{route=/api/chat/stream}",
                  firstByteAt - trace.startMs
                );
              }
              controller.enqueue(value);
            }
          }
        } catch {
          // Stream was cancelled
        } finally {
          controller.close();
          recordSample(
            "request_latency_ms{route=/api/chat/stream}",
            Date.now() - trace.startMs
          );
          finishTrace(trace, {
            status: 200,
            ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null,
          });
        }
      },
      cancel: () => {
        recordSample(
          "request_latency_ms{route=/api/chat/stream}",
          Date.now() - trace.startMs
        );
        finishTrace(trace, {
          status: 499,
          ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null,
        });
      },
    });

    return new Response(wrapped, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Trace-Id": traceId,
        "X-Provider": "deepseek",
        ...(quota
          ? {
              "X-Quota-Remaining": String(quota.remaining),
              "X-Quota-Reset": quota.resetAt.toISOString(),
            }
          : {}),
      },
    });
  }

  // ============================================
  // Mock mode (for demo/visualization)
  // ============================================
  incrementCounter("streams_total{route=/api/chat/stream,provider=mock}");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const write = (line: string) => controller.enqueue(encoder.encode(line));

      const writeJSON = (obj: unknown) => {
        write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      const writeDone = () => {
        write("data: [DONE]\n\n");
      };

      let firstByteAt: number | null = null;
      try {
        await sleep(ttfbMs, request.signal);

        const model = reqBody.model ?? "mock-gpt-4";

        // Agent mode: return tool call for demo
        if (mode === "agent" && !hasToolResult(reqBody.messages)) {
          if (firstByteAt === null) {
            firstByteAt = Date.now();
            recordSample(
              "ttfb_ms{route=/api/chat/stream}",
              firstByteAt - trace.startMs
            );
          }
          writeJSON({
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

          await sleep(Math.max(0, tokenDelayMs), request.signal);

          writeJSON({
            id: traceId,
            object: "chat.completion.chunk",
            created: nowSeconds(),
            model,
            choices: [{ index: 0, finish_reason: "tool_calls" }],
          });

          writeDone();
          controller.close();
          recordSample(
            "request_latency_ms{route=/api/chat/stream}",
            Date.now() - trace.startMs
          );
          finishTrace(trace, {
            status: 200,
            ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null,
          });
          return;
        }

        // IDE/CLI mode: return file operation tool call for demo
        if ((mode === "ide" || mode === "cli") && !hasToolResult(reqBody.messages)) {
          if (firstByteAt === null) {
            firstByteAt = Date.now();
            recordSample(
              "ttfb_ms{route=/api/chat/stream}",
              firstByteAt - trace.startMs
            );
          }
          writeJSON({
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

          await sleep(Math.max(0, tokenDelayMs), request.signal);

          writeJSON({
            id: traceId,
            object: "chat.completion.chunk",
            created: nowSeconds(),
            model,
            choices: [{ index: 0, finish_reason: "tool_calls" }],
          });

          writeDone();
          controller.close();
          recordSample(
            "request_latency_ms{route=/api/chat/stream}",
            Date.now() - trace.startMs
          );
          finishTrace(trace, {
            status: 200,
            ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null,
          });
          return;
        }

        // Generate mock tokens based on mode
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
          if (request.signal.aborted) throw new Error("aborted");
          incrementCounter(`tokens_total{mode=${mode}}`);
          if (firstByteAt === null) {
            firstByteAt = Date.now();
            recordSample(
              "ttfb_ms{route=/api/chat/stream}",
              firstByteAt - trace.startMs
            );
          }
          writeJSON({
            id: traceId,
            object: "chat.completion.chunk",
            created: nowSeconds(),
            model,
            choices: [
              { index: 0, delta: { content: token }, finish_reason: null },
            ],
          });
          const jitter = Math.floor(Math.random() * Math.max(0, jitterMs));
          await sleep(Math.max(0, tokenDelayMs + jitter), request.signal);
        }

        writeJSON({
          id: traceId,
          object: "chat.completion.chunk",
          created: nowSeconds(),
          model,
          choices: [{ index: 0, finish_reason: "stop" }],
        });

        writeDone();
        controller.close();
        recordSample(
          "request_latency_ms{route=/api/chat/stream}",
          Date.now() - trace.startMs
        );
        finishTrace(trace, {
          status: 200,
          ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null,
        });
      } catch {
        controller.close();
        recordSample(
          "request_latency_ms{route=/api/chat/stream}",
          Date.now() - trace.startMs
        );
        finishTrace(trace, {
          status: 499,
          ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null,
        });
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Trace-Id": traceId,
      "X-Provider": "mock",
      ...(quota
        ? {
            "X-Quota-Remaining": String(quota.remaining),
            "X-Quota-Reset": quota.resetAt.toISOString(),
          }
        : {}),
    },
  });
}
