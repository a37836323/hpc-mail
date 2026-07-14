# HPC Mail React 客户端

这是 HPC Mail 的 React 19 生产前端。Cloudflare Workers 部署流程会构建本目录，并将产物复制到 Worker 静态资源目录。

## 本地运行

```bash
pnpm install
pnpm dev
```

开发服务器默认监听 `http://127.0.0.1:3002`，并将 `/api` 代理到 `http://127.0.0.1:8787`。

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 基础能力

- `src/api/`：沿用 Worker `{ code, message, data }` 协议的类型化 Fetch 客户端。
- `src/lib/auth-token.ts`：认证令牌存储与多标签页同步。
- `src/lib/query-client.ts`：TanStack Query 全局缓存和重试策略。
- `src/stores/auth-store.ts`：Zustand 鉴权状态。
- `src/lib/email-html/`：邮件 HTML 白名单净化和 Shadow DOM 隔离组件。
- `src/components/ui/`：基于原生元素与 Radix UI 的基础组件，不绑定大型 UI 框架。
- `src/app/router.tsx`：React Router 静态路由、登录守卫和权限边界。

生产环境默认请求同源 `/api`。如需覆盖，可设置 `VITE_API_BASE_URL`。
