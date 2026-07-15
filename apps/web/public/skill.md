---
name: hpc-mail
description: 通过 HTTP API 操作 HPC Mail（https://hpc.email）多域名邮箱系统——接收邮件并读取自动提取的验证码、发送与回复邮件、认领和管理邮箱地址、搜索邮件、下载附件。当你拿到 HPC Mail 的用户名和密码，或被要求「在 hpc.email 上收发邮件」「查收/获取邮箱验证码」「用某个 @hpc.email 之类的地址发信或回信」「自动化邮箱操作」时，务必使用本 skill——即使用户只说「帮我查一下验证码」「发封邮件」而没有点名 HPC Mail，只要目标邮箱属于本系统的域名，就按本文指引调用 API。
---

# HPC Mail — AI Agent 操作指南

你（AI Agent）拿到本站的**用户名**和**密码**后，照本文档即可完成邮箱的收发、回复、接收验证码等全部操作。所有接口都是标准 HTTP + JSON，用 `curl` 或任意 HTTP 客户端即可调用。

- **站点地址（Base URL）**：`https://hpc.email`（下文示例里的 `$BASE`）
- **本文档地址**：`https://hpc.email/skill.md`
- **你需要的凭据**：用户名 + 密码（由站点管理员提供给你）

理解这套 API 的关键在于：**邮箱地址与登录身份是分离的**。你用用户名密码登录得到一个访问令牌，令牌代表「你这个账户」；而收发邮件用的是一个个「邮箱地址」（如 `bot@hpc.email`），需要先认领才能归你专用。搞清这一点，后面的操作就都顺理成章。

## 核心概念

- **平台账户**：用用户名 + 密码登录的身份，和具体邮箱地址分开。
- **邮箱地址**：形如 `任意前缀@某个系统域名`（例如 `bot@hpc.email`）。普通账户要先**认领**一个地址才能用它收发；地址全局唯一，认领后专属于你。管理员账户可直接用任意地址收发，无需认领。
- **验证码自动提取**：发到你地址的邮件，系统会自动把其中的验证码解析到 `verificationCode` 字段——这是接码类任务的核心，通常你不必再自己解析正文。
- **发件限制**：普通账户只能用自己认领的地址作为发件人；管理员不受限。

## 第一步：登录拿到访问令牌

所有后续请求都要带这个令牌，所以先做这一步。

```bash
curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"你的用户名","password":"你的密码"}'
# → { "data": { "token": "eyJ...(JWT)", "user": { "id": 1, "username": "...", "role": "user" } } }
```

记下 `data.token`（下文记作 `$TOKEN`）。之后每个请求都加请求头 `Authorization: Bearer $TOKEN`。令牌有效期 30 天。

## 响应格式约定

理解这个约定，你才能正确判断每次调用成没成功、结果在哪：

- **成功**：HTTP 2xx，响应体 `{ "data": ... }`，你要的内容在 `data` 里。
- **失败**：HTTP 4xx/5xx，响应体 `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`。读 `error.message` 了解原因，`code` 是机器可读错误码（见文末）。
- **列表接口**统一游标分页：请求带 `?cursor=&limit=`，返回 `{ "data": { "items": [...], "nextCursor": "字符串或 null" } }`。`nextCursor` 非 null 时，把它作为下一页的 `cursor` 继续拉。

## 任务：接收邮件 / 读取验证码（最常见）

这是绝大多数自动化任务的核心。拉取收件箱最新邮件：

```bash
curl -s "$BASE/api/messages?direction=inbound&limit=10" -H "Authorization: Bearer $TOKEN"
```

返回的每封邮件（`data.items[]`）含这些关键字段：

| 字段 | 含义 |
|------|------|
| `id` | 邮件 id，取详情/回复时用 |
| `fromAddress` / `fromName` | 发件人 |
| `address` | 收到该邮件的本站地址 |
| `subject` / `preview` | 主题 / 正文摘要 |
| **`verificationCode`** | **系统自动提取的验证码**（无则为空字符串） |
| `isRead` / `isStarred` / `hasAttachments` | 已读 / 星标 / 有附件 |
| `createdAt` | 收件时间 |

**接码时优先读 `verificationCode`**，命中即可，通常不必解析正文。只看某个地址收到的信，加 `&address=bot@hpc.email`。看完整正文与附件用详情接口：

```bash
curl -s $BASE/api/messages/123 -H "Authorization: Bearer $TOKEN"
# → data 含 bodyText、bodyHtml、verificationCode、recipients、attachments[]（每个附件带可下载的 url）
```

### 轮询等待验证码到达

触发某操作后，验证码邮件通常几秒内到。按地址轮询，读到即停。为避免读到**旧**验证码，先记下当前最新邮件 id，只认比它更新的邮件：

```bash
ADDR="bot@hpc.email"
LAST=$(curl -s "$BASE/api/messages?direction=inbound&address=$ADDR&limit=1" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import json,sys;i=json.load(sys.stdin)['data']['items'];print(i[0]['id'] if i else 0)")
# ……在此触发会产生验证码邮件的操作……
for i in $(seq 1 20); do
  RESULT=$(curl -s "$BASE/api/messages?direction=inbound&address=$ADDR&limit=1" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import json,sys;i=json.load(sys.stdin)['data']['items'];print(f\"{i[0]['id']}:{i[0]['verificationCode']}\" if i else '0:')")
  ID="${RESULT%%:*}"; CODE="${RESULT#*:}"
  if [ "$ID" -gt "$LAST" ] && [ -n "$CODE" ]; then echo "验证码：$CODE"; break; fi
  sleep 3
done
```

## 任务：发送邮件

```bash
curl -s -X POST $BASE/api/messages/send \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "from": { "localPart": "bot", "domain": "hpc.email" },
    "to": ["someone@example.com"],
    "subject": "你好",
    "text": "这是纯文本正文"
  }'
```

- `from` 二选一：`{"localPart":"bot","domain":"hpc.email"}` 或 `{"mailboxId":5}`（用你认领的地址）。
- 正文 `text`（纯文本）和 `html` 至少给一个；可选 `cc` / `bcc` 数组、`attachments`。
- 收件人若也是本站域名，即时站内投递；站外地址需管理员配置了外发通道才能送达。

## 任务：回复邮件

回复的要点是带上 `replyToMessageId`（原邮件 id），系统会自动注入邮件线程头（In-Reply-To / References），让回复正确挂到原对话上。把 `to` 设为原发件人、主题加 `Re:`：

```bash
curl -s -X POST $BASE/api/messages/send \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "from": { "localPart": "bot", "domain": "hpc.email" },
    "to": ["原发件人@example.com"],
    "subject": "Re: 原主题",
    "text": "我的回复内容。\n\n----- 原始邮件 -----\n> 原文引用...",
    "replyToMessageId": 123
  }'
```

## 任务：认领 / 管理邮箱地址

普通账户收发前需先认领地址（管理员可跳过）。先查可用域名（此接口无需登录）：

```bash
curl -s $BASE/api/config
# → data.domains 是可认领的系统域名列表
```

查地址是否可用并认领：

```bash
curl -s "$BASE/api/mailboxes/availability?localPart=bot&domain=hpc.email" -H "Authorization: Bearer $TOKEN"
# → { "data": { "address": "bot@hpc.email", "available": true } }
curl -s -X POST $BASE/api/mailboxes -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"localPart":"bot","domain":"hpc.email"}'
```

查看已认领地址：`GET /api/mailboxes`（管理员加 `?all=1` 看全站）。释放地址：`DELETE /api/mailboxes/:id`。

## 任务：标记 / 搜索 / 下载附件

```bash
# 标记已读（isRead:false 则标未读）、星标（starred:false 取消）、删除
curl -s -X POST $BASE/api/messages/read   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"ids":[123],"isRead":true}'
curl -s -X POST $BASE/api/messages/star   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"ids":[123],"starred":true}'
curl -s -X POST $BASE/api/messages/delete -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"ids":[123]}'
```

搜索用 `GET /api/messages` 的 query 参数组合：`direction`（inbound/outbound）、`address`、`domain`、`unread=1`、`starred=1`、`q`（关键词，匹配主题/发件人/**正文**）、`cursor`/`limit`（limit 最大 100）。例：搜正文含 invoice 的未读收件 → `?direction=inbound&unread=1&q=invoice`。

下载附件：邮件详情 `data.attachments[]` 每项有短期签名 `url`，`curl -s "$BASE<url>" -o file` 即可。

## 完整接口速查

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录拿 token |
| GET | `/api/auth/me` | 当前账户信息 |
| GET | `/api/config` | 公开配置（可用域名、注册模式）|
| GET / POST | `/api/mailboxes` | 我的地址 / 认领 `{localPart,domain}` |
| GET | `/api/mailboxes/availability?localPart=&domain=` | 查地址可否认领 |
| DELETE | `/api/mailboxes/:id` | 释放地址 |
| GET | `/api/messages` | 收发件列表（过滤参数见「搜索」）|
| GET | `/api/messages/:id` | 邮件详情（正文 + 验证码 + 附件）|
| POST | `/api/messages/send` | 发送 / 回复（带 `replyToMessageId`）|
| POST | `/api/messages/read` `/star` `/delete` | 批量已读 / 星标 / 删除 `{ids,...}` |
| GET | `/api/attachments/:id` | 下载附件 |

## 错误码参考

| code | 含义与应对 |
|------|------|
| `unauthorized` | 未登录 / token 失效 → 重新登录 |
| `forbidden` | 无权限（如用非自己认领的地址发件）|
| `validation_failed` | 参数不合法（如域名不在系统列表）|
| `address_taken` | 认领的地址已被占用，换一个前缀 |
| `not_found` | 资源不存在 |
| `rate_limited` | 频率超限，稍后重试 |
| `send_channel_unconfigured` | 该域名外发通道未配置 |

## 进阶：用 API Key + /v1 做长期自动化

若需长期无人值守运行，建议创建 **API Key** 后改用 `/v1` 系列接口（专为脚本设计，带独立限流与调用审计），而不是反复用用户名密码登录。

```bash
# 用 $TOKEN 创建 key，data.key 是完整密钥（形如 hpcm_xxxx），只返回这一次，务必保存
curl -s -X POST $BASE/api/api-keys -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-agent","scopes":["mail.read","mail.send","mailbox.read","mailbox.write"]}'
```

之后用 `Authorization: Bearer hpcm_xxxx` 调用 `/v1`：`GET /v1/status`、`GET /v1/domains`、`GET|POST /v1/mailboxes`、`GET /v1/messages`（过滤参数同上）、`GET /v1/messages/:id`（含 verificationCode）、`GET /v1/messages/:id/attachments/:attId`、`POST /v1/messages`（发送，body 同上）。`/v1` 响应带 `X-RateLimit-*` 头，超限返回 429。

---

**一句话流程**：登录拿 token → 认领或选定一个地址 → `GET /api/messages` 收信读 `verificationCode` → `POST /api/messages/send` 发信/回复。
