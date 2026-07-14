import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  FlaskConical,
  Inbox,
  KeyRound,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button, ConfirmDialog, Input } from "@/components/ui";
import { publicApiRequest } from "./apiControlApi";
import type {
  PublicApiResult,
  PublicMailbox,
  PublicMessage,
} from "./apiControlTypes";

interface MailboxResponse {
  items: PublicMailbox[];
  nextCursor: string | null;
}

interface DomainResponse {
  items: string[];
}

interface MessageResponse {
  items: PublicMessage[];
  total: number;
  nextCursor: number | null;
}

export interface ApiKeyTesterProps {
  initialKey?: string;
}

export function ApiKeyTester({ initialKey = "" }: ApiKeyTesterProps) {
  const [apiKey, setApiKey] = useState(initialKey);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState("");
  const [result, setResult] = useState<PublicApiResult>();
  const [mailboxes, setMailboxes] = useState<PublicMailbox[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [mailboxId, setMailboxId] = useState("");
  const [cursor, setCursor] = useState("");
  const [limit, setLimit] = useState("20");
  const [messageId, setMessageId] = useState("");
  const [senderMode, setSenderMode] = useState<"dynamic" | "mailbox">(
    "dynamic",
  );
  const [senderMailboxId, setSenderMailboxId] = useState("");
  const [localPart, setLocalPart] = useState("notice");
  const [domain, setDomain] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("HPC Mail API 测试");
  const [text, setText] = useState(
    "这是一封由本地浏览器 API 测试器发送的邮件。",
  );
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (initialKey) setApiKey(initialKey);
  }, [initialKey]);

  const disabled = !apiKey.trim() || Boolean(loading);
  const recipients = useMemo(
    () => [
      ...new Set(
        to
          .split(/[,，;；\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ],
    [to],
  );

  async function run<T>(
    name: string,
    task: () => Promise<PublicApiResult<T>>,
  ): Promise<PublicApiResult<T> | undefined> {
    if (!apiKey.trim() || loading) return undefined;
    setLoading(name);
    try {
      const response = await task();
      setResult(response);
      return response;
    } finally {
      setLoading("");
    }
  }

  async function testStatus() {
    await run("status", () => publicApiRequest(apiKey, "/status"));
  }

  async function loadMailboxes() {
    const response = await run<MailboxResponse>("mailboxes", () =>
      publicApiRequest(apiKey, "/mailboxes?limit=30"),
    );
    if (response?.ok && response.data) {
      setMailboxes(response.data.items);
      if (!senderMailboxId && response.data.items[0])
        setSenderMailboxId(String(response.data.items[0].id));
    }
  }

  async function loadDomains() {
    const response = await run<DomainResponse>("domains", () =>
      publicApiRequest(apiKey, "/domains"),
    );
    if (response?.ok && response.data) {
      setDomains(response.data.items);
      if (!domain && response.data.items[0]) setDomain(response.data.items[0]);
    }
  }

  async function listMessages() {
    const query = new URLSearchParams({ direction, limit: limit || "20" });
    if (cursor) query.set("cursor", cursor);
    if (direction === "received" && mailboxId)
      query.set("mailboxId", mailboxId);
    await run<MessageResponse>("messages", () =>
      publicApiRequest(apiKey, `/messages?${query}`),
    );
  }

  async function getMessage() {
    if (!/^\d+$/.test(messageId) || Number(messageId) < 1) return;
    await run<PublicMessage>("detail", () =>
      publicApiRequest(apiKey, `/messages/${messageId}`),
    );
  }

  async function sendMessage() {
    if (!recipients.length || !subject.trim() || !text.trim()) return;
    const from =
      senderMode === "mailbox"
        ? { mailboxId: Number(senderMailboxId) }
        : { localPart: localPart.trim(), domain };
    setSendOpen(false);
    await run<PublicMessage>("send", () =>
      publicApiRequest(apiKey, "/messages", {
        method: "POST",
        body: { from, to: recipients, subject: subject.trim(), text },
      }),
    );
  }

  return (
    <div className="space-y-5" role="tabpanel" aria-label="API 密钥测试器">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            浏览器本地密钥测试
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            请求只会从当前浏览器发往当前站点的 <code>/api/v1</code>
            ，不会携带登录 Cookie。
          </p>
        </div>
        <span className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="size-4" />
          密钥仅保存在组件内存
        </span>
      </header>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-4"
        aria-labelledby="tester-key-heading"
      >
        <label
          id="tester-key-heading"
          htmlFor="api-tester-key"
          className="text-sm font-medium text-slate-700"
        >
          API 密钥
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Input
            id="api-tester-key"
            type={showKey ? "text" : "password"}
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            placeholder="hpc_live_…"
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void testStatus();
            }}
          />
          <Button
            variant="secondary"
            aria-pressed={showKey}
            onClick={() => setShowKey((value) => !value)}
          >
            {showKey ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
            {showKey ? "隐藏" : "显示"}
          </Button>
          <Button
            loading={loading === "status"}
            disabled={!apiKey.trim()}
            onClick={() => void testStatus()}
          >
            <FlaskConical className="size-4" />
            测试连接
          </Button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="rounded-2xl border border-slate-200 bg-white p-4"
          aria-labelledby="resources-heading"
        >
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-5 text-blue-600" />
            <div>
              <h3
                id="resources-heading"
                className="font-semibold text-slate-900"
              >
                邮箱与域名
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                验证 mailbox.read 和 mail.send 权限，并加载后续测试选项。
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              loading={loading === "mailboxes"}
              disabled={disabled}
              onClick={() => void loadMailboxes()}
            >
              查看邮箱
            </Button>
            <Button
              variant="secondary"
              loading={loading === "domains"}
              disabled={disabled}
              onClick={() => void loadDomains()}
            >
              查看域名
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            已加载 {mailboxes.length} 个邮箱、{domains.length} 个授权域名。
          </p>
        </section>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-4"
          aria-labelledby="messages-heading"
        >
          <div className="flex items-start gap-3">
            <Inbox className="mt-0.5 size-5 text-blue-600" />
            <div>
              <h3
                id="messages-heading"
                className="font-semibold text-slate-900"
              >
                邮件列表与筛选
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                读取收件或发件记录，收件记录支持邮箱筛选。
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              方向
              <select
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as "received" | "sent")
                }
              >
                <option value="received">收件</option>
                <option value="sent">发件</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              邮箱筛选
              <select
                className="h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
                value={mailboxId}
                disabled={direction === "sent"}
                onChange={(event) => setMailboxId(event.target.value)}
              >
                <option value="">全部邮箱</option>
                {mailboxes.map((mailbox) => (
                  <option key={mailbox.id} value={mailbox.id}>
                    {mailbox.address}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              游标（可选）
              <Input
                value={cursor}
                inputMode="numeric"
                onChange={(event) => setCursor(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              数量（1–50）
              <Input
                value={limit}
                inputMode="numeric"
                onChange={(event) => setLimit(event.target.value)}
              />
            </label>
          </div>
          <Button
            className="mt-4 w-full"
            loading={loading === "messages"}
            disabled={disabled}
            onClick={() => void listMessages()}
          >
            查看邮件
          </Button>
        </section>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-4"
          aria-labelledby="detail-heading"
        >
          <h3 id="detail-heading" className="font-semibold text-slate-900">
            邮件详情
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            按消息 ID 验证详情和附件元数据。
          </p>
          <label className="mt-4 grid gap-1 text-xs font-medium text-slate-600">
            消息 ID
            <Input
              value={messageId}
              inputMode="numeric"
              placeholder="例如 123"
              onChange={(event) => setMessageId(event.target.value)}
            />
          </label>
          <Button
            className="mt-3 w-full"
            variant="secondary"
            loading={loading === "detail"}
            disabled={disabled || !/^\d+$/.test(messageId)}
            onClick={() => void getMessage()}
          >
            查看详情
          </Button>
        </section>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-4"
          aria-labelledby="send-test-heading"
        >
          <div className="flex items-start gap-3">
            <Send className="mt-0.5 size-5 text-blue-600" />
            <div>
              <h3
                id="send-test-heading"
                className="font-semibold text-slate-900"
              >
                发送真实测试邮件
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                提交前会再次显示发件人与收件人并要求确认。
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <fieldset>
              <legend className="text-xs font-medium text-slate-600">
                发件方式
              </legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Button
                  variant={senderMode === "dynamic" ? "primary" : "secondary"}
                  aria-pressed={senderMode === "dynamic"}
                  onClick={() => setSenderMode("dynamic")}
                >
                  任意前缀
                </Button>
                <Button
                  variant={senderMode === "mailbox" ? "primary" : "secondary"}
                  aria-pressed={senderMode === "mailbox"}
                  onClick={() => setSenderMode("mailbox")}
                >
                  注册邮箱
                </Button>
              </div>
            </fieldset>
            {senderMode === "dynamic" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  邮箱前缀
                  <Input
                    value={localPart}
                    onChange={(event) => setLocalPart(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  授权域名
                  <select
                    className="h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                  >
                    <option value="">选择域名</option>
                    {domains.map((item) => (
                      <option key={item} value={item}>
                        @{item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                注册邮箱
                <select
                  className="h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={senderMailboxId}
                  onChange={(event) => setSenderMailboxId(event.target.value)}
                >
                  <option value="">选择邮箱</option>
                  {mailboxes.map((mailbox) => (
                    <option key={mailbox.id} value={mailbox.id}>
                      {mailbox.address}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              收件人
              <Input
                value={to}
                placeholder="name@example.com"
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              主题
              <Input
                value={subject}
                maxLength={998}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              正文
              <textarea
                className="min-h-24 rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <Button
              className="w-full"
              loading={loading === "send"}
              disabled={
                disabled ||
                !recipients.length ||
                !subject.trim() ||
                !text.trim() ||
                (senderMode === "dynamic"
                  ? !localPart.trim() || !domain
                  : !senderMailboxId)
              }
              onClick={() => setSendOpen(true)}
            >
              发送测试邮件
            </Button>
          </div>
        </section>
      </div>

      {result && (
        <section
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          aria-live="polite"
          aria-labelledby="api-result-heading"
        >
          <header className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={`rounded-lg px-2 py-1 text-xs font-bold ${result.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
              >
                HTTP {result.status}
              </span>
              <h3
                id="api-result-heading"
                className="min-w-0 break-all text-sm font-semibold text-slate-800"
              >
                {result.method} {result.path}
              </h3>
            </div>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">耗时</dt>
                <dd className="font-medium text-slate-800">
                  {result.durationMs} ms
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Request ID</dt>
                <dd
                  className="max-w-32 truncate font-medium text-slate-800"
                  title={result.requestId}
                >
                  {result.requestId || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">剩余请求</dt>
                <dd className="font-medium text-slate-800">
                  {result.rateRemaining || "—"}
                  {result.rateLimit ? ` / ${result.rateLimit}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">重置时间</dt>
                <dd className="font-medium text-slate-800">
                  {result.rateReset || "—"}
                </dd>
              </div>
            </dl>
          </header>
          <pre className="m-0 max-h-96 overflow-auto bg-slate-950 p-4 text-xs leading-6 whitespace-pre-wrap break-words text-slate-200">
            <code>{result.body}</code>
          </pre>
        </section>
      )}
      <ConfirmDialog
        open={sendOpen}
        title="发送真实测试邮件？"
        description={`将从 ${senderMode === "mailbox" ? mailboxes.find((mailbox) => String(mailbox.id) === senderMailboxId)?.address || `邮箱 #${senderMailboxId}` : `${localPart}@${domain}`} 向 ${recipients.join(", ")} 发送邮件。`}
        confirmLabel="确认发送"
        loading={loading === "send"}
        onOpenChange={setSendOpen}
        onConfirm={() => void sendMessage()}
      />
    </div>
  );
}
