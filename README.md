<p align="center">
  <img src="doc/demo/logo.png" width="88" alt="HPC Mail 标志">
</p>

<h1 align="center">HPC Mail</h1>

<p align="center">
  基于 Cloudflare Workers 构建的现代化多域名邮件系统
</p>

<p align="center">
  <a href="https://github.com/riba2534/hpc-mail/actions/workflows/deploy-cloudflare.yml"><img src="https://github.com/riba2534/hpc-mail/actions/workflows/deploy-cloudflare.yml/badge.svg" alt="部署状态"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/许可证-MIT-22c55e.svg" alt="MIT 许可证"></a>
  <a href="https://hpc.email"><img src="https://img.shields.io/badge/在线服务-hpc.email-6366f1.svg" alt="在线服务"></a>
</p>

HPC Mail 将 Cloudflare Email Routing、Workers、D1、KV 与 R2 组合成一套可自行部署的邮件服务。系统支持多域名统一收件、独立用户名与密码认证，并允许用户使用“任意合法前缀 + 已配置域名”作为发件地址。

> 在线地址：[https://hpc.email](https://hpc.email)

## 核心特性

- **多域名收件**：通过 Cloudflare Email Routing Catch-all 接收多个域名的邮件；未预建地址的来信自动归入系统管理员的“全部邮箱”收件箱。
- **独立账号体系**：使用用户名和密码登录，登录身份不再与单一邮箱地址绑定；一个用户可以管理多个邮箱账号。
- **灵活发件地址**：发送邮件时可自由填写合法前缀，并从管理员配置且用户有权使用的域名中选择后缀。
- **完整邮件体验**：支持收发邮件、附件、内嵌图片、草稿、已发送状态和响应式阅读界面。
- **自动转发与通知**：可按配置将来信转发至外部邮箱或 Telegram。
- **服务端无状态部署**：业务运行在 Cloudflare Workers，数据分别存储于 D1、KV 与 R2，无需维护传统邮件服务器。
- **管理与权限控制**：提供用户、邮箱、域名、配额、注册方式和系统参数管理。
- **安全默认值**：密码使用 PBKDF2-SHA256，登录与令牌接口具备限流，会话支持过期与撤销，邮件 HTML 在前后端均进行净化处理。
- **自动化交付**：推送到 `main` 后，由 GitHub Actions 自动完成测试、依赖审计、构建、部署、版本化 Schema 初始化和线上登录检查。

## 系统架构

```mermaid
flowchart LR
    Sender["外部发件人"] --> Routing["Cloudflare Email Routing"]
    Routing --> Worker["HPC Mail Worker"]
    Browser["Web / PWA"] <--> Worker
    Worker <--> D1["D1 · 业务数据"]
    Worker <--> KV["KV · 会话与缓存"]
    Worker <--> R2["R2 · 邮件附件"]
    Worker --> AI["Workers AI · 内容分析"]
    Worker --> Forward["外部邮箱 / Telegram"]
    Worker --> Provider["Cloudflare Email / Resend"]
    Provider --> Recipient["邮件收件人"]
```

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、Element Plus、Pinia、Vue Router、PWA |
| 后端 | Cloudflare Workers、Hono、Drizzle ORM |
| 数据 | Cloudflare D1、KV、R2 |
| 邮件 | Cloudflare Email Routing、Email Workers、Send Email Binding、Resend |
| 智能分析 | Cloudflare Workers AI |
| 工程化 | pnpm、Vitest、GitHub Actions |

## 快速开始

### 环境要求

- Node.js 22
- pnpm 10
- Cloudflare 账户及已接入 Cloudflare 的域名
- 已启用的 Cloudflare Email Routing
- D1 数据库、KV 命名空间和 R2 存储桶

### 获取代码

```bash
git clone https://github.com/riba2534/hpc-mail.git
cd hpc-mail
```

### 安装依赖并验证

```bash
pnpm --dir mail-worker install --frozen-lockfile
pnpm --dir mail-vue install --frozen-lockfile

pnpm --dir mail-worker run test:unit
pnpm --dir mail-vue test
pnpm --dir mail-vue run build
```

### 本地开发

1. 根据自己的 Cloudflare 资源修改 `mail-worker/wrangler-dev.toml`。
2. 启动 Worker 开发服务：

   ```bash
   pnpm --dir mail-worker dev
   ```

3. 在另一个终端启动前端：

   ```bash
   pnpm --dir mail-vue dev
   ```

4. 访问 [http://localhost:3001](http://localhost:3001)。前端开发环境默认请求 `http://127.0.0.1:8787/api`。

## GitHub Actions 自动部署

项目提供 [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml)。推荐将生产参数配置到 GitHub 仓库的 **Settings → Secrets and variables → Actions**，不要把凭据直接写入配置文件或提交到版本库。

### 必需 Secrets

| 名称 | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 具备 Workers、D1、KV、R2、路由和脚本部署权限的 Cloudflare API Token |
| `JWT_SECRET` | URL 安全、至少 43 个字符的高强度随机值 |
| `INIT_SECRET` | 用于保护 Schema 初始化接口的独立高强度密钥，至少 32 个字符 |
| `ADMIN_PASSWORD` | 12–128 个字符的初始管理员密码；工作流也使用它完成部署后的登录检查 |

### 必需 Variables

| 名称 | 示例 | 说明 |
| --- | --- | --- |
| `NAME` | `hpc-mail` | Worker 名称 |
| `CUSTOM_DOMAIN` | `mail.example.com` | Web 服务使用的自定义域名 |
| `DOMAIN` | `["example.com","example.net"]` | 可收发邮件的域名，必须是 JSON 字符串数组 |
| `ADMIN_USERNAME` | `admin` | 初始管理员用户名，只用于登录身份和全新数据库初始化 |
| `ADMIN_MAILBOX` | `admin@example.com` | 初始化时归属于管理员的首个邮箱，域名必须包含在 `DOMAIN` 中 |
| `CLOUDFLARE_ACCOUNT_ID` | `xxxxxxxx` | Cloudflare 账户 ID |
| `D1_DATABASE_ID` | `xxxxxxxx` | D1 数据库 ID |
| `KV_NAMESPACE_ID` | `xxxxxxxx` | KV 命名空间 ID |
| `R2_BUCKET_NAME` | `hpc-mail-r2` | R2 存储桶名称 |

### 可选 Variables 与 Secrets

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `CF_EMAIL` | `false` | 设为 `true` 时启用 Cloudflare Send Email Binding；否则可在后台按域名配置 Resend Token |
| `AI_MODEL` | `@cf/meta/llama-3.1-8b-instruct` | Workers AI 模型 |
| `ANALYSIS_CACHE` | `false` | 是否缓存邮件智能分析结果 |
| `PROJECT_LINK` | `false` | 是否在站点展示项目链接 |
| `REBUILD_DATABASE` | `false` | 一次性破坏性开关；设为 `true` 时允许清空 D1 并按当前 Schema 重建，成功后应立即恢复为 `false` |

### 身份与 Schema 初始化

用户身份与邮箱地址完全分离：`user` 只保存用户名、密码哈希和角色等身份数据，所有邮箱地址只保存在 `account` 中。登录接口只接受用户名和密码，管理员邮箱也不会作为登录标识。

部署完成后，工作流会通过受 `INIT_SECRET` 保护的 `POST /api/init` 初始化当前版本的 Schema，并使用 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `ADMIN_MAILBOX` 创建全新数据库的初始管理员。相同版本的重复初始化是幂等操作，不会覆盖已经修改过的管理员密码。

数据库中记录的 Schema 版本与当前应用不一致时，初始化默认拒绝继续并使部署失败，不会自动迁移或清除数据。确认不再需要现有数据后，可将 `REBUILD_DATABASE` 临时设为 `true` 并重新运行工作流；该操作会清空 D1、按最新 Schema 重建并重新创建管理员。重建成功后必须立即将它恢复为 `false`。

线上健康检查会使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 实际登录、读取当前用户信息并退出。通过后台修改管理员密码后，也要同步更新 GitHub Secret `ADMIN_PASSWORD`，否则下一次部署会在健康检查阶段失败。

推送 `mail-worker/**`、`mail-vue/**` 或工作流文件到 `main` 后会自动部署，也可以在 GitHub Actions 页面手动触发。工作流依次执行：

1. 校验部署参数；
2. 安装依赖并运行前后端测试；
3. 审计生产依赖并构建前端；
4. 执行 Wrangler Dry Run；
5. 部署 Worker 与静态资源；
6. 同步 `jwt_secret` 与 `init_secret` Worker Secrets；
7. 初始化版本化数据库 Schema，或在明确开启开关后执行整库重建；
8. 检查首页和公开配置接口，并完成一次真实的管理员登录与退出。

## Cloudflare 邮件路由

部署 Worker 后，还需要在每个邮件域名的 Cloudflare 控制台中完成以下配置：

1. 启用 **Email Routing**；
2. 将 Catch-all 操作设置为“发送到 Worker”；
3. 选择当前部署的 HPC Mail Worker；
4. 如使用 Cloudflare Send Email Binding，按 Cloudflare 要求验证允许使用的发件域名和目标地址；
5. 如使用 Resend，在管理后台为对应域名保存 Resend Token 并完成域名验证。

## 目录结构

```text
hpc-mail/
├── .github/workflows/        # GitHub Actions 自动部署
├── design-system/            # 视觉规范与设计令牌
├── doc/                      # 项目文档与资源
├── mail-vue/                 # Vue 3 前端应用
│   ├── public/               # 公共静态资源
│   ├── src/                  # 页面、组件、状态与请求层
│   └── test/                 # 前端测试
├── mail-worker/              # Cloudflare Worker 后端
│   ├── src/                  # API、服务、存储与邮件处理
│   ├── test/                 # Worker 单元测试
│   └── wrangler*.toml        # 本地、测试与部署配置
├── LICENSE
└── README.md
```

## 安全说明

- 不要提交 API Token、JWT Secret、Init Secret、管理员密码、Resend Token 或其他生产凭据。
- `INIT_SECRET` 必须与 `JWT_SECRET` 相互独立；仅为可信用户开放注册。
- 若在后台修改管理员密码，请同时更新 GitHub Secret `ADMIN_PASSWORD`，但不要把密码写入仓库 Variables 或配置文件。
- 建议为 Cloudflare 和 GitHub 账户启用双因素认证，并定期轮换部署凭据。
- 邮件属于不受信任输入；若扩展邮件渲染逻辑，请继续保留 HTML 净化、远程资源限制与附件 MIME 校验。
- 如发现安全问题，请不要公开披露凭据或用户数据，可通过仓库所有者的私密联系方式报告。

## 参与贡献

欢迎提交 Issue 或 Pull Request。建议在提交前：

1. 先说明问题、使用场景和预期行为；
2. 保持改动聚焦，并为业务逻辑补充测试；
3. 确保前后端测试、构建与依赖审计通过；
4. 不在提交中包含真实邮箱、生产资源 ID 或任何敏感信息。

## 上游与致谢

HPC Mail 基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 持续开发，并针对多域名账号体系、灵活发件地址、现代化界面、安全性和自动化部署进行了重构。感谢原项目及其贡献者。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。使用本项目时，请同时遵守 Cloudflare、Resend 及其他所接入服务的条款与当地适用法律。
