import { randomUUID } from "crypto";

import { auth } from "~/server/auth";
import { consumeHourlyQuota } from "~/server/quota";
import { finishSpan, finishTrace, incrementCounter, recordSample, startSpan, startTrace } from "~/server/observability";
import { env } from "~/env";

type ChatMessage = {
  role: "user" | "assistant" | "tool" | string;
  content?: string;
};

type ChatCompletionRequest = {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  x_mode?: "chat" | "agent" | "ide" | "cli";
  x_ttfb_ms?: number;
  x_token_delay_ms?: number;
  x_jitter_ms?: number;
  tools?: unknown;
};

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
      { once: true },
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

function resolveRealModel(requested: string | undefined): string {
  if (!requested) return "gpt-4o-mini";
  if (requested.startsWith("mock-")) return "gpt-4o-mini";
  return requested;
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

  const trace = startTrace({ traceId, route: "/api/chat/stream", mode, provider: "mock" });
  incrementCounter("requests_total{route=/api/chat/stream}");

  const ttfbMs = typeof reqBody.x_ttfb_ms === "number" ? reqBody.x_ttfb_ms : 600 + Math.floor(Math.random() * 600);
  const tokenDelayMs = typeof reqBody.x_token_delay_ms === "number" ? reqBody.x_token_delay_ms : 30;
  const jitterMs = typeof reqBody.x_jitter_ms === "number" ? reqBody.x_jitter_ms : 20;

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
  const useReal = Boolean(userId && env.OPENAI_API_KEY);
  trace.provider = useReal ? "openai" : "mock";
  if (useReal && userId) {
    const quotaSpan = startSpan(trace, "quota.consume");
    try {
      quota = await consumeHourlyQuota({ userId, limit: 5 });
    } catch {
      quota = null;
    } finally {
      finishSpan(quotaSpan);
    }
  }
  if (quota && !quota.allowed) {
    incrementCounter("quota_denied_total{route=/api/chat/stream}");
    recordSample("request_latency_ms{route=/api/chat/stream}", Date.now() - trace.startMs);
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
      },
    );
  }

  if (useReal) {
    incrementCounter("streams_total{route=/api/chat/stream,provider=openai}");
    const baseUrl = env.OPENAI_BASE_URL ?? "https://api.openai.com";
    const upstreamSpan = startSpan(trace, "openai.upstream");
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolveRealModel(reqBody.model),
        messages: reqBody.messages ?? [{ role: "user", content: prompt }],
        tools: reqBody.tools,
        stream: true,
      }),
      signal: request.signal,
    });
    finishSpan(upstreamSpan);

    const contentType = upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8";

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      incrementCounter("upstream_error_total{provider=openai,route=/api/chat/stream}");
      recordSample("request_latency_ms{route=/api/chat/stream}", Date.now() - trace.startMs);
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
        },
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
                recordSample("ttfb_ms{route=/api/chat/stream}", firstByteAt - trace.startMs);
              }
              controller.enqueue(value);
            }
          }
        } catch {
        } finally {
          controller.close();
          recordSample("request_latency_ms{route=/api/chat/stream}", Date.now() - trace.startMs);
          finishTrace(trace, { status: 200, ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null });
        }
      },
      cancel: () => {
        recordSample("request_latency_ms{route=/api/chat/stream}", Date.now() - trace.startMs);
        finishTrace(trace, { status: 499, ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null });
      },
    });

    return new Response(wrapped, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Trace-Id": traceId,
        ...(quota
          ? {
              "X-Quota-Remaining": String(quota.remaining),
              "X-Quota-Reset": quota.resetAt.toISOString(),
            }
          : {}),
      },
    });
  }

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

        if (mode === "agent" && !hasToolResult(reqBody.messages)) {
          if (firstByteAt === null) {
            firstByteAt = Date.now();
            recordSample("ttfb_ms{route=/api/chat/stream}", firstByteAt - trace.startMs);
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
                      function: { name: "get_weather", arguments: JSON.stringify({ location: "Beijing" }) },
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
          recordSample("request_latency_ms{route=/api/chat/stream}", Date.now() - trace.startMs);
          finishTrace(trace, { status: 200, ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null });
          return;
        }

        const tokens =
          mode === "chat"
            ? ["HTTP", "是", "互联", "网", "基础", "协议"]
            : mode === "agent"
              ? ["北京", "今天", "22度", "晴"]
              : mode === "ide"
                ? ["return ", "items", ".reduce", "((acc, ", "item) ", "=> ", "acc ", "+ ", "item.price, ", "0);"]
                : ["Thought: ", "Find ", "all ", "occurrences ", "first, ", "then ", "update ", "exports ", "and ", "call ", "sites."];

        for (const token of tokens) {
          if (request.signal.aborted) throw new Error("aborted");
          incrementCounter(`tokens_total{mode=${mode}}`);
          if (firstByteAt === null) {
            firstByteAt = Date.now();
            recordSample("ttfb_ms{route=/api/chat/stream}", firstByteAt - trace.startMs);
          }
          writeJSON({
            id: traceId,
            object: "chat.completion.chunk",
            created: nowSeconds(),
            model,
            choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
          });
          const jitter = Math.floor(Math.random() * Math.max(0, jitterMs));
          await sleep(Math.max(0, tokenDelayMs + jitter), request.signal);
        }

        const finishReason = mode === "cli" ? "tool_calls" : "stop";
        writeJSON({
          id: traceId,
          object: "chat.completion.chunk",
          created: nowSeconds(),
          model,
          choices: [{ index: 0, finish_reason: finishReason }],
        });

        writeDone();
        controller.close();
        recordSample("request_latency_ms{route=/api/chat/stream}", Date.now() - trace.startMs);
        finishTrace(trace, { status: 200, ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null });
      } catch {
        controller.close();
        recordSample("request_latency_ms{route=/api/chat/stream}", Date.now() - trace.startMs);
        finishTrace(trace, { status: 499, ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null });
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
      ...(quota
        ? {
            "X-Quota-Remaining": String(quota.remaining),
            "X-Quota-Reset": quota.resetAt.toISOString(),
          }
        : {}),
    },
  });
}
