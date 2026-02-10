# AGENT Notes

This document highlights project-specific settings and memory points for the next LLM or developer.

## Project-specific setup

- Production deploys on Vercel with manual `vercel deploy --prod` used during recent fixes.
- Build script runs database migrations automatically: `prisma migrate deploy && next build` in [package.json](package.json).
- Database is NeoDB (PostgreSQL). Schema includes `Conversation`, `ConversationMessage`, and `VirtualFile`.

## Conversation and mode behavior

- Conversation modes include `CHAT`, `AGENT`, `IDE`, `CLI` in [prisma/schema.prisma](prisma/schema.prisma).
- `/api/conversations` filters by `mode` query parameter and supports all modes.
- Chat history is persisted per conversation via `/api/conversations/[id]/messages` and loaded on mode/conversation change.
- `LiveChat` remembers last selected conversation per mode and auto-selects when switching modes.

## UI behavior

- Live mode chat panes use a pinned input and a scrollable message list to avoid layout breakage.
- Agent/Chat panels share the same layout logic; IDE/CLI have sidebars with conversation lists.

## Deployment checks

- Verify Vercel deployment includes latest Git commit via `vercel list -F json` and check `githubCommitSha`.
- If auto-deploy does not trigger, manual deploy is acceptable and already used.

## Migration caveats

- If Prisma reports drift on production DB, the fastest path used was a full reset (`prisma migrate reset`).
- For data-preserving flows, the recommended approach is `prisma migrate resolve --applied 20260201000000_init` then create a new migration.

## Environment variables

- Required in Vercel: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`.
- Optional: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `AUTH_URL`, `AUTH_TRUST_HOST`.
