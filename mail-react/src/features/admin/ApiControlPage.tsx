import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Copy,
  FlaskConical,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import { ApiKeyTester } from "./ApiKeyTester";
import { apiControlApi } from "./apiControlApi";
import type {
  ApiKeyCreateInput,
  ApiKeyRecord,
  ApiKeyStatus,
  ApiScope,
} from "./apiControlTypes";

const apiControlKeys = {
  root: ["api-control"] as const,
  config: () => [...apiControlKeys.root, "config"] as const,
  users: () => [...apiControlKeys.root, "users"] as const,
  list: (page: number, search: string, status: ApiKeyStatus | "") =>
    [...apiControlKeys.root, "list", page, search, status] as const,
  audit: (page: number, apiKeyId: number | undefined) =>
    [...apiControlKeys.root, "audit", page, apiKeyId] as const,
};

type Tab = "keys" | "audit" | "tester";

interface CreateForm {
  name: string;
  userId: string;
  scopes: ApiScope[];
  rateLimit: string;
  expiresAt: string;
  allowedIps: string;
}

const EMPTY_CREATE_FORM: CreateForm = {
  name: "",
  userId: "",
  scopes: ["mail.read"],
  rateLimit: "60",
  expiresAt: "",
  allowedIps: "",
};

const scopeLabels: Record<ApiScope, string> = {
  "mail.read": "读取邮件",
  "mail.send": "发送邮件",
  "mailbox.read": "读取邮箱",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(
    /(?:z|[+-]\d\d:?\d\d)$/i.test(value)
      ? value
      : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function statusText(status: ApiKeyStatus, expiresAt: string | null): string {
  if (status === -1) return "已吊销";
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "已过期";
  return status === 1 ? "已启用" : "已停用";
}

function errorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试。",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function Pagination({
  page,
  total,
  size,
  onChange,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3"
      aria-label="分页"
    >
      <span className="text-xs text-slate-500">
        第 {page} / {pages} 页，共 {total} 条
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </nav>
  );
}

export function ApiControlPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("keys");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApiKeyStatus | "">("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditKeyId, setAuditKeyId] = useState<number>();
  const [createOpen, setCreateOpen] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState("");
  const [testerKey, setTesterKey] = useState("");
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyRecord>();

  const config = useQuery({
    queryKey: apiControlKeys.config(),
    queryFn: ({ signal }) => apiControlApi.config(signal),
  });
  const users = useQuery({
    queryKey: apiControlKeys.users(),
    queryFn: ({ signal }) => apiControlApi.users(signal),
    staleTime: 60_000,
  });
  const keys = useQuery({
    queryKey: apiControlKeys.list(page, search, status),
    queryFn: ({ signal }) =>
      apiControlApi.keys({ page, size: 20, search, status }, signal),
  });
  const audit = useQuery({
    queryKey: apiControlKeys.audit(auditPage, auditKeyId),
    queryFn: ({ signal }) =>
      apiControlApi.audit(
        { page: auditPage, size: 30, apiKeyId: auditKeyId },
        signal,
      ),
    enabled: tab === "audit",
  });

  const setConfig = useMutation({
    mutationFn: (enabled: boolean) => apiControlApi.setConfig(enabled),
    onSuccess: (data) =>
      queryClient.setQueryData(apiControlKeys.config(), data),
  });
  const setKeyStatus = useMutation({
    mutationFn: ({
      apiKeyId,
      enabled,
    }: {
      apiKeyId: number;
      enabled: boolean;
    }) => apiControlApi.setKeyStatus(apiKeyId, enabled ? 1 : 0),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: apiControlKeys.root }),
  });
  const revoke = useMutation({
    mutationFn: (apiKeyId: number) => apiControlApi.revokeKey(apiKeyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: apiControlKeys.root }),
  });
  const create = useMutation({
    mutationFn: (input: ApiKeyCreateInput) => apiControlApi.createKey(input),
    onSuccess: async (data) => {
      setCreatedSecret(data.secret);
      setCreateOpen(false);
      setSecretOpen(true);
      setCreateForm(EMPTY_CREATE_FORM);
      await queryClient.invalidateQueries({ queryKey: apiControlKeys.root });
    },
  });

  const operationError =
    config.error ||
    users.error ||
    keys.error ||
    audit.error ||
    setConfig.error ||
    setKeyStatus.error ||
    revoke.error ||
    create.error;
  const apiBaseUrl =
    typeof window === "undefined"
      ? "/api/v1"
      : `${window.location.origin}/api/v1`;
  const activeKeys = useMemo(
    () => keys.data?.list.filter((key) => key.status === 1) ?? [],
    [keys.data?.list],
  );

  function openCreate() {
    setFormError("");
    setCreateForm({
      ...EMPTY_CREATE_FORM,
      userId: users.data?.[0] ? String(users.data[0].userId) : "",
    });
    setCreateOpen(true);
  }

  function toggleScope(scope: ApiScope) {
    setCreateForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope],
    }));
  }

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    const userId = Number(createForm.userId);
    const rateLimit = Number(createForm.rateLimit);
    if (!createForm.name.trim() || createForm.name.trim().length > 50)
      return setFormError("密钥名称应为 1–50 个字符。");
    if (!Number.isInteger(userId) || userId < 1)
      return setFormError("请选择绑定账户。");
    if (!createForm.scopes.length)
      return setFormError("至少选择一个权限范围。");
    if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 1000)
      return setFormError("速率限制应为每分钟 1–1000 次。");
    const expiresAt = createForm.expiresAt
      ? new Date(createForm.expiresAt)
      : null;
    if (
      expiresAt &&
      (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())
    )
      return setFormError("过期时间必须晚于当前时间。");
    setFormError("");
    create.mutate({
      name: createForm.name.trim(),
      userId,
      scopes: createForm.scopes,
      rateLimit,
      expiresAt: expiresAt?.toISOString() || null,
      allowedIps: [
        ...new Set(
          createForm.allowedIps
            .split(/[\s,]+/)
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
    });
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label}已复制`);
    } catch {
      setNotice("复制失败，请手动选择文本复制。");
    }
  }

  function useCreatedKey() {
    setTesterKey(createdSecret);
    setCreatedSecret("");
    setSecretOpen(false);
    setTab("tester");
  }

  return (
    <main
      className="h-full min-h-0 overflow-y-auto bg-slate-50"
      aria-labelledby="api-control-heading"
    >
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              id="api-control-heading"
              className="text-xl font-semibold tracking-tight text-slate-950"
            >
              API 控制
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              管理公共 API、访问密钥、调用审计与本地测试。
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            创建密钥
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        {(operationError || formError) && (
          <div
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
            role="alert"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {formError || errorMessage(operationError)}
          </div>
        )}
        {notice && (
          <p className="sr-only" aria-live="polite">
            {notice}
          </p>
        )}

        <section
          className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(13rem,.65fr)_minmax(13rem,.65fr)]"
          aria-label="API 概览"
        >
          <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${config.data?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
              >
                <Power className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-950">公共 API</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {config.data?.enabled
                    ? "服务已启用，活动密钥可以调用接口。"
                    : "服务已停用，所有公共 API 请求都会被拒绝。"}
                </p>
              </div>
              <Button
                size="sm"
                variant={config.data?.enabled ? "secondary" : "primary"}
                loading={setConfig.isPending}
                disabled={!config.data}
                onClick={() => setConfig.mutate(!config.data?.enabled)}
              >
                {config.data?.enabled ? "停用服务" : "启用服务"}
              </Button>
            </div>
            <div className="mt-4 flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs text-slate-700">
                {apiBaseUrl}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="size-10"
                aria-label="复制 API 地址"
                onClick={() => void copy(apiBaseUrl, "API 地址")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <KeyRound className="size-5 text-blue-600" />
            <p className="mt-4 text-xs font-medium text-slate-500">活动密钥</p>
            <strong className="mt-1 block text-3xl font-semibold text-slate-950">
              {config.data?.activeKeys ?? 0}
            </strong>
            <small className="text-xs text-slate-500">
              共 {config.data?.totalKeys ?? 0} 个
            </small>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <Activity className="size-5 text-blue-600" />
            <p className="mt-4 text-xs font-medium text-slate-500">
              24 小时调用
            </p>
            <strong className="mt-1 block text-3xl font-semibold text-slate-950">
              {config.data?.calls24h ?? 0}
            </strong>
            <small className="text-xs text-slate-500">
              失败 {config.data?.errors24h ?? 0} 次
            </small>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div
              className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
              role="tablist"
              aria-label="API 控制"
            >
              {(
                [
                  ["keys", "密钥", KeyRound],
                  ["audit", "审计", ScrollText],
                  ["tester", "测试器", FlaskConical],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  onClick={() => setTab(value)}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            {tab === "keys" && (
              <form
                className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_9rem_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
              >
                <Input
                  value={searchInput}
                  placeholder="搜索名称、账户或前缀"
                  aria-label="搜索 API 密钥"
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <select
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={status}
                  aria-label="密钥状态"
                  onChange={(event) => {
                    setPage(1);
                    setStatus(
                      event.target.value === ""
                        ? ""
                        : (Number(event.target.value) as ApiKeyStatus),
                    );
                  }}
                >
                  <option value="">全部状态</option>
                  <option value="1">已启用</option>
                  <option value="0">已停用</option>
                  <option value="-1">已吊销</option>
                </select>
                <Button type="submit" variant="secondary">
                  <RefreshCw className="size-4" />
                  查询
                </Button>
              </form>
            )}
          </div>

          {tab === "keys" && (
            <div role="tabpanel">
              {keys.isPending ? (
                <div
                  className="p-10 text-center text-sm text-slate-500"
                  role="status"
                >
                  正在加载 API 密钥…
                </div>
              ) : !keys.data?.list.length ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  没有符合条件的 API 密钥。
                </div>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {keys.data.list.map((key) => {
                    const expired = Boolean(
                      key.expiresAt &&
                      new Date(key.expiresAt).getTime() <= Date.now(),
                    );
                    return (
                      <li key={key.apiKeyId} className="p-4 sm:p-5">
                        <article>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold text-slate-950">
                                  {key.name}
                                </h3>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${key.status === 1 && !expired ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                                >
                                  {statusText(key.status, key.expiresAt)}
                                </span>
                              </div>
                              <code className="mt-1 block text-xs text-slate-500">
                                {key.keyHint}
                              </code>
                            </div>
                            <div className="flex gap-2">
                              {key.status !== -1 && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={expired || setKeyStatus.isPending}
                                  onClick={() =>
                                    setKeyStatus.mutate({
                                      apiKeyId: key.apiKeyId,
                                      enabled: key.status !== 1,
                                    })
                                  }
                                >
                                  {key.status === 1 ? "停用" : "启用"}
                                </Button>
                              )}
                              {key.status !== -1 && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={revoke.isPending}
                                  onClick={() => setPendingRevoke(key)}
                                >
                                  <Trash2 className="size-4" />
                                  吊销
                                </Button>
                              )}
                            </div>
                          </div>
                          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <dt className="text-xs text-slate-500">
                                绑定账户
                              </dt>
                              <dd className="mt-1 min-w-0 truncate text-slate-800">
                                {key.displayName || key.username}{" "}
                                <span className="text-slate-500">
                                  @{key.username}
                                </span>
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">
                                权限范围
                              </dt>
                              <dd className="mt-1 flex flex-wrap gap-1">
                                {key.scopes.map((scope) => (
                                  <span
                                    key={scope}
                                    className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800"
                                  >
                                    {scopeLabels[scope]}
                                  </span>
                                ))}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">
                                限制 / IP
                              </dt>
                              <dd className="mt-1 text-slate-800">
                                {key.rateLimit} 次/分钟 ·{" "}
                                {key.allowedIps.length
                                  ? key.allowedIps.join(", ")
                                  : "不限 IP"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-slate-500">
                                最近使用 / 过期
                              </dt>
                              <dd className="mt-1 text-slate-800">
                                {formatDate(key.lastUsedAt)} ·{" "}
                                {key.expiresAt
                                  ? formatDate(key.expiresAt)
                                  : "永不过期"}
                              </dd>
                            </div>
                          </dl>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Pagination
                page={page}
                total={keys.data?.total ?? 0}
                size={20}
                onChange={setPage}
              />
            </div>
          )}

          {tab === "audit" && (
            <div role="tabpanel">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
                <label
                  className="text-xs font-medium text-slate-600"
                  htmlFor="audit-key-filter"
                >
                  密钥筛选
                </label>
                <select
                  id="audit-key-filter"
                  className="h-10 min-w-48 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={auditKeyId || ""}
                  onChange={(event) => {
                    setAuditPage(1);
                    setAuditKeyId(
                      event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    );
                  }}
                >
                  <option value="">全部密钥</option>
                  {activeKeys.map((key) => (
                    <option key={key.apiKeyId} value={key.apiKeyId}>
                      {key.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-10"
                  aria-label="刷新审计"
                  onClick={() => void audit.refetch()}
                >
                  <RefreshCw
                    className={`size-4 ${audit.isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
              {audit.isPending ? (
                <div
                  className="p-10 text-center text-sm text-slate-500"
                  role="status"
                >
                  正在加载调用审计…
                </div>
              ) : !audit.data?.list.length ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  暂无调用记录。
                </div>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {audit.data.list.map((row) => (
                    <li key={row.logId} className="p-4">
                      <article className="grid gap-3 text-sm lg:grid-cols-[10rem_minmax(12rem,1fr)_6rem_8rem_12rem] lg:items-center">
                        <div>
                          <strong className="block truncate text-slate-900">
                            {row.keyName || `密钥 #${row.apiKeyId}`}
                          </strong>
                          <span className="text-xs text-slate-500">
                            {formatDate(row.createTime)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <code className="break-all text-xs text-slate-800">
                            {row.method} {row.path}
                          </code>
                          <span
                            className="mt-1 block truncate text-xs text-slate-500"
                            title={row.requestId}
                          >
                            {row.requestId}
                          </span>
                        </div>
                        <span
                          className={`w-fit rounded-lg px-2 py-1 text-xs font-bold ${row.statusCode < 400 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}
                        >
                          {row.statusCode}
                        </span>
                        <span className="text-xs text-slate-600">
                          {row.durationMs} ms
                        </span>
                        <span
                          className="truncate text-xs text-slate-600"
                          title={row.ip}
                        >
                          {row.ip}
                        </span>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination
                page={auditPage}
                total={audit.data?.total ?? 0}
                size={30}
                onChange={setAuditPage}
              />
            </div>
          )}

          {tab === "tester" && (
            <div className="p-4 sm:p-5">
              <ApiKeyTester initialKey={testerKey} />
            </div>
          )}
        </section>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>创建 API 密钥</DialogTitle>
            <DialogDescription>
              密钥只会完整显示一次。权限范围和绑定账户共同决定实际能力。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitCreate}>
            {formError && (
              <p className="text-sm text-red-700" role="alert">
                {formError}
              </p>
            )}
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              密钥名称
              <Input
                value={createForm.name}
                maxLength={50}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              绑定平台账户
              <select
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                value={createForm.userId}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    userId: event.target.value,
                  }))
                }
              >
                <option value="">选择账户</option>
                {users.data?.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.displayName
                      ? `${user.displayName} (@${user.username})`
                      : user.username}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                权限范围
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(Object.keys(scopeLabels) as ApiScope[]).map((scope) => (
                  <label
                    key={scope}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={createForm.scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    {scopeLabels[scope]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                每分钟请求数
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={createForm.rateLimit}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      rateLimit: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                过期时间（可选）
                <Input
                  type="datetime-local"
                  value={createForm.expiresAt}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              IP 白名单（可选）
              <textarea
                className="min-h-20 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={createForm.allowedIps}
                placeholder="每行或逗号分隔，最多 20 个"
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    allowedIps: event.target.value,
                  }))
                }
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" loading={create.isPending}>
                创建密钥
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={secretOpen}
        onOpenChange={(open) => {
          setSecretOpen(open);
          if (!open) setCreatedSecret("");
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>API 密钥已创建</DialogTitle>
            <DialogDescription>
              请立即复制。关闭后无法再次查看完整密钥，只能重新创建。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>只显示这一次</strong>
            <p className="mt-1">不要将密钥写入前端代码、聊天记录或公开仓库。</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-950 p-3">
            <code className="min-w-0 flex-1 break-all text-xs text-slate-100">
              {createdSecret}
            </code>
            <Button
              size="icon"
              variant="secondary"
              aria-label="复制密钥"
              onClick={() => void copy(createdSecret, "API 密钥")}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => void copy(createdSecret, "API 密钥")}
            >
              复制密钥
            </Button>
            <Button onClick={useCreatedKey}>
              <FlaskConical className="size-4" />
              立即测试
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        title="吊销 API 密钥？"
        description={`密钥“${pendingRevoke?.name || ""}”将立即失效且无法恢复。`}
        confirmLabel="吊销密钥"
        destructive
        loading={revoke.isPending}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(undefined);
        }}
        onConfirm={() =>
          pendingRevoke &&
          revoke.mutate(pendingRevoke.apiKeyId, {
            onSuccess: () => setPendingRevoke(undefined),
          })
        }
      />
    </main>
  );
}
