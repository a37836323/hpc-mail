# GitHub Actions 自动部署

仓库内置 [`.github/workflows/deploy-cloudflare.yml`](../.github/workflows/deploy-cloudflare.yml)。推送 `mail-worker/**`、`mail-react/**` 或工作流文件到 `main` 后，GitHub Actions 会自动完成测试、依赖审计、React 前端构建、Wrangler Dry Run、Cloudflare 部署、Schema 初始化和线上健康检查。

## 配置 Secrets

打开仓库 **Settings → Secrets and variables → Actions → Secrets**，添加：

| 名称 | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 具备 Workers、D1、KV 和 R2 部署权限的 Cloudflare API Token |
| `JWT_SECRET` | URL 安全、至少 43 个字符的高强度随机值 |
| `INIT_SECRET` | 保护 `/api/init` 的独立密钥，至少 32 个字符 |
| `ADMIN_PASSWORD` | 平台管理员密码，12–128 个字符 |

不要将任何 Secret 写入仓库文件。`JWT_SECRET` 与 `INIT_SECRET` 必须不同。

## 配置 Variables

在同一页面的 **Variables** 中添加：

| 名称 | 示例 | 说明 |
| --- | --- | --- |
| `NAME` | `hpc-mail` | Worker 名称 |
| `CUSTOM_DOMAIN` | `mail.example.com` | Web 服务自定义域名 |
| `DOMAIN` | `["example.com","example.net"]` | 可收发邮件的域名，必须是 JSON 字符串数组 |
| `ADMIN_USERNAME` | `admin` | 平台管理员用户名，不是邮箱地址 |
| `CLOUDFLARE_ACCOUNT_ID` | `xxxxxxxx` | Cloudflare 账户 ID |
| `D1_DATABASE_ID` | `xxxxxxxx` | D1 数据库 ID |
| `KV_NAMESPACE_ID` | `xxxxxxxx` | KV 命名空间 ID |
| `R2_BUCKET_NAME` | `hpc-mail-r2` | R2 存储桶名称 |

可选 Variables：

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `CF_EMAIL` | `false` | 是否开启 Cloudflare Send Email Binding |
| `AI_MODEL` | `@cf/meta/llama-3.1-8b-instruct` | Workers AI 模型 |
| `ANALYSIS_CACHE` | `false` | 是否缓存分析结果 |
| `PROJECT_LINK` | `false` | 是否展示项目链接 |
| `REBUILD_DATABASE` | `false` | 破坏性整库重建开关 |

## 首次部署

1. 在 Cloudflare 创建 D1、KV 和 R2 资源，并完成上述配置。
2. 进入仓库 **Actions → Deploy HPC Mail to Cloudflare → Run workflow**。
3. 工作流会调用受 `INIT_SECRET` 保护的初始化接口，创建平台管理员和最新 Schema，不会自动创建邮箱。
4. 在 Cloudflare Email Routing 中将相关域名的 Catch-all 指向已部署的 Worker。

平台账户与邮箱地址完全分离。部署后请使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录，再在邮箱管理中添加需要的邮箱。

## Schema 重建

正常升级会使用仓库中明确声明的版本迁移。只有在确认现有数据全部不再需要时，才将 `REBUILD_DATABASE` 临时设为 `true` 并重新运行工作流。成功后立即恢复为 `false`，避免下次部署再次清空数据。

更完整的部署、API 和安全说明见项目根目录 [README](../README.md)。
