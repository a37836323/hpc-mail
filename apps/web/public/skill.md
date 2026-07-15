# HPC Mail — AI Agent 操作指南

> 这是一份写给 AI Agent 的说明书。你（AI）拿到本站的**用户名**和**密码**后，照本文档即可完成邮箱的收发、回复、接收验证码等全部操作。所有接口都是标准 HTTP + JSON，用 `curl` 或任意 HTTP 客户端即可调用。

- **站点地址（Base URL）**：`https://hpc.email`
- **本文档地址**：`https://hpc.email/skill.md`
- **你需要的凭据**：用户名 + 密码（由站点管理员提供给你）

---

## 0. 核心概念（先读这段）

- **平台账户**：用用户名 + 密码登录的身份，和具体邮箱地址是分开的。
- **邮箱地址**：形如 `任意前缀@某个系统域名`（例如 `bot@hpc.email`）。你要先**认领**一个地址才能用它收发邮件；地址全局唯一，认领后归你专用。管理员账户可直接用任意地址收发，无需认领。
- **收件**：发到你已认领地址的邮件会自动进入你的收件箱。系统会**自动从邮件里提取验证码**（放在 `verificationCode` 字段），这是接码类任务的关键。
- **发件**：你只能用自己认领的地址作为发件人（管理员不受限）。

---

## 1. 登录拿到访问令牌（Token）

所有后续请求都要带这个 token。

```bash
curl -s -X POST https://hpc.email/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"你的用户名","password":"你的密码"}'
```

成功返回：

```json
{ "data": { "token": "eyJ...(JWT)", "user": { "id": 1, "username": "...", "role": "user" } } }
```

**记下 `data.token`**。之后每个请求都加请求头：`Authorization: Bearer <token>`。令牌有效期 30 天。

> 约定：下文示例里的 `$TOKEN` 就是这个令牌，`$BASE` 就是 `https://hpc.email`。

---

## 2. 响应格式约定（务必理解）

- **成功**：HTTP 状态码 2xx，响应体是 `{ "data": ... }`，你要的内容在 `data` 里。
- **失败**：HTTP 状态码 4xx/5xx，响应体是 `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`。`error.message` 是人类可读的原因，`code` 是机器可读的错误码（如 `unauthorized`、`address_taken`、`forbidden`）。
- 列表接口统一游标分页：请求带 `?cursor=&limit=`，返回 `{ "data": { "items": [...], "nextCursor": "字符串或 null" } }`。`nextCursor` 非 null 时，把它作为下一页的 `cursor` 继续拉。

---

## 3. 常见任务

### 3.1 查看可用域名

认领地址前，先看有哪些系统域名可用（此接口无需登录）：

```bash
curl -s $BASE/api/config
# → { "data": { "siteTitle": "...", "registrationMode": "closed", "domains": ["hpc.email", ...] } }
```

`data.domains` 就是你能用来认领地址的域名列表。

### 3.2 认领一个邮箱地址

```bash
# 先查地址是否可用
curl -s "$BASE/api/mailboxes/availability?localPart=bot&domain=hpc.email" \
  -H "Authorization: Bearer $TOKEN"
# → { "data": { "address": "bot@hpc.email", "available": true } }

# 认领
curl -s -X POST $BASE/api/mailboxes \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"localPart":"bot","domain":"hpc.email"}'
# → { "data": { "id": 5, "address": "bot@hpc.email", ... } }
```

> 查看你已认领的所有地址：`GET /api/mailboxes`（管理员加 `?all=1` 可看全站）。

### 3.3 接收邮件 / 读取验证码（最常见）

拉取收件箱最新邮件：

```bash
curl -s "$BASE/api/messages?direction=inbound&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

返回的每封邮件（`data.items[]`）都含这些关键字段：

| 字段 | 含义 |
|------|------|
| `id` | 邮件 id，取详情/回复时用 |
| `fromAddress` / `fromName` | 发件人 |
| `address` | 收到该邮件的本站地址 |
| `subject` | 主题 |
| `preview` | 正文摘要 |
| **`verificationCode`** | **系统自动提取的验证码**（没有则为空字符串） |
| `isRead` / `isStarred` | 是否已读 / 已星标 |
| `hasAttachments` | 是否有附件 |
| `createdAt` | 收件时间 |

**接码只需读 `verificationCode` 字段**，通常不必再解析正文。

按地址过滤（只看某个认领地址收到的信）：

```bash
curl -s "$BASE/api/messages?direction=inbound&address=bot@hpc.email&limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

看邮件完整正文与附件：

```bash
curl -s $BASE/api/messages/123 -H "Authorization: Bearer $TOKEN"
# → data 里含 bodyText、bodyHtml、verificationCode、recipients、attachments[]（每个附件有 url 可下载）
```

### 3.4 轮询等待验证码到达（接码场景推荐做法）

发起某个操作后，验证码邮件通常几秒内到达。按地址轮询，读到 `verificationCode` 即停：

```bash
ADDR="bot@hpc.email"
for i in $(seq 1 20); do
  CODE=$(curl -s "$BASE/api/messages?direction=inbound&address=$ADDR&limit=1" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import json,sys;i=json.load(sys.stdin)['data']['items'];print(i[0]['verificationCode'] if i else '')")
  if [ -n "$CODE" ]; then echo "验证码：$CODE"; break; fi
  sleep 3
done
```

> 提示：可先记下当前最新邮件 id，只认「比它更新且 verificationCode 非空」的邮件，避免读到旧验证码。

### 3.5 发送邮件

```bash
curl -s -X POST $BASE/api/messages/send \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "from": { "localPart": "bot", "domain": "hpc.email" },
    "to": ["someone@example.com"],
    "cc": [],
    "bcc": [],
    "subject": "你好",
    "text": "这是纯文本正文"
  }'
```

- `from`：二选一 —— `{"localPart":"bot","domain":"hpc.email"}` 或 `{"mailboxId":5}`（用你认领的地址）。
- 正文：`text`（纯文本）和 `html`（HTML）至少给一个。
- 站内地址（收件人域名也属于本站）会即时投递；站外地址需站点管理员配置了外发通道才能送达。

### 3.6 回复邮件

回复要点：把 `to` 设为原发件人、主题加 `Re:`、并带上 `replyToMessageId`（原邮件 id），系统会自动注入邮件线程头（In-Reply-To / References）。

```bash
curl -s -X POST $BASE/api/messages/send \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "from": { "localPart": "bot", "domain": "hpc.email" },
    "to": ["原发件人@example.com"],
    "subject": "Re: 原主题",
    "text": "这是我的回复。\n\n----- 原始邮件 -----\n> 原文引用...",
    "replyToMessageId": 123
  }'
```

### 3.7 标记已读 / 星标 / 删除

```bash
# 标记已读（isRead:false 则标为未读）
curl -s -X POST $BASE/api/messages/read -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"ids":[123,124],"isRead":true}'

# 星标（starred:false 取消）
curl -s -X POST $BASE/api/messages/star -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"ids":[123],"starred":true}'

# 删除
curl -s -X POST $BASE/api/messages/delete -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"ids":[123]}'
```

### 3.8 搜索

`GET /api/messages` 支持这些 query 参数，可组合：

| 参数 | 说明 |
|------|------|
| `direction` | `inbound`（收件）/ `outbound`（发件） |
| `address` | 只看某个认领地址 |
| `domain` | 只看某个域名 |
| `unread` | `1` 只看未读 |
| `starred` | `1` 只看星标 |
| `q` | 关键词，匹配主题 / 发件人 / **正文** |
| `cursor` / `limit` | 分页（limit 最大 100） |

例：搜正文含 "invoice" 的未读邮件 → `?direction=inbound&unread=1&q=invoice`。

### 3.9 下载附件

邮件详情 `data.attachments[]` 里每个附件有一个 `url`（短期签名地址），直接 GET 即可下载：

```bash
curl -s "$BASE<附件的 url>" -o attachment.bin
```

---

## 4. 完整接口速查

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录拿 token |
| GET | `/api/auth/me` | 当前账户信息 |
| GET | `/api/config` | 公开配置（可用域名、注册模式）|
| GET | `/api/mailboxes` | 我认领的地址 |
| GET | `/api/mailboxes/availability?localPart=&domain=` | 查地址是否可认领 |
| POST | `/api/mailboxes` | 认领地址 `{localPart,domain}` |
| DELETE | `/api/mailboxes/:id` | 释放地址 |
| GET | `/api/messages` | 收发件列表（见 §3.8 过滤参数）|
| GET | `/api/messages/:id` | 邮件详情（正文 + 验证码 + 附件）|
| POST | `/api/messages/send` | 发送 / 回复邮件 |
| POST | `/api/messages/read` | 批量已读/未读 `{ids,isRead}` |
| POST | `/api/messages/star` | 批量星标 `{ids,starred}` |
| POST | `/api/messages/delete` | 批量删除 `{ids}` |
| GET | `/api/attachments/:id` | 下载附件（带 Bearer 或签名参数）|

---

## 5. 进阶：用 API Key + `/v1` 做长期自动化（可选）

如果你要长期、无人值守地运行（而不是临时用用户名密码登录），建议创建一个 **API Key**，之后用 `/v1` 系列接口（专为脚本设计，带独立限流与调用审计）。

1. 用 §1 的 token 创建 key：

```bash
curl -s -X POST $BASE/api/api-keys -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-agent","scopes":["mail.read","mail.send","mailbox.read","mailbox.write"]}'
# → data.key 是完整密钥（形如 hpcm_xxxx），只返回这一次，务必保存
```

2. 之后用 `Authorization: Bearer hpcm_xxxx` 调用 `/v1`：

| 方法 | 路径 | scope |
|------|------|-------|
| GET | `/v1/status` | — |
| GET | `/v1/domains` | mailbox.read |
| GET / POST | `/v1/mailboxes` | mailbox.read / mailbox.write |
| GET | `/v1/messages` | mail.read（过滤参数同 §3.8）|
| GET | `/v1/messages/:id` | mail.read（含 verificationCode）|
| GET | `/v1/messages/:id/attachments/:attId` | mail.read |
| POST | `/v1/messages` | mail.send（body 同 §3.5 发送）|

`/v1` 响应会带 `X-RateLimit-*` 限流头；超限返回 429。

---

## 6. 错误码参考

| code | 含义 |
|------|------|
| `unauthorized` | 未登录 / token 失效 —— 重新登录 |
| `forbidden` | 无权限（如用非自己认领的地址发件）|
| `validation_failed` | 参数不合法（如域名不在系统列表）|
| `address_taken` | 认领的地址已被占用 |
| `not_found` | 资源不存在 |
| `rate_limited` | 调用频率超限，稍后重试 |
| `send_channel_unconfigured` | 该域名的外发通道未配置 |

遇到错误时，读 `error.message` 了解原因、`requestId` 可用于向管理员反馈。

---

**一句话总结给 AI**：登录拿 token → 认领或选定一个地址 → 用 `GET /api/messages` 收信（读 `verificationCode` 拿验证码）→ 用 `POST /api/messages/send` 发信/回复。就这么简单。
