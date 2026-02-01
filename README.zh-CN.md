[![English](https://img.shields.io/badge/lang-English-blue)](README.md)
[![中文](https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87-red)](README.zh-CN.md)

# 协议显微镜（Protocol Microscope）

这是一个用来“主动学习”LLM Chat 应用工作过程的小型 Next.js Playground：重点观察流式行为（TTFB 与逐 token 输出）、类 Agent 的多步流程、额度限制，以及轻量级的 traces/metrics。

## 项目演进 / 打磨思路

这个仓库刻意保留了从探索到收敛的路径：

1. 起点是一个网页动画式的“显微镜”UI，用来可视化 LLM chatbot 的响应过程：首 token 到达需要多久、后续 token 如何持续输出、UI 如何渲染。
2. 随着理解加深，增加了多种场景，包括 coding-agent 风格的流程（观察 tool calls / 多步编排对协议与 UX 的影响）。
3. 增加 thinking / non-thinking 切换，用于对比不同策略在体验、成本与协议形态上的差异。
4. 随后把注意力扩展到后端工程要素：SSE 长连接、鉴权、限额、可观测性都变成了“真实需求”。
5. 最终收敛到一套成熟的 T3 Stack（Next.js + NextAuth + Prisma + env 校验），将学习产物固化成可部署、可维护的工程形态。

## 功能特性

- 流式 SSE 接口：`/api/chat/stream`
  - 默认 mock 流式（无需登录）
  - 配置 `OPENAI_API_KEY` 且登录后：转发真实 OpenAI 流式
- GitHub 登录（NextAuth）
- 真实请求额度：登录用户每小时 5 次（超额返回 429）
- 轻量可观测性：
  - Metrics：`/api/metrics`
  - Traces：`/api/debug/traces`（支持按 trace_id 查询）
- 自带 Prisma migrations（`prisma/migrations`）

## 架构概览

- 显微镜 UI → 调用 `/api/chat/stream` → 渲染流式输出
- 服务端根据条件选择：mock / real
- 额度只对真实分支生效
- 每个请求会产生基础指标与可查询 trace

## 本地启动

1. 安装依赖

   ```bash
   npm install
   ```

2. 启动本地 Postgres

   ```bash
   ./start-database.sh
   ```

3. 配置环境变量

   复制 `.env.example` → `.env`，按需填写。

4. 应用 Prisma 迁移

   ```bash
   npm run db:migrate
   ```

5. 启动开发服务

   ```bash
   npm run dev
   ```

打开 http://localhost:3000

## 环境变量

完整列表见 `.env.example`。

生产环境必需：

- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `DATABASE_URL`

可选：

- `OPENAI_API_KEY`（登录后启用真实流式）
- `OPENAI_BASE_URL`（OpenAI 兼容网关）

## 部署

- 公网部署指南：[DEPLOY_PUBLIC.md](docs/DEPLOY_PUBLIC.md)
- 模型行为边界：[VIBE_BOUNDARIES.md](docs/VIBE_BOUNDARIES.md)

## 开发命令

```bash
npm run test
npm run typecheck
npm run build
```
