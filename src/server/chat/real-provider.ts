import { type ApiChatMessage, type ChatMode, type StreamChunk } from "~/types";
import { CHAT_LIMITS, AGENT_LIMITS, DEFAULT_MODEL } from "~/lib/config";
import { env } from "~/env";
import {
  type AccumulatedToolCall,
  appendToolCallDelta,
  parseToolArguments,
  executeToolCall,
  buildWorkingSummary,
  getToolsForMode,
} from "./tool-executor";
import { lastUserContent } from "./message-prepare";

export interface RealStreamOptions {
  mode: ChatMode;
  messages: ApiChatMessage[];
  signal: AbortSignal;
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
    trace,
    onStartSpan,
    onFinishSpan,
    onWriteData,
    onRecordTtfb,
    onIncrementCounter,
  } = options;

  const baseUrl = env.OPENAI_BASE_URL ?? "https://api.deepseek.com";
  const tools = getToolsForMode(mode);

  if (mode === "agent" && tools) {
    await runAgentLoop({
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

interface AgentLoopOptions {
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

async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  const {
    baseUrl,
    messages: initialMessages,
    tools,
    signal,
    trace,
    onStartSpan,
    onFinishSpan,
    onWriteData,
    onRecordTtfb,
    onIncrementCounter,
  } = options;

  let currentMessages = initialMessages;
  let round = 0;
  let allowTools = true;
  let workingActive = false;
  let workingDoneSent = false;
  let firstByteAt: number | null = null;

  const writeData = (data: string) => {
    if (firstByteAt === null) {
      firstByteAt = Date.now();
      onRecordTtfb(firstByteAt - trace.startMs);
    }
    onWriteData(data);
  };

  while (true) {
    if (signal.aborted) throw new Error("aborted");

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
          messages: currentMessages,
          max_tokens: CHAT_LIMITS.MAX_OUTPUT_TOKENS,
          stream: true,
          ...(allowTools ? { tools } : {}),
        }),
        signal,
      }
    );
    onFinishSpan(span);

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      onIncrementCounter("upstream_error_total{provider=deepseek,route=/api/chat/stream}");
      writeData(
        JSON.stringify({
          type: "error",
          error: "upstream_error",
          status: upstream.status,
          body: text,
        })
      );
      writeData("[DONE]");
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawToolFinish = false;
    const toolCalls = new Map<number, AccumulatedToolCall>();
    let assistantContent = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        if (data === "[DONE]") continue;

        let parsed: StreamChunk | null = null;
        try {
          parsed = JSON.parse(data) as StreamChunk;
        } catch {
          parsed = null;
        }

        const choice = parsed?.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          assistantContent += delta.content;
        }

        if (delta?.content && workingActive && !workingDoneSent) {
          writeData(
            JSON.stringify({
              type: "working_state",
              status: "done",
            })
          );
          workingDoneSent = true;
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            appendToolCallDelta(toolCalls, tc);
          }
        }

        if (choice?.finish_reason === "tool_calls") {
          sawToolFinish = true;
        }

        if (data !== "[DONE]") {
          writeData(data);
        }
      }
    }

    if (!sawToolFinish) {
      break;
    }

    round += 1;
    if (round > AGENT_LIMITS.MAX_TOOL_ROUNDS) {
      currentMessages = [
        ...currentMessages,
        {
          role: "system",
          content: "已达到工具调用上限，请基于已有信息给出最终答案。",
        },
      ];
      allowTools = false;
      continue;
    }

    const limitedToolCalls = Array.from(toolCalls.values()).slice(
      0,
      AGENT_LIMITS.MAX_TOOL_CALLS_PER_ROUND
    );

    if (limitedToolCalls.length === 0) {
      break;
    }

    if (!workingActive) {
      writeData(
        JSON.stringify({
          type: "working_state",
          status: "working",
        })
      );
      workingActive = true;
      workingDoneSent = false;
    }

    currentMessages = [
      ...currentMessages,
      {
        role: "assistant",
        content: assistantContent || null,
        tool_calls: limitedToolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.argumentsText,
          },
        })),
      },
    ];

    for (const call of limitedToolCalls) {
      const args = parseToolArguments(call.argumentsText);
      const fallbackQuery = lastUserContent(currentMessages);
      const resolvedArgs =
        call.name === "tavily_search" && (!args.query || typeof args.query !== "string")
          ? { ...args, query: fallbackQuery }
          : args;
      writeData(
        JSON.stringify({
          type: "working_summary",
          text: buildWorkingSummary(call.name, resolvedArgs),
        })
      );
      let resultText = "";
      try {
        resultText = await executeToolCall(call.name, resolvedArgs);
      } catch (error) {
        resultText = `Tool execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }

      writeData(
        JSON.stringify({
          type: "working_summary",
          text: "已获取检索结果，正在整理...",
        })
      );

      writeData(
        JSON.stringify({
          type: "tool_result",
          tool_call_id: call.id,
          name: call.name,
          result: resultText,
        })
      );

      currentMessages = [
        ...currentMessages,
        {
          role: "tool",
          tool_call_id: call.id,
          content: resultText,
        },
      ];
    }

    currentMessages = [
      ...currentMessages,
      {
        role: "system",
        content:
          "请基于工具结果进行总结，不要直接原样粘贴结果。请结构化输出结论并标注来源链接。",
      },
    ];
  }

  writeData("[DONE]");
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
