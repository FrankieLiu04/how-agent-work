import { type ApiChatMessage, type ChatMode } from "~/types";
import { CHAT_LIMITS, DEFAULT_MODEL } from "~/lib/config";
import { env } from "~/env";
import { getToolsForMode } from "./tool-executor";
import { runAgentLoopStream } from "./agent-loop";
import { runFinanceGraphStream } from "./finance/graph";

export interface RealStreamOptions {
  mode: ChatMode;
  messages: ApiChatMessage[];
  signal: AbortSignal;
  userId: string | undefined;
  trace: {
    startMs: number;
    provider: string;
  };
  onStartSpan: (name: string) => { name: string; startMs: number; endMs: number | null; attrs: Record<string, string> };
  onFinishSpan: (span: { name: string; startMs: number; endMs: number | null; attrs: Record<string, string> }) => void;
  onWriteData: (data: string) => void;
  onRecordTtfb: (ms: number) => void;
  onIncrementCounter: (name: string) => void;
}

export async function runRealStream(options: RealStreamOptions): Promise<void> {
  const {
    mode,
    messages,
    signal,
    userId,
    trace,
    onStartSpan,
    onFinishSpan,
    onWriteData,
    onRecordTtfb,
    onIncrementCounter,
  } = options;

  const baseUrl = env.OPENAI_BASE_URL ?? "https://api.deepseek.com";
  const tools = getToolsForMode(mode);

  if (mode === "finance" && tools) {
    await runFinanceGraphStream({
      baseUrl,
      messages,
      tools,
      signal,
      userId,
      trace,
      onStartSpan,
      onFinishSpan,
      onWriteData,
      onRecordTtfb,
      onIncrementCounter,
    });
    return;
  }

  if (mode === "agent" && tools) {
    await runAgentLoopStream({
      baseUrl,
      messages,
      tools,
      signal,
      userId,
      trace,
      onStartSpan,
      onFinishSpan,
      onWriteData,
      onRecordTtfb,
      onIncrementCounter,
    });
    return;
  }

  await runSimpleStream({
    baseUrl,
    messages,
    tools,
    signal,
    trace,
    onStartSpan,
    onFinishSpan,
    onWriteData,
    onRecordTtfb,
    onIncrementCounter,
  });
}

interface SimpleStreamOptions {
  baseUrl: string;
  messages: ApiChatMessage[];
  tools: ReturnType<typeof getToolsForMode>;
  signal: AbortSignal;
  trace: { startMs: number; provider: string };
  onStartSpan: (name: string) => { name: string; startMs: number; endMs: number | null; attrs: Record<string, string> };
  onFinishSpan: (span: { name: string; startMs: number; endMs: number | null; attrs: Record<string, string> }) => void;
  onWriteData: (data: string) => void;
  onRecordTtfb: (ms: number) => void;
  onIncrementCounter: (name: string) => void;
}

async function runSimpleStream(options: SimpleStreamOptions): Promise<void> {
  const {
    baseUrl,
    messages,
    tools,
    signal,
    trace,
    onStartSpan,
    onFinishSpan,
    onWriteData,
    onRecordTtfb,
    onIncrementCounter,
  } = options;

  const span = onStartSpan("deepseek.upstream");
  const upstream = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        max_tokens: CHAT_LIMITS.MAX_OUTPUT_TOKENS,
        stream: true,
        ...(tools ? { tools } : {}),
      }),
      signal,
    }
  );
  onFinishSpan(span);

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    onIncrementCounter("upstream_error_total{provider=deepseek,route=/api/chat/stream}");
    throw new Error(`Upstream error: ${upstream.status} - ${text}`);
  }

  const reader = upstream.body.getReader();
  let firstByteAt: number | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      if (firstByteAt === null) {
        firstByteAt = Date.now();
        onRecordTtfb(firstByteAt - trace.startMs);
      }
      onWriteData(new TextDecoder().decode(value));
    }
  }
}
