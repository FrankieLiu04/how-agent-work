# 项目进度

## 当前状态（每次对话先更新这里）

- 当前里程碑：
- 当前分支能力：
- 已知阻塞：

## 已完成

- [x] 初始化 T3 工程
- [x] 建立部署/进度/边界三份文档模板
- [x] 迁移显微镜 UI（Next.js）并跑通 mock 流式链路
- [x] 接入 GitHub 登录入口（NextAuth）
- [x] Prisma schema 扩展（额度表）与初始迁移生成
- [x] /api/chat/stream：额度限制与 429
- [x] /api/chat/stream：真实 LLM 分支与流式转发
- [x] /api/metrics 与 /api/debug/traces（基础联动）
- [x] 删除 Go 与旧前端/旧后端代码

## 进行中

- [ ] 公网部署验证（Vercel + Postgres + GitHub OAuth + OpenAI）

## 待办（按优先级）

- [ ] 按部署文档完成公网验证

## 验收清单

- [ ] 未登录：mock 流式体验可用
- [ ] 已登录：真实 LLM 每小时 5 次，超额 429
- [ ] 密钥不出浏览器
- [ ] 部署文档可复现

## 关键决策记录

- 采用 T3 Stack（Next.js + tRPC + Prisma + NextAuth + Tailwind）
- 额度统计使用“小时桶”方案（强一致扣减）
