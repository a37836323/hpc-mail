import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Copy,
  Inbox,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import { TurnstileWidget } from "@/features/auth/TurnstileWidget";
import { mailboxApi } from "./mailboxApi";
import {
  mailboxCreationEnabled,
  mailboxDomains,
  mailboxNeedsVerification,
  validateMailboxLocalPart,
} from "./mailboxRules";
import type { MailboxRecord, MailboxWebsiteConfig } from "./mailboxTypes";
import { useMailboxes } from "./useMailboxes";

const mailboxKeys = {
  list: ["mail", "mailboxes"] as const,
  config: ["mailbox-management", "config"] as const,
  user: ["mailbox-management", "user"] as const,
};

function errorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试。",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function MailboxManagerPage() {
  const queryClient = useQueryClient();
  const mailboxes = useMailboxes();
  const config = useQuery({
    queryKey: mailboxKeys.config,
    queryFn: ({ signal }) => mailboxApi.config(signal),
    staleTime: 60_000,
  });
  const user = useQuery({
    queryKey: mailboxKeys.user,
    queryFn: ({ signal }) => mailboxApi.currentUser(signal),
    staleTime: 60_000,
  });
  const domains = useMemo(
    () => mailboxDomains(config.data, user.data),
    [config.data, user.data],
  );
  const permissions = user.data?.permKeys ?? [];
  const canCreate =
    permissions.includes("*") || permissions.includes("account:add");
  const canDelete =
    permissions.includes("*") || permissions.includes("account:delete");
  const creationEnabled = mailboxCreationEnabled(config.data) && canCreate;
  const needsVerification = mailboxNeedsVerification(config.data);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameMailbox, setRenameMailbox] = useState<MailboxRecord>();
  const [deleteMailbox, setDeleteMailbox] = useState<MailboxRecord>();
  const [localPart, setLocalPart] = useState("");
  const [domain, setDomain] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [createError, setCreateError] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!domains.includes(domain)) setDomain(domains[0] || "");
  }, [domain, domains]);

  const receiveTurnstileToken = useCallback(
    (token: string) => setVerifyToken(token),
    [],
  );

  const createMailbox = useMutation({
    mutationFn: ({ email, token }: { email: string; token: string }) =>
      mailboxApi.create(email, token),
    onSuccess: async (created) => {
      queryClient.setQueryData<MailboxWebsiteConfig>(
        mailboxKeys.config,
        (current) =>
          current
            ? {
                ...current,
                addVerifyOpen: created.addVerifyOpen ?? current.addVerifyOpen,
              }
            : current,
      );
      setNotice(`邮箱 ${created.email} 已创建`);
      setCreateOpen(false);
      setLocalPart("");
      setVerifyToken("");
      await queryClient.invalidateQueries({ queryKey: mailboxKeys.list });
    },
    onError: (error) =>
      setCreateError(errorMessage(error, "邮箱创建失败，请检查地址后重试。")),
    onSettled: () => {
      setVerifyToken("");
      setTurnstileResetKey((value) => value + 1);
    },
  });

  const rename = useMutation({
    mutationFn: ({ accountId, name }: { accountId: number; name: string }) =>
      mailboxApi.rename(accountId, name),
    onSuccess: async () => {
      setNotice("邮箱显示名称已更新");
      setRenameMailbox(undefined);
      await queryClient.invalidateQueries({ queryKey: mailboxKeys.list });
    },
    onError: (error) =>
      setRenameError(errorMessage(error, "重命名失败，请重试。")),
  });

  const pin = useMutation({
    mutationFn: (accountId: number) => mailboxApi.pin(accountId),
    onSuccess: async () => {
      setNotice("邮箱已置顶");
      await queryClient.invalidateQueries({ queryKey: mailboxKeys.list });
    },
  });

  const remove = useMutation({
    mutationFn: (accountId: number) => mailboxApi.remove(accountId),
    onSuccess: async () => {
      setNotice("邮箱已删除");
      setDeleteMailbox(undefined);
      await queryClient.invalidateQueries({ queryKey: mailboxKeys.list });
    },
  });

  function openCreate() {
    setCreateError("");
    setVerifyToken("");
    setTurnstileResetKey((value) => value + 1);
    setDomain((current) =>
      domains.includes(current) ? current : domains[0] || "",
    );
    setCreateOpen(true);
  }

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateMailboxLocalPart(
      localPart,
      config.data?.minEmailPrefix || 1,
    );
    if (validationError) return setCreateError(validationError);
    if (!domain || !domains.includes(domain))
      return setCreateError("请选择当前账户有权使用的域名。");
    if (needsVerification && !verifyToken)
      return setCreateError("请先完成安全验证。");
    setCreateError("");
    createMailbox.mutate({
      email: `${localPart.trim()}@${domain}`,
      token: verifyToken,
    });
  }

  function openRename(mailbox: MailboxRecord) {
    setRenameMailbox(mailbox);
    setRenameValue(mailbox.name || mailbox.email.split("@")[0] || "");
    setRenameError("");
  }

  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const value = renameValue.trim();
    if (!value || value.length > 30 || /[\u0000-\u001f\u007f]/.test(value))
      return setRenameError("显示名称应为 1–30 个可见字符。");
    if (!renameMailbox) return;
    setRenameError("");
    rename.mutate({ accountId: renameMailbox.accountId, name: value });
  }

  async function copyAddress(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setNotice(`已复制 ${email}`);
    } catch {
      setNotice("复制失败，请手动选择邮箱地址。");
    }
  }

  const operationError =
    mailboxes.error || config.error || user.error || pin.error || remove.error;

  return (
    <main
      className="app-page h-full min-h-0 overflow-y-auto"
      aria-labelledby="mailbox-manager-heading"
    >
      <div className="mx-auto w-full max-w-[1480px]">
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              id="mailbox-manager-heading"
              className="app-page-title"
            >
              邮箱管理
            </h1>
            <p className="app-page-description mt-1">
              这里管理平台账户可使用的邮箱地址。平台登录账户与邮箱相互独立，一个账户可以管理多个邮箱。
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              aria-label="刷新邮箱列表"
              disabled={mailboxes.isFetching}
              onClick={() => void mailboxes.refetch()}
            >
              <RefreshCw
                className={`size-4.5 ${mailboxes.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
            {canCreate && (
              <Button
                disabled={
                  !creationEnabled ||
                  !domains.length ||
                  config.isPending ||
                  user.isPending
                }
                onClick={openCreate}
              >
                <Plus className="size-4" />
                创建邮箱
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="w-full space-y-4">
        {!config.isPending &&
          canCreate &&
          !mailboxCreationEnabled(config.data) && (
            <div
              className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              管理员当前已关闭创建多邮箱能力。已有邮箱仍可重命名、置顶或删除。
            </div>
          )}
        {!user.isPending && creationEnabled && !domains.length && (
          <div
            className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            当前账户没有可用于创建邮箱的授权域名，请联系管理员分配域名权限。
          </div>
        )}
        {operationError && (
          <div
            className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {errorMessage(operationError, "邮箱数据加载失败，请重试。")}
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {notice}
        </p>

        <section
          className="app-panel overflow-hidden"
          aria-labelledby="mailbox-list-heading"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div>
              <h2
                id="mailbox-list-heading"
                className="font-semibold text-slate-950"
              >
                邮箱地址
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                共 {mailboxes.data?.length ?? 0}{" "}
                个邮箱；置顶后会优先显示在筛选选项中。
              </p>
            </div>
          </div>

          {mailboxes.isPending ? (
            <div
              className="grid min-h-72 place-items-center text-sm text-slate-500"
              role="status"
            >
              正在加载邮箱…
            </div>
          ) : !mailboxes.data?.length ? (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div className="max-w-sm">
                <Inbox
                  className="mx-auto size-9 text-slate-400"
                  strokeWidth={1.6}
                />
                <h3 className="mt-4 font-semibold text-slate-900">
                  还没有邮箱
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  创建邮箱后，可以在收件箱中按地址筛选邮件。
                </p>
                {creationEnabled && domains.length > 0 && (
                  <Button className="mt-5" onClick={openCreate}>
                    <Plus className="size-4" />
                    创建第一个邮箱
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {mailboxes.data.map((mailbox, index) => (
                <li key={mailbox.accountId} className="px-4 py-3">
                  <article className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-blue-50 text-blue-700">
                      <AtSign className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-950">
                          {mailbox.name || mailbox.email.split("@")[0]}
                        </h3>
                        {index === 0 && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                            优先
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-1 truncate text-sm text-slate-500"
                        title={mailbox.email}
                      >
                        {mailbox.email}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-10"
                        aria-label={`复制 ${mailbox.email}`}
                        title="复制地址"
                        onClick={() => void copyAddress(mailbox.email)}
                      >
                        <Copy className="size-4.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-10"
                        aria-label={`重命名 ${mailbox.email}`}
                        title="重命名"
                        onClick={() => openRename(mailbox)}
                      >
                        <Pencil className="size-4.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-10"
                        aria-label={`置顶 ${mailbox.email}`}
                        title="置顶"
                        disabled={pin.isPending || index === 0}
                        onClick={() => pin.mutate(mailbox.accountId)}
                      >
                        <Pin className="size-4.5" />
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-10 text-slate-500 hover:bg-red-50 hover:text-red-700"
                          aria-label={`删除 ${mailbox.email}`}
                          title="删除"
                          onClick={() => setDeleteMailbox(mailbox)}
                        >
                          <Trash2 className="size-4.5" />
                        </Button>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setVerifyToken("");
            setCreateError("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>创建邮箱</DialogTitle>
            <DialogDescription>
              选择授权域名并输入前缀。创建后，发送邮件仍可使用其他合法前缀，不要求先保存成邮箱。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitCreate}>
            {createError && (
              <p
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {createError}
              </p>
            )}
            <div>
              <label
                htmlFor="mailbox-local-part"
                className="text-sm font-medium text-slate-700"
              >
                邮箱地址
              </label>
              <div className="mt-1.5 grid min-h-11 grid-cols-[minmax(0,1fr)_auto_minmax(8rem,.9fr)] items-center rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                <input
                  id="mailbox-local-part"
                  className="h-10 min-w-0 border-0 bg-transparent text-sm outline-none"
                  value={localPart}
                  maxLength={64}
                  autoComplete="off"
                  placeholder="例如 support"
                  onChange={(event) => {
                    setLocalPart(event.target.value);
                    setCreateError("");
                  }}
                />
                <span className="px-2 text-slate-400">@</span>
                <select
                  className="h-10 min-w-0 border-0 bg-transparent text-sm outline-none"
                  value={domain}
                  aria-label="邮箱域名"
                  onChange={(event) => setDomain(event.target.value)}
                >
                  {domains.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                前缀至少 {Math.max(1, config.data?.minEmailPrefix || 1)}{" "}
                个字符，最长 64 个字符。
              </p>
            </div>
            {needsVerification && (
              <TurnstileWidget
                siteKey={config.data?.siteKey || ""}
                resetKey={turnstileResetKey}
                onToken={receiveTurnstileToken}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" loading={createMailbox.isPending}>
                创建邮箱
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameMailbox)}
        onOpenChange={(open) => {
          if (!open) setRenameMailbox(undefined);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重命名邮箱</DialogTitle>
            <DialogDescription>
              邮箱地址不会改变，只修改管理页面中的显示名称。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitRename}>
            {renameError && (
              <p className="text-sm text-red-700" role="alert">
                {renameError}
              </p>
            )}
            <label
              className="grid gap-1.5 text-sm font-medium text-slate-700"
              htmlFor="mailbox-display-name"
            >
              显示名称
              <Input
                id="mailbox-display-name"
                value={renameValue}
                maxLength={30}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  setRenameError("");
                }}
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRenameMailbox(undefined)}
              >
                取消
              </Button>
              <Button type="submit" loading={rename.isPending}>
                保存名称
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteMailbox)}
        onOpenChange={(open) => {
          if (!open) setDeleteMailbox(undefined);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除邮箱</DialogTitle>
            <DialogDescription>
              删除 {deleteMailbox?.email}{" "}
              后，它将从邮箱筛选中移除，且无法继续接收新邮件。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteMailbox(undefined)}
            >
              保留邮箱
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                deleteMailbox && remove.mutate(deleteMailbox.accountId)
              }
            >
              删除邮箱
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
