# Protocol Microscope

[![English](https://img.shields.io/badge/lang-English-blue)](README.md)
[![中文](https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87-red)](README.zh-CN.md)

Protocol Microscope is a small Next.js playground for actively learning how LLM chat apps work end-to-end: streaming behavior (TTFB vs token-by-token), agent-like multi-step flows, quotas, and lightweight traces/metrics.

## Project Journey / Evolution

This repo is intentionally a “learning log” turned into a deployable project:

1. It started as a web animation to visualize what’s happening inside an LLM chatbot UI (how the response appears, how fast the first token arrives, and how the stream continues).
2. Then it grew into multiple scenarios, including a coding-agent-style flow (to see how tool calls / multi-step orchestration affects the protocol and UX).
3. A thinking vs non-thinking toggle was added as a practical way to compare UX tradeoffs and protocol patterns.
4. Backend exploration followed: long-lived SSE, auth, rate limits, and observability became “real requirements”.
5. Finally, it converged into a T3 Stack app (Next.js + NextAuth + Prisma + env validation) to make the learning artifact production-shaped and easy to deploy.

## Features

- Streaming SSE endpoint: `/api/chat/stream` (mock by default, real OpenAI passthrough when configured)
- GitHub authentication via NextAuth
- Hourly quota for real calls: 5 requests / user / hour (429 on exceed)
- Lightweight observability:
  - Metrics: `/api/metrics`
  - Traces: `/api/debug/traces` (and trace_id lookup)
- Prisma migrations included (`prisma/migrations`)

## Architecture (High-Level)

- UI (Microscope) → fetches `/api/chat/stream` → renders the stream
- Server route decides:
  - mock stream (always available)
  - real OpenAI stream (requires GitHub login + `OPENAI_API_KEY`)
- Quota is enforced only for real calls
- Each request emits basic counters, percentiles, and a trace you can inspect

## Quickstart

1. Install deps

   ```bash
   npm install
   ```

2. Start Postgres (local)

   ```bash
   ./start-database.sh
   ```

3. Configure env

   Copy `.env.example` → `.env` and fill values you need.

4. Apply Prisma migrations

   ```bash
   npm run db:migrate
   ```

5. Run dev server

   ```bash
   npm run dev
   ```

Open http://localhost:3000

## Environment Variables

See `.env.example` for the full list.

Required in production:

- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `DATABASE_URL`

Optional:

- `OPENAI_API_KEY` (enables real streaming after login)
- `OPENAI_BASE_URL` (for OpenAI-compatible gateways)

## Deployment

- Public deployment guide: [DEPLOY_PUBLIC.md](docs/DEPLOY_PUBLIC.md)
- Project boundaries: [VIBE_BOUNDARIES.md](docs/VIBE_BOUNDARIES.md)

## Development Commands

```bash
npm run test
npm run typecheck
npm run build
```
