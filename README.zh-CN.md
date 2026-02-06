# 协议观测台 (Protocol Observatory)

[![English](https://img.shields.io/badge/lang-English-blue)](README.md)
[![中文](https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87-red)](README.zh-CN.md)
[![CI](https://github.com/FrankieLiu04/how-agent-work/actions/workflows/ci.yml/badge.svg)](https://github.com/FrankieLiu04/how-agent-work/actions/workflows/ci.yml)

**协议观测台 (Protocol Observatory)** 是一个交互式的实验平台（Playground），旨在剖析和可视化 LLM 聊天应用的端到端生命周期。它就像一个“显微镜”，帮助开发者深入理解流式协议 (Streaming Protocols)、Agent 工作流、速率限制 (Rate Limiting) 以及可观测性 (Observability) 的内部机制。

本项目从最初的简单可视化工具演变而来，现已成为一个具备生产级特性的参考架构，展示了如何使用现代 Web 标准构建健壮的 AI 应用。

## 🛠 技术栈 (Tech Stack)

基于 **T3 Stack** 构建，利用现代 Web 标准确保高性能、类型安全和可扩展性。

- **框架**: [Next.js 15](https://nextjs.org/) (App Router)
- **语言**: TypeScript
- **样式**: [Tailwind CSS](https://tailwindcss.com/)
- **数据库**: [PostgreSQL](https://www.postgresql.org/) (via [Prisma ORM](https://www.prisma.io/))
- **认证**: [NextAuth.js](https://next-auth.js.org/) (v5 Beta)
- **API**: Server-Sent Events (SSE) & [tRPC](https://trpc.io/)
- **测试**: Vitest

## ✨ 核心特性

### 🔬 显微镜 (The Microscope)
一个专门的 UI 组件，用于可视化 LLM 交互中隐藏的细节：
- **流式机制**: 实时可视化首字节时间 (TTFB) 和 Token 生成速率。
- **Agent 工作流**: 支持多步“思考 (Thinking)”过程与直接“非思考 (Non-Thinking)”响应的对比。
- **协议分析**: 观察工具调用 (Tool Calls) 和编排逻辑如何影响用户体验。

### 🛡️ 后端与基础设施
- **混合流式引擎**:
  - **Mock 模式**: 零延迟模拟，用于 UI 测试和演示（默认开启）。
  - **Live 模式**: 实时透传 OpenAI API 响应（需要登录）。
- **健壮的速率限制**: 基于令牌桶算法实现严格的配额管理（例如：每用户每小时 5 次请求），防止滥用。
- **可观测性**:
  - **Metrics**: 实时请求计数器和延迟直方图，暴露于 `/api/metrics`。
  - **Tracing**: 详细的请求级链路追踪，用于调试复杂的 Agent 流程，暴露于 `/api/debug/traces`。

## 📐 架构设计

应用遵循清晰的单向数据流：

1.  **客户端 (Client)**: `Microscope` 组件向 `/api/chat/stream` 发起持久化的 **SSE (Server-Sent Events)** 连接。
2.  **网关 (Gateway)**: Next.js API 路由通过 NextAuth 验证请求，并检查 PostgreSQL 中的速率限制。
3.  **引擎 (Engine)**:
    *   **Mock**: 基于预定义场景生成合成 Token。
    *   **Live**: 代理请求至 OpenAI，处理流式转换和背压 (Backpressure)。
4.  **可观测性 (Observability)**: 异步记录指标和追踪数据到数据库，确保对用户请求延迟的最小化影响。

## 🚀 快速开始

### 前置要求
- Node.js 18+
- Docker (可选，用于本地数据库)

### 安装步骤

1. **克隆并安装**
   ```bash
   git clone https://github.com/FrankieLiu04/how-agent-work.git
   cd how-agent-work
   npm install
   ```

2. **初始化数据库**
   启动本地 PostgreSQL 实例（或提供你自己的 `DATABASE_URL`）：
   ```bash
   ./start-database.sh
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   ```
   *编辑 `.env` 并填写必要的值（参见 [配置说明](#-配置说明)）。*

4. **运行迁移**
   ```bash
   npm run db:migrate
   ```

5. **启动开发服务器**
   ```bash
   npm run dev
   ```
   访问 `http://localhost:3000` 进行探索。

## ⚙️ 配置说明

完整变量列表请参考 `.env.example`。

| 变量名 | 描述 | 是否必须 |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | 是 |
| `AUTH_SECRET` | NextAuth 密钥 (可用 `openssl rand -base64 32` 生成) | 是 |
| `AUTH_GITHUB_ID` | GitHub OAuth Client ID | 是 |
| `AUTH_GITHUB_SECRET` | GitHub OAuth Client Secret | 是 |
| `OPENAI_API_KEY` | OpenAI API Key (用于 Live 模式) | 否 |
| `OPENAI_BASE_URL` | 自定义 OpenAI 兼容网关地址 | 否 |

## 📚 文档

- **部署指南**: [DEPLOY_PUBLIC.md](docs/DEPLOY_PUBLIC.md)
- **项目边界**: [VIBE_BOUNDARIES.md](docs/VIBE_BOUNDARIES.md)

## 🛠 开发命令

```bash
npm run test        # 运行单元测试
npm run typecheck   # 运行 TypeScript 类型检查
npm run build       # 构建生产版本
```
