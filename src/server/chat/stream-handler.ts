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
import { type ChatMode, type ChatStreamRequest, type ApiChatMessage } from "~/types";
import { CHAT_LIMITS, QUOTA_LIMITS } from "~/lib/config";
import { prepareMessages, lastUserContent } from "./message-prepare";
import { getToolsForMode } from "./tool-executor";
import { runMockStream } from "./mock-provider";
import { runRealStream } from "./real-provider";

export interface StreamHandlerContext {
  request: Request;
  body: ChatStreamRequest;
}

export interface StreamHandlerResult {
  response: Response;
  traceId: string;
}

export async function handleChatStream(context: StreamHandlerContext): Promise<StreamHandlerResult> {
  const { request, body } = context;
  const traceId = randomUUID().replaceAll("-", "").slice(0, 16);

  const mode = pickMode(body);
  const prompt = lastUserContent(body.messages);

  if (prompt.length > CHAT_LIMITS.MAX_INPUT_LENGTH) {
    return {
      response: new Response(
        JSON.stringify({
          error: "input_too_long",
          max_length: CHAT_LIMITS.MAX_INPUT_LENGTH,
          actual_length: prompt.length,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      ),
      traceId,
    };
  }

  const trace = startTrace({
    traceId,
    route: "/api/chat/stream",
    mode,
    provider: "mock",
  });
  incrementCounter("requests_total{route=/api/chat/stream}");

  const ttfbMs =
    typeof body.x_ttfb_ms === "number"
      ? body.x_ttfb_ms
      : 600 + Math.floor(Math.random() * 600);
  const tokenDelayMs =
    typeof body.x_token_delay_ms === "number" ? body.x_token_delay_ms : 30;
  const jitterMs =
    typeof body.x_jitter_ms === "number" ? body.x_jitter_ms : 20;

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
  const useReal = Boolean(userId && env.OPENAI_API_KEY && body.x_use_real !== false);
  trace.provider = useReal ? "deepseek" : "mock";

  if (useReal && userId) {
    const quotaSpan = startSpan(trace, "quota.consume");
    try {
      quota = await consumeHourlyQuota({ userId, limit: QUOTA_LIMITS.REQUESTS_PER_HOUR });
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
    return {
      response: new Response(
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
      ),
      traceId,
    };
  }

  if (useReal) {
    return handleRealMode({
      request,
      body,
      mode,
      traceId,
      trace,
      quota,
      ttfbMs,
    });
  }

  return handleMockMode({
    request,
    body,
    mode,
    traceId,
    trace,
    quota,
    ttfbMs,
    tokenDelayMs,
    jitterMs,
    prompt,
  });
}

function pickMode(req: ChatStreamRequest): ChatMode {
  const mode = req.x_mode;
  if (mode) return mode;
  return "chat";
}

interface RealModeOptions {
  request: Request;
  body: ChatStreamRequest;
  mode: ChatMode;
  traceId: string;
  trace: ReturnType<typeof startTrace>;
  quota: Awaited<ReturnType<typeof consumeHourlyQuota>> | null;
  ttfbMs: number;
}

async function handleRealMode(options: RealModeOptions): Promise<StreamHandlerResult> {
  const { request, body, mode, traceId, trace, quota } = options;

  incrementCounter("streams_total{route=/api/chat/stream,provider=deepseek}");

  const messages = body.messages ?? [{ role: "user", content: "" }];
  const preparedMessages = prepareMessages(mode, messages);
  const tools = getToolsForMode(mode);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let firstByteAt: number | null = null;
      let traceFinished = false;

      const finalizeTrace = (status: number) => {
        if (traceFinished) return;
        traceFinished = true;
        recordSample(
          "request_latency_ms{route=/api/chat/stream}",
          Date.now() - trace.startMs
        );
        finishTrace(trace, {
          status,
          ttfbMs: firstByteAt ? firstByteAt - trace.startMs : null,
        });
      };

      const writeData = (data: string) => {
        if (firstByteAt === null) {
          firstByteAt = Date.now();
          recordSample(
            "ttfb_ms{route=/api/chat/stream}",
            firstByteAt - trace.startMs
          );
        }
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        await runRealStream({
          mode,
          messages: preparedMessages,
          signal: request.signal,
          trace: {
            startMs: trace.startMs,
            provider: trace.provider,
          },
          onStartSpan: (name) => startSpan(trace, name),
          onFinishSpan: (span) => finishSpan(span),
          onWriteData: writeData,
          onRecordTtfb: (ms) => recordSample("ttfb_ms{route=/api/chat/stream}", ms),
          onIncrementCounter: (name) => incrementCounter(name),
        });

        controller.close();
        finalizeTrace(200);
      } catch {
        controller.close();
        finalizeTrace(499);
      }
    },
  });

  return {
    response: new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
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
    }),
    traceId,
  };
}

interface MockModeOptions {
  request: Request;
  body: ChatStreamRequest;
  mode: ChatMode;
  traceId: string;
  trace: ReturnType<typeof startTrace>;
  quota: Awaited<ReturnType<typeof consumeHourlyQuota>> | null;
  ttfbMs: number;
  tokenDelayMs: number;
  jitterMs: number;
  prompt: string;
}

async function handleMockMode(options: MockModeOptions): Promise<StreamHandlerResult> {
  const { request, body, mode, traceId, trace, quota, ttfbMs, tokenDelayMs, jitterMs, prompt } = options;

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
        await runMockStream({
          traceId,
          mode,
          prompt,
          messages: body.messages ?? [],
          ttfbMs,
          tokenDelayMs,
          jitterMs,
          model: body.model,
          onWrite: write,
          onWriteJSON: writeJSON,
          onWriteDone: writeDone,
          signal: request.signal,
        });

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

  return {
    response: new Response(stream, {
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
    }),
    traceId,
  };
}
