# HPC Mail 第一阶段改版方案：认证与任意前缀发信

状态：已实现并完成后端安全加固
日期：2026-07-14

## 1. 本阶段范围

本阶段首先完成两个基础能力，并以同一套设计令牌重构现有站点界面：

1. 登录身份改为“用户名 + 密码”。
2. 写信时可直接组合“任意合法前缀 + 已授权域名”。

认证、写信、应用外壳、邮件列表与详情、设置和管理视图现已统一到新的视觉基线。部分复杂数据控件仍复用 Element Plus，写信正文继续使用 TinyMCE；这属于有意的渐进式迁移，不影响身份与动态发件模型。

## 2. 核心产品模型

新版需要明确区分四个概念：

| 概念 | 含义 | 示例 |
| --- | --- | --- |
| User | 登录系统的人，只负责身份与权限 | `riba2534` |
| Domain | 系统配置并允许收发邮件的域名 | `hpc.email` |
| Mailbox Account | 用户主动保存、用于固定收件视图的邮箱 | `admin@hpc.email` |
| Sender Identity | 某次发信即时使用的地址，可不保存为 Account | `billing@hpc.email` |

关键结论：

- `User.username` 才是登录标识。
- User 可以拥有 0 到多个 Mailbox Account。
- Sender Identity 不需要预先创建，也不应该无限写入 `account` 表。
- 用户可用哪些域名由角色/授权决定，不由注册时选择的邮箱决定。

## 3. 认证系统设计

### 3.1 数据库

在 `user` 表增加：

```sql
ALTER TABLE user ADD COLUMN username TEXT;
ALTER TABLE user ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_user_username_nocase
  ON user (username COLLATE NOCASE);
```

已落地的幂等迁移按以下顺序执行：

1. 先增加 nullable 字段。
2. 优先从该用户主 Account 的 `name` 回填，否则使用 `user.email` 前缀；冲突时追加稳定的 `userId` 后缀。
3. 验证不存在空值和重复值。
4. 创建大小写不敏感唯一索引。
5. 新代码只创建带 username 的用户。

`user.email` 暂时保留用于兼容旧数据和上游逻辑，但不再承担登录身份。后续应逐步移除 `c.env.admin === user.email` 这种管理员判断，改成角色与权限判断。

### 3.2 API

第一阶段可保留现有路径，替换请求体：

```http
POST /api/login
Content-Type: application/json

{
  "username": "riba2534",
  "password": "..."
}
```

```http
POST /api/register
Content-Type: application/json

{
  "username": "riba2534",
  "password": "...",
  "code": "optional-invite-code",
  "token": "optional-turnstile-token"
}
```

当前登录模型：

- `/api/login` 只接受 `username` 和 `password`。
- 邮箱地址不能作为登录标识，也不存在旧邮箱登录兼容路径。
- 注册接口只创建平台账户，不向 `account` 表自动插入邮箱。

### 3.3 权限与注册

- 注册码决定用户角色和可用域名范围。
- 普通注册使用默认角色。
- 注册完成后可选择添加常用邮箱，但该步骤可以跳过。
- 用户名不存在和密码错误返回相同提示，降低用户名枚举风险。
- 新密码使用带版本标记的 PBKDF2-HMAC-SHA256（310,000 次迭代和随机盐）。
- 旧 SHA-256 密码仍可恒定时间校验，并在成功登录后自动升级。
- 登录失败按哈希后的 IP 与规范化标识在 KV 中限流；成功后清除失败计数。
- JWT 与 KV 会话均有 30 天绝对过期时间，退出只注销当前设备。
- LinuxDo OAuth 使用 state + HttpOnly Cookie 校验，并以短时、一次性 `bindTicket` 完成用户名绑定。

## 4. 任意前缀发信设计

### 4.1 新请求模型

```http
POST /api/email/send
Content-Type: application/json

{
  "from": {
    "name": "HPC Mail",
    "localPart": "billing",
    "domain": "hpc.email"
  },
  "receiveEmail": ["alice@example.com"],
  "subject": "七月账单",
  "text": "...",
  "content": "<p>...</p>",
  "attachments": []
}
```

服务端必须自行拼接 `fromEmail`，不能直接信任客户端提交的完整 From。

### 4.2 服务端校验顺序

1. `localPart` 长度 1 至 64。
2. 使用与系统邮箱一致的 local-part 字符规则，并额外拒绝首尾点和连续点。
3. `domain` 必须存在于 Worker 的配置域名中。
4. 当前用户角色必须拥有该域名的发信权限。
5. 显示名称、主题和 Header 值拒绝 CR/LF 注入。
6. 再调用 Cloudflare Email Binding 或 Resend。

不能仅在前端校验，因为请求可以绕过 UI 直接调用 API。

### 4.3 数据保存与查询

推荐第一阶段保持数据库改动最小：

- 继续把完整发件地址保存到 `email.send_email`。
- 动态发件使用 `account_id = 0`，固定邮箱发件可继续记录真实 accountId。
- 已发送列表以 `email.user_id` 为主范围，不再要求动态邮件关联 Account。
- 修复当前 `LEFT JOIN account` 后又使用 `account.is_del = 0` 导致 `account_id = 0` 记录被过滤的问题。
- 筛选和搜索直接基于 `send_email`，无需为每个临时前缀创建 Account。

旧 `accountId` 请求在兼容期继续有效；新 `from` 存在时优先走动态发件逻辑。

### 4.4 回复规则

回复 Catch-all 邮件时：

1. 如果原始 `to_email` 的域名仍受当前用户授权，默认使用该地址回复。
2. 否则使用最近一次合法发件地址。
3. UI 明确提示发生了发件地址回退，避免用户误用身份。

这会让 `random@happyclaw.cc` 收到的邮件可以自然地以同一地址回复。

## 5. 页面与组件方案

详细页面规范：

- [认证页面](../../design-system/hpc-mail/pages/auth.md)
- [写信页面](../../design-system/hpc-mail/pages/compose.md)
- [全局设计系统](../../design-system/hpc-mail/MASTER.md)

实际组件选型：

- Reka UI：认证绑定和写信 Dialog 等可访问性基础能力。
- 项目内 `components/ui`：Button、IconButton、FormField 等轻量业务基础组件。
- 原生 CSS 自定义属性：颜色、间距、圆角、阴影、动效和响应式令牌；未引入 Tailwind。
- Lucide Vue：新版功能图标。
- TinyMCE：继续承载邮件正文编辑，避免在本轮同时替换编辑器内核。
- Element Plus：复杂表格、标签输入和部分旧管理控件继续使用，并映射到同一设计令牌。

## 6. 推荐实现顺序

### Slice 1：设计基础（已完成）

- 接入 Reka UI、Lucide 和项目内 UI 组件。
- 建立颜色、字体、圆角、阴影和动效令牌。
- 完成 Button、Field、Input、Select、Dialog、Toast 基础组件。

### Slice 2：用户名认证（已完成）

- D1 schema 迁移与旧用户回填。
- 登录/注册服务兼容改造。
- 新认证页面。
- 登录、注册、禁用注册、注册码和 Turnstile 回归测试。

### Slice 3：动态发件身份（已完成）

- 新 `from` 请求模型和服务端校验。
- 动态发件记录的查询修复。
- 新写信 Dialog，保留并重新包裹 TinyMCE 编辑器。
- 回复时使用原始收件地址。
- 草稿恢复、附件和发送失败回归测试。

### Slice 4：兼容、安全与清理（已完成）

- 确认旧客户端兼容窗口。
- 监控动态发件失败率与 D1 记录完整性。
- 新写信请求不再要求预先存在的 `accountId`；固定邮箱旧请求仍兼容。
- OAuth、会话、密码、登录限流、Telegram 邮件查看和附件响应均完成安全加固。

## 7. 本阶段验收清单

- [x] 使用 `riba2534 + 密码` 登录，无需输入或选择邮箱域名。
- [x] 注册只创建用户身份，不隐式创建邮箱 Account。
- [x] 旧用户通过幂等迁移获得稳定且唯一的 username。
- [x] 可从 `billing@hpc.email`、`notice@option.red` 等未创建地址发信。
- [x] 服务端拒绝未配置或未授权域名、非法前缀和 Header 注入。
- [x] 动态发件与已删除 Account 的历史发件均保留在“已发送”查询中。
- [x] 回复随机 Catch-all 地址时优先使用原始收件地址，失去权限时显示回退提示。
- [x] 草稿使用 Dexie 防抖保存，发送失败保留编辑内容。
- [x] 亮色、深色、键盘焦点和移动端布局已纳入统一实现。

## 8. 后续可选演进

- Catch-all 邮件自动归属管理员普通收件箱。
- 多用户之间的域名精细分配 UI。
- GitHub Actions 部署问题。
- 将仍在使用的复杂 Element Plus 控件逐步迁移为项目内组件。
- 如未来确有编辑能力需求，再单独评估替换 TinyMCE；本次不做无收益的编辑器迁移。

这些项目不影响本次用户名认证、任意前缀发信和整站 UI 重构的交付。
