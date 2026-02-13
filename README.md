# Protocol Observatory

[![English](https://img.shields.io/badge/lang-English-blue)](README.md)
[![中文](https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87-red)](README.zh-CN.md)
[![CI](https://github.com/FrankieLiu04/how-agent-work/actions/workflows/ci.yml/badge.svg)](https://github.com/FrankieLiu04/how-agent-work/actions/workflows/ci.yml)

**Protocol Observatory** is an interactive playground designed to dissect and visualize the end-to-end lifecycle of LLM chat applications. It serves as a "microscope" for understanding streaming protocols, agentic workflows, rate limiting, and observability.

This project evolved from a simple visualization tool into a production-ready reference architecture, demonstrating how to build robust AI applications using modern web standards.

## 🛠 Tech Stack

Built on the **T3 Stack**, leveraging modern web standards for performance, type safety, and scalability.

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (via [Prisma ORM](https://www.prisma.io/))
- **Auth**: [NextAuth.js](https://next-auth.js.org/) (v5 Beta)
- **API**: Server-Sent Events (SSE) & [tRPC](https://trpc.io/)
- **Testing**: Vitest

## ✨ Features

### 🔬 The Microscope
A specialized UI component that visualizes the hidden details of LLM interactions:
- **Streaming Mechanics**: Real-time visualization of Time-to-First-Byte (TTFB) and token generation rates.
- **Agent Workflows**: Support for multi-step "Thinking" processes vs. direct "Non-Thinking" responses.
- **Protocol Analysis**: Inspect how tool calls and orchestration affect the user experience.

### 🛡️ Backend & Infrastructure
- **Hybrid Streaming Engine**:
  - **Mock Mode**: Zero-latency simulation for UI testing (default).
  - **Live Mode**: Real-time OpenAI-compatible API proxy (requires Authentication).
- **Robust Rate Limiting**: Token bucket algorithm implementing strict quotas (default: 60 requests/hour/user) to prevent abuse.
- **Observability**:
  - **Metrics**: Real-time request counters and latency histograms exposed at `/api/metrics`.
  - **Tracing**: Detailed request-level tracing for debugging complex agent flows at `/api/debug/traces`.

## 📐 Architecture

The application follows a clean, unidirectional data flow:

1.  **Client**: The `Microscope` component initiates a persistent **SSE (Server-Sent Events)** connection to `/api/chat/stream`.
2.  **Gateway**: The Next.js API route authenticates the request via NextAuth and checks rate limits against the PostgreSQL database.
3.  **Engine**:
    *   If **Mock**: Generates synthetic tokens based on predefined scenarios.
    *   If **Live**: Proxies the request to an OpenAI-compatible provider (default base URL points to DeepSeek), handling stream transformation and backpressure.
4.  **Observability**: Side-effects record metrics and traces to an in-memory store and expose them via `/api/metrics` and `/api/debug/traces`.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker (optional, for local Database)

### Installation

1. **Clone and Install**
   ```bash
   git clone https://github.com/FrankieLiu04/how-agent-work.git
   cd how-agent-work
   npm install
   ```

2. **Initialize Database**
   Start a local PostgreSQL instance (or provide your own `DATABASE_URL`):
   ```bash
   ./start-database.sh
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and fill in the required values (see [Configuration](#configuration)).*

4. **Run Migrations**
   ```bash
   npm run db:migrate
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000` to explore.

## ⚙️ Configuration

See `.env.example` for the full list of variables.

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AUTH_SECRET` | NextAuth secret key (generate with `openssl rand -base64 32`) | Yes |
| `AUTH_GITHUB_ID` | GitHub OAuth Client ID | Yes |
| `AUTH_GITHUB_SECRET` | GitHub OAuth Client Secret | Yes |
| `AUTH_URL` | NextAuth base URL (recommended for Vercel/custom domains) | No |
| `AUTH_TRUST_HOST` | Trust proxy headers (recommended on Vercel) | No |
| `OPENAI_API_KEY` | API key for live mode (OpenAI-compatible) | No |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible base URL | No |
| `TAVILY_API_KEY` | Enables web search tool (agent) | No |

## 📚 Documentation

- **Project Overview**: [PROJECT.md](PROJECT.md)
- **Ops / Pitfalls Notes**: [AGENT.md](AGENT.md)
- **Environment Variables**: [.env.example](.env.example)

## 🛠 Development Commands

```bash
npm run test        # Run unit tests
npm run typecheck   # Run TypeScript type checking
npm run build       # Build for production
```
