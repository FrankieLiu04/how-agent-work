import { appState, type Mode, type Step } from "./state";
import { showPacket, movePacket, hidePacket, flyToken } from "./packet";
import { addLogEntry } from "./log";
import {
  highlight,
  clearUI,
  setClientTheme,
  addBubble,
  updateLastBubble,
  appendBubble,
  appendClientThinking,
  setIdeContent,
  appendIdeGhost,
  acceptIdeGhost,
  addTermLine,
  setContext,
  addToken,
} from "./ui";
import { parseSSEStream } from "./sse";

type ThinkingMode = Mode;

export const THINKING_SCRIPTS: Record<ThinkingMode, string[]> = {
  chat: [
    "<think>",
    "Analyzing user query: 'What is HTTP protocol?'",
    "Keywords: HTTP, protocol, definition.",
    "Retrieving knowledge base...",
    "HTTP (HyperText Transfer Protocol) is the foundation of data communication for the World Wide Web.",
    "Key concepts to include: Request/Response model, Statelessness, Methods (GET, POST).",
    "Structure: Definition -> Core features -> Importance.",
    "Drafting response...",
    "</think>",
  ],
  agent: [
    "<think>",
    "User intent: Query weather for Beijing.",
    "Detection: This requires real-time data.",
    "Checking available tools...",
    "- get_stock_price: No",
    "- get_weather: Yes (Requires 'location' parameter)",
    "Parameter extraction:",
    "- location: 'Beijing'",
    "Decision: Invoke tool 'get_weather' with args {location: 'Beijing'}.",
    "Generating tool call...",
    "</think>",
  ],
  ide: [
    "<think>",
    "Context: JavaScript function `calculateTotal(items)`.",
    "Cursor position: Inside function body.",
    "Inferred intent: Implement logic to sum up item prices.",
    "`items` is likely an array of objects.",
    "`Array.prototype.reduce` is idiomatic for summing.",
    "Drafting code: return items.reduce((acc, item) => acc + item.price, 0);",
    "</think>",
  ],
  cli: [
    "<think>",
    "Objective: Rename getCwd() -> getCurrentWorkingDirectory() across a real TypeScript repo, keep tests green.",
    "Plan:",
    "1. Restate requirements: rename API + preserve behavior.",
    "2. Search all call sites and exports.",
    "3. Update implementation and public surface (exports/types).",
    "4. Update imports/usages and any docs/examples.",
    "5. Run typecheck + unit tests, fix breakages.",
    "6. Provide diff summary and verification results.",
    'Command selection: `rg \"\\\\bgetCwd\\\\b\" -n` then `pnpm test`.',
    "</think>",
  ],
};

export function getReasoningStep(mode: Mode): Step | null {
  if (!appState.isThinkingEnabled) return null;
  return {
    title: "思维链推理 (CoT)",
    desc: "模型在生成最终答案前，先进行内部思考 (Reasoning Process)。",
    onEnter: async (id) => {
      hidePacket();
      highlight("serverCard");
      const thoughts = THINKING_SCRIPTS[mode] || THINKING_SCRIPTS.chat;
      for (const t of thoughts) {
        if (id !== appState.currentStepId) return;
        addToken(t, true);
        addLogEntry({
          type: "res",
          title: "SSE: Thinking Delta",
          content: `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  content: t,
                  reasoning_content: t,
                },
              },
            ],
          })}`,
        });
        await flyToken(t);
        if (id !== appState.currentStepId) return;
        appendClientThinking(t);
        await new Promise((r) => setTimeout(r, Math.max(200, t.length * 15)));
      }
    },
  };
}

type OpenAIStreamChunk = {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: unknown;
    };
    finish_reason?: string | null;
  }>;
};

async function startMockStream(mode: Mode, prompt: string): Promise<void> {
  if (appState.activeStream) return;

  const abort = new AbortController();
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: abort.signal,
    body: JSON.stringify({
      model: "mock-gpt-4",
      stream: true,
      x_mode: mode,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const traceId = res.headers.get("x-trace-id");
  appState.lastTraceId = traceId;
  const traceLabel = document.getElementById("traceIdLabel");
  if (traceLabel) traceLabel.textContent = traceId ? `Trace: ${traceId}` : "";

  const body = res.body;
  if (!body) throw new Error("Empty response body");
  appState.activeStream = {
    abort,
    reader: body.getReader(),
    decoder: new TextDecoder(),
    buffer: "",
  };
}

function stopActiveStream(): void {
  if (!appState.activeStream) return;
  appState.activeStream.abort.abort();
  appState.activeStream = null;
}

async function readNextTokenFromStream(stepId: number): Promise<{ raw: string; token: string | null; done: boolean }> {
  const stream = appState.activeStream;
  if (!stream) return { raw: "", token: null, done: true };

  const bufferRef = { buffer: stream.buffer };
  try {
    for await (const ev of parseSSEStream(stream.reader, stream.decoder, bufferRef)) {
      if (stepId !== appState.currentStepId) {
        stopActiveStream();
        return { raw: "", token: null, done: true };
      }

      if (ev.type === "done") {
        stream.buffer = bufferRef.buffer;
        appState.activeStream = null;
        return { raw: "data: [DONE]", token: null, done: true };
      }

      const raw = `data: ${ev.data}`;
      let token: string | null = null;
      try {
        const parsed = JSON.parse(ev.data) as OpenAIStreamChunk;
        token = parsed.choices?.[0]?.delta?.content ?? null;
      } catch {
        token = null;
      }

      stream.buffer = bufferRef.buffer;
      return { raw, token, done: false };
    }
  } finally {
    stream.buffer = bufferRef.buffer;
  }

  appState.activeStream = null;
  return { raw: "", token: null, done: true };
}

export const SCENARIOS: Record<Mode, Step[]> = {
  chat: [
    {
      title: "用户输入",
      desc: "用户在客户端输入消息，准备发送。",
      onEnter: () => {
        stopActiveStream();
        setClientTheme("phone");
        clearUI();
        addBubble("user", "什么是 HTTP 协议？");
        highlight("clientCard");
      },
    },
    {
      title: "构建请求 (Serialization)",
      desc: "客户端将消息序列化为 JSON，并添加 Authorization 等头部。",
      onEnter: () => {
        highlight("clientCard");
        showPacket(
          {
            type: "req",
            title: "POST /api/chat/stream",
            content: {
              model: "mock-gpt-4",
              messages: [{ role: "user", content: "什么是 HTTP 协议？" }],
              stream: true,
              x_mode: "chat",
            },
          },
          "center",
        );
      },
    },
    {
      title: "发送网络请求",
      desc: "HTTP POST 请求通过网络发送到 LLM 服务端。",
      onEnter: () => {
        highlight("network-stage");
        movePacket("center", "right");
      },
    },
    {
      title: "服务端接收 & Context 构建",
      desc: "服务端收到请求，将 JSON 解析并填入模型的 Context Window。",
      onEnter: () => {
        hidePacket();
        highlight("serverCard");
        setContext(`[System] You are a helpful assistant.\\n[User] 什么是 HTTP 协议？`);
      },
    },
    {
      title: "首字节响应 (TTFB)",
      desc: "模型生成第一个 Token，立即通过 SSE (Server-Sent Events) 发回。",
      onEnter: async (stepId) => {
        highlight("serverCard");
        await startMockStream("chat", "什么是 HTTP 协议？");
        if (stepId !== appState.currentStepId) return;

        const { raw, token, done } = await readNextTokenFromStream(stepId);
        if (stepId !== appState.currentStepId) return;

        if (!done && token) {
          addToken(token);
          showPacket({ type: "res", title: "200 OK (Stream)", content: raw }, "right");
          addLogEntry({ type: "res", title: "SSE: Chunk", content: raw });
          await flyToken(token);
          if (stepId !== appState.currentStepId) return;
          appendBubble("ai", token);
        }
      },
    },
    {
      title: "流式传输 (Streaming)",
      desc: "后续 Token 像子弹一样源源不断地飞向客户端。",
      onEnter: async (stepId) => {
        hidePacket();
        highlight("network-stage");

        if (!appState.activeStream) {
          await startMockStream("chat", "什么是 HTTP 协议？");
        }

        while (true) {
          if (stepId !== appState.currentStepId) return;
          const { raw, token, done } = await readNextTokenFromStream(stepId);
          if (stepId !== appState.currentStepId) return;

          if (done) {
            showPacket({ type: "res", title: "Stream End", content: raw }, "left");
            return;
          }

          if (token) {
            addToken(token);
            addLogEntry({ type: "res", title: "SSE: Chunk", content: raw });
            await flyToken(token);
            if (stepId !== appState.currentStepId) return;
            appendBubble("ai", token);
          }
        }
      },
    },
    {
      title: "客户端渲染",
      desc: "客户端接收 SSE 事件，解析 delta 内容并实时拼接在界面上。",
      onEnter: () => {
        highlight("clientCard");
        updateLastBubble("HTTP是互联网基础协议");
      },
    },
  ],
  agent: [
    {
      title: "用户提问 (需要工具)",
      desc: "用户询问天气，这需要模型调用外部能力。",
      onEnter: () => {
        stopActiveStream();
        setClientTheme("phone");
        clearUI();
        addBubble("user", "查询北京的天气");
        highlight("clientCard");
      },
    },
    {
      title: "请求发送 (带 Tools 定义)",
      desc: "客户端在请求中告知模型有哪些工具可用 (Tools Schema)。",
      onEnter: () => {
        showPacket(
          {
            type: "req",
            title: "POST (with Tools)",
            content: {
              messages: [{ role: "user", content: "..." }],
              tools: [{ name: "get_weather", params: "..." }],
            },
          },
          "center",
        );
        movePacket("center", "right");
      },
    },
    {
      title: "模型推理 & 决策",
      desc: "模型分析语义，发现需要调用 'get_weather' 工具。",
      onEnter: () => {
        hidePacket();
        highlight("serverCard");
        setContext(`[User] 查询北京的天气\\n[Tools] get_weather...`);
        addToken("Call: get_weather");
      },
    },
    {
      title: "下发工具指令 (Tool Call)",
      desc: "服务端不返回文本，而是返回 Tool Call 指令 (函数名+参数)。",
      onEnter: () => {
        showPacket(
          {
            type: "res",
            title: "Stop Reason: tool_calls",
            content: {
              tool_calls: [{ name: "get_weather", args: "{loc:'Beijing'}" }],
            },
          },
          "right",
        );
        movePacket("right", "left");
      },
    },
    {
      title: "客户端执行工具",
      desc: "客户端暂停生成，在本地运行函数 (或请求第三方 API)。",
      onEnter: async (stepId) => {
        hidePacket();
        highlight("clientCard");
        addBubble("tool", "⚙️ Executing: get_weather('Beijing')...");
        await new Promise((r) => setTimeout(r, 800));
        if (stepId !== appState.currentStepId) return;
        updateLastBubble("✅ Result: 22°C, Sunny", "tool");
      },
    },
    {
      title: "回填结果 (Round 2)",
      desc: "客户端将工具结果封装为 'tool' 角色消息，再次发给模型。",
      onEnter: () => {
        showPacket(
          {
            type: "req",
            title: "POST (Tool Result)",
            content: {
              role: "tool",
              tool_call_id: "call_123",
              content: "22°C, Sunny",
            },
          },
          "left",
        );
        movePacket("left", "right");
      },
    },
    {
      title: "模型生成最终回答",
      desc: "模型结合工具结果，生成自然语言回答。",
      onEnter: () => {
        hidePacket();
        highlight("serverCard");
        setContext("...[Tool] 22°C, Sunny");
        addToken("北京");
        addToken("今天");
        addToken("晴天");
      },
    },
    {
      title: "流式输出",
      desc: "最终答案流式传回客户端。",
      onEnter: async (stepId) => {
        const tokens = ["北京", "今天", "22度", "晴"];
        for (const t of tokens) {
          if (stepId !== appState.currentStepId) return;
          await flyToken(t);
          if (stepId !== appState.currentStepId) return;
          appendBubble("ai", t);
        }
      },
    },
  ],
  ide: [
    {
      title: "用户编码上下文 (Vibe Coding)",
      desc: "开发者在 IDE 中打开了多个文件，光标停留在函数位置。",
      onEnter: () => {
        stopActiveStream();
        setClientTheme("ide");
        clearUI();
        setIdeContent(`function calculateTotal(items) {\\n  // `);
        highlight("clientCard");
      },
    },
    {
      title: "上下文收集 (Context Gathering)",
      desc: "IDE 插件自动收集当前文件、打开的 Tab、甚至相关联的类型定义。",
      onEnter: () => {
        highlight("clientCard");
        showPacket(
          {
            type: "req",
            title: "Prompt Assembly",
            content: {
              system: "You are a coding expert...",
              files: [
                { name: "utils.js", content: "..." },
                { name: "types.d.ts", content: "..." },
              ],
              cursor: { line: 2, col: 5 },
            },
          },
          "center",
        );
      },
    },
    {
      title: "发送补全请求 (FIM)",
      desc: "将 Fill-In-the-Middle (FIM) 格式的 Prompt 发送给 LLM。",
      onEnter: () => {
        movePacket("center", "right");
        highlight("network-stage");
      },
    },
    {
      title: "代码生成 (Code Gen)",
      desc: "模型根据上下文理解意图，生成补全代码。",
      onEnter: () => {
        hidePacket();
        highlight("serverCard");
        setContext(`[PRE] function calculateTotal(items) {\\n[SUF] }`);
        addToken("return");
        addToken("items.reduce");
      },
    },
    {
      title: "流式补全 (Ghost Text)",
      desc: "代码建议以 Ghost Text (灰色斜体) 形式实时出现在编辑器中。",
      onEnter: async (stepId) => {
        const code = ["return ", "items", ".reduce", "((acc, ", "item) ", "=> ", "acc ", "+ ", "item.price, ", "0);"];
        for (const c of code) {
          if (stepId !== appState.currentStepId) return;
          await flyToken(c);
          if (stepId !== appState.currentStepId) return;
          appendIdeGhost(c);
        }
      },
    },
    {
      title: "用户采纳 (Tab)",
      desc: "用户按下 Tab 键，Ghost Text 变为真实代码。",
      onEnter: () => {
        highlight("clientCard");
        acceptIdeGhost();
      },
    },
  ],
  cli: [
    {
      title: "用户指令 (Natural Language)",
      desc: "用户在终端输入自然语言指令，希望完成复杂任务。",
      onEnter: () => {
        stopActiveStream();
        setClientTheme("terminal");
        clearUI();
        addTermLine("user", "把项目里所有 getCwd 重命名为 getCurrentWorkingDirectory，并确保测试通过");
        highlight("clientCard");
      },
    },
    {
      title: "发送请求 (Agent Loop Start)",
      desc: "客户端把需求发给模型，请求它决定下一步行动。",
      onEnter: async (stepId) => {
        showPacket(
          {
            type: "req",
            title: "POST /v1/responses (Agent)",
            content: { role: "user", content: "rename getCwd -> getCurrentWorkingDirectory, keep tests passing" },
          },
          "left",
        );
        highlight("network-stage");
        movePacket("left", "right");
        await new Promise((r) => setTimeout(r, 650));
        if (stepId !== appState.currentStepId) return;
        hidePacket();
        highlight("serverCard");
        setContext(`[User] 把项目里所有 getCwd 重命名为 getCurrentWorkingDirectory，并确保测试通过`);
      },
    },
    {
      title: "模型下发工具调用 (Search)",
      desc: "模型先全局搜索，定位所有定义/导出/调用点，然后再安全重命名。",
      onEnter: async (stepId) => {
        highlight("serverCard");
        addToken("Thought: Find all occurrences first, then update exports and call sites.");
        showPacket(
          {
            type: "res",
            title: "Stop Reason: tool_calls",
            content: { tool_calls: [{ tool: "run_command", args: "rg \"\\\\bgetCwd\\\\b\" -n" }] },
          },
          "right",
        );
        movePacket("right", "left");
        await new Promise((r) => setTimeout(r, 650));
        if (stepId !== appState.currentStepId) return;
        hidePacket();
        highlight("clientCard");
      },
    },
    {
      title: "执行工具 & 回传观察 (Observation)",
      desc: "客户端执行命令并把结果作为 Observation 回传给模型。",
      onEnter: async (stepId) => {
        addTermLine("agent", '$ rg \"\\\\bgetCwd\\\\b\" -n');
        await new Promise((r) => setTimeout(r, 250));
        if (stepId !== appState.currentStepId) return;
        addTermLine(
          "system",
          [
            "packages/shared/src/path/getCwd.ts:1:export function getCwd() {",
            "packages/shared/src/index.ts:12:export { getCwd } from './path/getCwd';",
            "packages/cli/src/commands/info.ts:44:const cwd = getCwd();",
            "packages/web/src/app/bootstrap.ts:9:import { getCwd } from '@acme/shared';",
            "packages/web/src/app/bootstrap.ts:31:const base = getCwd();",
            "packages/shared/__tests__/path.test.ts:18:expect(getCwd()).toBe(process.cwd());",
          ].join("\\n"),
        );
        await new Promise((r) => setTimeout(r, 450));
        if (stepId !== appState.currentStepId) return;
        showPacket({ type: "req", title: "Observation", content: { role: "tool", content: "Found 6 matches across 5 files" } }, "left");
        movePacket("left", "right");
        await new Promise((r) => setTimeout(r, 650));
        if (stepId !== appState.currentStepId) return;
        hidePacket();
      },
    },
  ],
};
