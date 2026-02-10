# PROJECT.md

## 项目概览
Protocol Observatory（协议观测台）是一个用于可视化 LLM 流式协议与 Agent 工作流的交互式 Playground。项目包含两种视图：
- **演示模式**：前端模拟/可视化 LLM 的请求、TTFB、Token 流与工具调用流程。
- **实时模式**：真实调用后端 `/api/chat/stream`，串联认证、限流、工具调用、观测指标与追踪。

技术栈：Next.js 15（App Router）+ TypeScript + Prisma + NextAuth + tRPC + SSE。

---

## 目录结构速览

```
src/
  app/
    layout.tsx              # 根布局，注入全局样式与 tRPC Provider
    page.tsx                # 首页，渲染 Microscope 并注入 auth 信息
    api/
      auth/[...nextauth]/   # NextAuth 路由
      chat/stream/          # SSE 流式聊天入口（Mock/Real）
      conversations/        # 会话列表 CRUD
      conversations/[id]/   # 会话详情/删除/更新
      conversations/[id]/messages/ # 消息读写 + 自动生成标题
      sandbox/              # 虚拟文件系统与 mock shell
      metrics/              # 观测指标导出
      debug/traces/         # Trace 查询
      quota/                # 配额查询
      trpc/                 # tRPC handler
  components/
    LiveChat.tsx            # 实时聊天容器（按模式切换布局）
    ChatInput.tsx           # 输入框
    ConversationList.tsx    # 会话列表
    FileTree.tsx            # 虚拟文件树
    TerminalView.tsx        # 终端视图
    ToolCallDisplay.tsx     # 工具调用 UI
    live-chat/
      ChatLayout.tsx        # Chat/Agent 布局
      IdeLayout.tsx         # IDE 布局
      CliLayout.tsx         # CLI 布局
      ChatPane.tsx          # 消息与输入 UI
      CliInput.tsx          # CLI 输入
      MessageBubble.tsx     # 消息渲染（支持工具/Working 状态）
  hooks/
    useChat.ts              # SSE 消息流解析 + 消息持久化
    useConversations.ts     # 会话 CRUD
    useSandbox.ts           # 虚拟文件系统 + mock shell
    useQuota.ts             # 配额查询
  lib/
    tools/                  # 工具定义、系统提示词、Tavily 搜索
    sandbox/                # Mock shell 与模板文件
  microscope/               # 演示模式可视化引擎
  server/
    auth/                   # NextAuth 配置
    db.ts                   # Prisma client
    observability.ts        # 计数器/延迟统计/Trace
    quota.ts                # 令牌桶配额逻辑
    api/                    # tRPC router
prisma/
  schema.prisma             # 数据模型
```

---

## 核心功能与代码对应关系

### 1) 首页入口与模式切换
- `src/app/page.tsx`：读取 `auth()`，把用户信息传入 `Microscope`。
- `src/microscope/Microscope.tsx`：
  - 顶部模式切换（chat/agent/ide/cli）
  - **演示模式**：驱动 `microscope/engine.ts` 里的步骤引擎
  - **实时模式**：渲染 `LiveChat` 并接入实时 SSE 事件

### 2) 演示模式（Microscope Engine）
- `src/microscope/engine.ts`：
  - `setMode` 根据 `scenarios.ts` 生成步骤序列
  - `nextStep/prevStep` 驱动演示流程
- `src/microscope/scenarios.ts`：
  - 定义四种模式的可视化脚本（HTTP 请求、TTFB、工具调用、IDE Ghost Text、CLI Agent Loop）
- `src/microscope/ui.ts`、`packet.ts`、`log.ts`：
  - UI 高亮、Token 飞行动画、Packet 动画、Traffic Log
- `src/microscope/sse.ts`：
  - SSE 解析工具

**关系**：`Microscope` → `engine` → `scenarios` → `ui/packet/log` → DOM 渲染。

### 3) 实时聊天（前端）
- `src/components/LiveChat.tsx`：根据模式渲染不同布局：
  - chat/agent → `ChatLayout`
  - ide → `IdeLayout`
  - cli → `CliLayout`
- `src/hooks/useChat.ts`：
  - 组装请求 payload（含 `x_mode` 与历史 messages）
  - SSE 解析（`parseSSE`）
  - 处理 tool_calls / working 状态 / [DONE]
  - 将消息持久化到 `/api/conversations/[id]/messages`
- `src/hooks/useConversations.ts`：会话列表加载、创建、删除、更新标题
- `src/hooks/useSandbox.ts`：IDE/CLI 的虚拟文件系统与 mock shell

**关系**：`LiveChat` → `useChat` → `/api/chat/stream`，并与 `useConversations` / `useSandbox` 协同。

### 4) SSE 流式聊天后端（Mock/Real）
- `src/app/api/chat/stream/route.ts`：核心 SSE 流式接口
  - **Mock 模式**：模拟 TTFB 与 token 流（演示、无需外部 API）
  - **Real 模式**：通过 DeepSeek（OpenAI 兼容）代理
  - **Agent 模式**：处理工具调用回合（工具调用上限、Working 状态事件）
  - 接入限流、Trace、Metrics
- 工具相关：
  - `src/lib/tools/definitions.ts`：不同模式的工具定义
  - `src/lib/tools/prompts.ts`：系统提示词与标题生成 prompt
  - `src/lib/tools/tavily.ts`：Tavily 搜索执行器

**关系**：SSE handler → `observability` 记录指标/trace →（可选）工具执行。

### 5) 会话与消息持久化
- `src/app/api/conversations/route.ts`：会话列表 & 创建（带限额）
- `src/app/api/conversations/[id]/route.ts`：会话详情/删除/改名
- `src/app/api/conversations/[id]/messages/route.ts`：消息读写 + 自动生成标题

**关系**：`useConversations/useChat` ↔ conversation APIs ↔ Prisma `Conversation/ConversationMessage`。

### 6) IDE / CLI 沙盒
- `src/app/api/sandbox/files/route.ts`：虚拟文件 CRUD + 配额限制
- `src/app/api/sandbox/init/route.ts`：初始化模板
- `src/app/api/sandbox/exec/route.ts`：mock shell 执行命令
- `src/lib/sandbox/mockShell.ts`：模拟 `ls/cd/cat/grep/...`
- `src/lib/sandbox/templates.ts`：默认模板

**关系**：`useSandbox` ↔ sandbox APIs ↔ Prisma `VirtualFile`。

### 7) 认证、配额与可观测性
- `src/server/auth/*`：NextAuth（GitHub OAuth）
- `src/server/quota.ts` & `src/app/api/quota/route.ts`：令牌桶限额（默认 60/h）
- `src/server/observability.ts` & `src/app/api/metrics` / `debug/traces`：指标与 trace

---

## 数据模型（Prisma）
- `User` / `Session` / `Account` / `VerificationToken`
- `Conversation` + `ConversationMessage`
- `VirtualFile`（IDE/CLI 沙盒）
- `QuotaHourly`（配额）
- `UsageEvent`（使用记录）

见 `prisma/schema.prisma`。

---

## 关键流程（端到端）

### A. 演示模式（Mock）
1. `Microscope` 驱动 `engine` 与 `scenarios`。
2. 前端调用 `/api/chat/stream`（mock 分支）模拟 SSE。
3. `ui/packet/log` 展示请求与响应过程。

### B. 实时模式（Chat/Agent）
1. `useChat` 发送请求到 `/api/chat/stream`。
2. SSE Stream 返回 token/工具调用/working 状态。
3. `useChat` 将消息写入 `/api/conversations/[id]/messages`。
4. `observability` 记录 trace + metrics，`quota` 控制频率。

### C. IDE/CLI 模式（沙盒）
1. `useSandbox` 初始化虚拟文件系统。
2. IDE: `FileTree` + `ChatPane` 结合工具调用。
3. CLI: `MockShell` 执行命令并同步回 DB。

---

## 主要 API 路由一览

| Route | 功能 |
|------|------|
| `POST /api/chat/stream` | SSE 流式聊天（Mock/Real） |
| `GET /api/conversations` | 会话列表 |
| `POST /api/conversations` | 新建会话 |
| `GET /api/conversations/[id]` | 会话详情 |
| `DELETE /api/conversations/[id]` | 删除会话 |
| `PATCH /api/conversations/[id]` | 更新标题 |
| `GET/POST /api/conversations/[id]/messages` | 消息读写 |
| `GET/POST/DELETE /api/sandbox/files` | 虚拟文件 CRUD |
| `GET/POST /api/sandbox/init` | 沙盒初始化 |
| `POST /api/sandbox/exec` | 模拟命令行 |
| `GET /api/quota` | 配额信息 |
| `GET /api/metrics` | 指标 |
| `GET /api/debug/traces` | Trace |

---

## 环境变量要点
见 `src/env.js` 与 `.env.example`：
- 必需：`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` （Vercel部署环境已有）
- 可选：`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TAVILY_API_KEY` （Vercel部署环境已有）

---

## 扩展与维护建议
- 新增工具：在 `lib/tools/definitions.ts` 增加定义，并在 `api/chat/stream` 里实现执行器。
- 新增模式：扩展 `microscope/scenarios.ts` + `Microscope` UI + `useChat` mode 支持。
- 想强化可观测性：在 `observability.ts` 增加指标，前端可从 `/api/metrics` 拉取。
