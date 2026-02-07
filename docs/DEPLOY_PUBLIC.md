# 公网部署教程（T3 Stack）

## 目标

- 将本项目部署到公网上，支持 HTTPS、GitHub 登录、数据库、真实 LLM 调用与额度限制
- 确保密钥只存在于服务端环境变量，前端不可见

## 组件清单

- 应用：Next.js（T3 Stack）
- 鉴权：NextAuth + GitHub OAuth
- 数据库：Postgres（Neon 或 Supabase）
- 真实 LLM：OpenAI（或兼容网关）
- 额度策略：登录用户每小时最多 5 次真实请求（超额 429）

## 环境变量（示例）

以 `.env.example` 为准，部署平台上建议配置：

- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_URL`（建议，填 https://<你的公网域名>，避免 Host 推断导致 cookie/CSRF 异常）
- `AUTH_TRUST_HOST=true`（建议，部署在 Vercel/反代后时启用）
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`（可选）

## 部署到 Vercel（主推荐流程）

### 1. 创建 Postgres

二选一：

- Neon：创建数据库后拿到 `DATABASE_URL`
- Supabase：创建项目后拿到 `DATABASE_URL`

### 2. 配置 GitHub OAuth App

- Homepage URL：`https://<你的域名>`
- Authorization callback URL：`https://<你的域名>/api/auth/callback/github`
- 记录 `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`

### 3. 部署到 Vercel

- 导入 GitHub 仓库
- 在 Project Settings → Environment Variables 配置上述环境变量
- 触发一次部署

### 4. 初始化数据库（Prisma）

本项目包含 Prisma 迁移文件（`prisma/migrations`），部署时需要把迁移应用到线上 Postgres：

- 推荐做法：在 CI/发布流程中执行 `npm run db:migrate`（等价于 `prisma migrate deploy`）
- 也可以在本地配置同一个 `DATABASE_URL` 后执行 `npm run db:migrate` 完成初始化

### 5. 验证

- 访问首页：页面可加载
- 点击登录：能成功走 GitHub OAuth 并回到站点
- 登录后调用真实 LLM：消耗额度并能流式返回
- 超额后：返回 429，并提示恢复时间
- 打开 `/api/metrics` 与 `/api/debug/traces`：能看到请求计数与最近 trace

## 部署到 Fly.io / Render（备选流程）

当你需要更强的长连接控制、或不希望使用 Vercel Serverless 时，建议使用 Fly.io/Render 以“常驻 Node 进程”的方式部署。

要点：

- 同样配置环境变量
- 确保运行 `prisma migrate deploy`（或 `db:push`）在启动前完成
- 需要为 Postgres 配置公网访问与连接池策略

## 常见坑

- `AUTH_SECRET` 必须设置，否则生产环境 session 不稳定
- 真实 LLM Key 只能放在服务端环境变量中
- 数据库连接数：Serverless 平台建议使用支持 pooling 的连接串（按 Neon/Supabase 文档）
