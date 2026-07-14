import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AtSign,
  FilePlus2,
  LoaderCircle,
  Paperclip,
  Send,
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
import { sanitizeEmailHtml } from "@/lib/email-html";
import { deleteDraft, draftKeys, saveDraft } from "@/features/drafts/draftDb";
import type { DraftRecord } from "@/features/drafts/types";
import { mailApi } from "@/features/mail/mailApi";
import { mailKeys } from "@/features/mail/queryKeys";
import type {
  MailMessage,
  SendAttachment,
  SendMailPayload,
} from "@/features/mail/types";
import {
  authorizedDomains,
  formatBytes,
  isValidEmail,
  isValidLocalPart,
  normalizeDomain,
  readableError,
  resolveEmailHtml,
} from "@/features/mail/utils";
import { useComposerStore } from "./composerStore";

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 25 * 1024 * 1024;

interface ComposeForm {
  draftId?: number;
  name: string;
  localPart: string;
  domain: string;
  recipients: string;
  subject: string;
  body: string;
  sendType: "reply" | "forward" | "";
  emailId?: number;
  attachments: SendAttachment[];
  createdAt?: string;
}

const EMPTY_FORM: ComposeForm = {
  name: "",
  localPart: "",
  domain: "",
  recipients: "",
  subject: "",
  body: "",
  sendType: "",
  attachments: [],
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] || character,
  );
}

function textToHtml(value: string): string {
  return `<div>${escapeHtml(value).replace(/\n/g, "<br>")}</div>`;
}

function subjectWithPrefix(
  subject: string | undefined,
  prefix: "Re" | "Fwd",
): string {
  const source = subject?.trim() || "无主题";
  return new RegExp(`^${prefix}:`, "i").test(source)
    ? source
    : `${prefix}: ${source}`;
}

function quoteMessage(message: MailMessage, configOrigin = ""): string {
  let original = message.text || "";
  if (!original && message.content) {
    const template = document.createElement("template");
    template.innerHTML = sanitizeEmailHtml(
      resolveEmailHtml(message.content, { r2Domain: configOrigin }),
    );
    template.content
      .querySelectorAll("style")
      .forEach((style) => style.remove());
    original = template.content.textContent || "";
  }
  return `\n\n--- 原邮件 ---\n发件人：${message.name || message.sendEmail}\n时间：${message.createTime}\n\n${original.replace(/\s+/g, " ").trim()}`;
}

function recipients(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,，;；\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error(`无法读取附件 ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(
        result.includes(",") ? result.slice(result.indexOf(",") + 1) : result,
      );
    };
    reader.readAsDataURL(file);
  });
}

function draftFromForm(form: ComposeForm, userId: number): DraftRecord {
  const now = new Date().toISOString();
  return {
    draftId: form.draftId,
    userId,
    name: form.name,
    localPart: form.localPart,
    domain: form.domain,
    receiveEmail: recipients(form.recipients),
    subject: form.subject,
    content: textToHtml(form.body),
    text: form.body,
    sendType: form.sendType,
    emailId: form.emailId,
    attachments: form.attachments,
    createdAt: form.createdAt || now,
    updatedAt: now,
  };
}

function formFromDraft(draft: DraftRecord): ComposeForm {
  return {
    draftId: draft.draftId,
    name: draft.name,
    localPart: draft.localPart,
    domain: normalizeDomain(draft.domain),
    recipients: draft.receiveEmail.join(", "),
    subject: draft.subject,
    body: draft.text,
    sendType: draft.sendType,
    emailId: draft.emailId,
    attachments: draft.attachments,
    createdAt: draft.createdAt,
  };
}

export interface ComposeSheetProps {
  userId?: number;
  domains?: string[];
}

export function ComposeSheet({
  userId: userIdProp,
  domains: domainsProp,
}: ComposeSheetProps = {}) {
  const queryClient = useQueryClient();
  const { open, intent, close } = useComposerStore();
  const [form, setForm] = useState<ComposeForm>(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const autosave = useRef<number | undefined>(undefined);
  const wasOpen = useRef(false);
  const config = useQuery({
    queryKey: mailKeys.config(),
    queryFn: ({ signal }) => mailApi.websiteConfig(signal),
    enabled: open && !domainsProp,
    staleTime: 60_000,
  });
  const user = useQuery({
    queryKey: mailKeys.user(),
    queryFn: ({ signal }) => mailApi.currentUser(signal),
    enabled: open && (!userIdProp || !domainsProp),
    staleTime: 60_000,
  });
  const userId = userIdProp || user.data?.userId;
  const domains = useMemo(() => {
    if (domainsProp) return domainsProp.map(normalizeDomain).filter(Boolean);
    const wildcard = user.data?.permKeys?.includes("*") ?? false;
    return authorizedDomains(
      config.data?.domainList,
      user.data?.role?.availDomain,
      wildcard,
    );
  }, [
    config.data?.domainList,
    domainsProp,
    user.data?.permKeys,
    user.data?.role?.availDomain,
  ]);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    let next: ComposeForm = { ...EMPTY_FORM, attachments: [] };
    if (intent.kind === "draft") next = formFromDraft(intent.draft);
    if (intent.kind === "reply") {
      next = {
        ...next,
        recipients: intent.message.sendEmail,
        subject: subjectWithPrefix(intent.message.subject, "Re"),
        body: quoteMessage(intent.message, config.data?.r2Domain),
        sendType: "reply",
        emailId: intent.message.emailId,
      };
    }
    if (intent.kind === "forward") {
      next = {
        ...next,
        subject: subjectWithPrefix(intent.message.subject, "Fwd"),
        body: quoteMessage(intent.message, config.data?.r2Domain),
        sendType: "forward",
      };
    }
    setForm(next);
    setDirty(false);
    setError("");
    setFieldErrors({});
  }, [config.data?.r2Domain, intent, open]);

  useEffect(() => {
    if (!open || form.domain || !domains[0]) return;
    setForm((current) =>
      current.domain ? current : { ...current, domain: domains[0] || "" },
    );
  }, [domains, form.domain, open]);

  useEffect(() => {
    window.clearTimeout(autosave.current);
    if (
      !open ||
      !dirty ||
      !userId ||
      !(form.body || form.subject || form.recipients || form.attachments.length)
    )
      return;
    autosave.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await saveDraft(draftFromForm(form, userId));
        setForm((current) => ({
          ...current,
          draftId: saved.draftId,
          createdAt: saved.createdAt,
        }));
        setDirty(false);
        await queryClient.invalidateQueries({ queryKey: draftKeys.root });
      } catch (reason) {
        setError(readableError(reason, "草稿自动保存失败。"));
      } finally {
        setSaving(false);
      }
    }, 2_000);
    return () => window.clearTimeout(autosave.current);
  }, [dirty, form, open, queryClient, userId]);

  const sendMutation = useMutation({
    mutationFn: (payload: SendMailPayload) => mailApi.send(payload),
  });

  function update<K extends keyof ComposeForm>(key: K, value: ComposeForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError("");
    const files = Array.from(fileList);
    if (form.attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`最多添加 ${MAX_ATTACHMENTS} 个附件。`);
      return;
    }
    if (files.some((file) => file.size > MAX_ATTACHMENT_SIZE)) {
      setError("单个附件不能超过 25 MB。");
      return;
    }
    const total =
      form.attachments.reduce((sum, item) => sum + item.size, 0) +
      files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TOTAL_ATTACHMENT_SIZE) {
      setError("附件总大小不能超过 25 MB。");
      return;
    }
    try {
      const additions = await Promise.all(
        files.map(
          async (file): Promise<SendAttachment> => ({
            filename: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            content: await fileToBase64(file),
          }),
        ),
      );
      update("attachments", [...form.attachments, ...additions]);
    } catch (reason) {
      setError(readableError(reason, "附件读取失败，请重新选择。"));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function validate(): { valid: boolean; recipientList: string[] } {
    const recipientList = recipients(form.recipients);
    const errors: Record<string, string> = {};
    if (!isValidLocalPart(form.localPart))
      errors.localPart =
        "请输入合法前缀，不能以点开头或结尾，也不能包含连续的点。";
    if (!form.domain || !domains.includes(form.domain))
      errors.domain = "请选择当前账户有权使用的域名。";
    if (
      !recipientList.length ||
      recipientList.some((item) => !isValidEmail(item))
    )
      errors.recipients = "请输入有效收件人，多个地址可用逗号分隔。";
    else if (recipientList.length > 100)
      errors.recipients = "单封邮件最多支持 100 个收件人。";
    if (!form.subject.trim()) errors.subject = "请填写邮件主题。";
    if (!form.body.trim()) errors.body = "请填写邮件正文。";
    else if (new TextEncoder().encode(form.body).byteLength > 5 * 1024 * 1024)
      errors.body = "邮件正文不能超过 5 MB。";
    setFieldErrors(errors);
    return { valid: Object.keys(errors).length === 0, recipientList };
  }

  async function sendMail() {
    setError("");
    const { valid, recipientList } = validate();
    if (!valid || sendMutation.isPending) return;
    const sendEmail = `${form.localPart}@${form.domain}`;
    try {
      await sendMutation.mutateAsync({
        accountId: 0,
        name: form.name.trim() || form.localPart,
        from: {
          name: form.name.trim(),
          localPart: form.localPart,
          domain: form.domain,
        },
        sendEmail,
        sendType: form.sendType,
        emailId: form.emailId,
        receiveEmail: recipientList,
        subject: form.subject.trim(),
        content: textToHtml(form.body),
        text: form.body,
        attachments: form.attachments,
      });
      if (form.draftId && userId) await deleteDraft(userId, form.draftId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mailKeys.root }),
        queryClient.invalidateQueries({ queryKey: draftKeys.root }),
      ]);
      setDirty(false);
      close();
    } catch (reason) {
      setError(readableError(reason, "发送失败，邮件内容已保留，请稍后重试。"));
      setDirty(true);
    }
  }

  async function saveNow() {
    if (!userId) {
      setError("账户信息尚未加载，暂时无法保存草稿。");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDraft(draftFromForm(form, userId));
      setForm((current) => ({
        ...current,
        draftId: saved.draftId,
        createdAt: saved.createdAt,
      }));
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: draftKeys.root });
    } catch (reason) {
      setError(readableError(reason, "草稿保存失败，请重试。"));
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (sendMutation.isPending) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    close();
  }

  const loadingIdentity =
    (config.isPending && !domainsProp) ||
    (user.isPending && (!userIdProp || !domainsProp));

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent className="!inset-x-0 !bottom-0 !top-auto !max-h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !gap-0 !rounded-b-none !p-0 sm:!left-auto sm:!right-3 sm:!top-auto sm:!w-[min(680px,calc(100vw-2rem))] sm:!rounded-b-[var(--radius-panel)]">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 pe-14">
            <DialogTitle>
              {form.sendType === "reply"
                ? "回复邮件"
                : form.sendType === "forward"
                  ? "转发邮件"
                  : "写邮件"}
            </DialogTitle>
            <DialogDescription>
              使用任意合法前缀和当前账户有权使用的域名发信。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(100dvh-10.5rem)] space-y-5 overflow-y-auto px-5 py-5 sm:max-h-[min(680px,calc(100dvh-13rem))]">
            {error && (
              <div
                className="flex items-start gap-2 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}

            <fieldset
              className="space-y-3"
              disabled={loadingIdentity || sendMutation.isPending}
            >
              <legend className="text-sm font-semibold text-slate-900">
                发件身份
              </legend>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  显示名称
                  <Input
                    value={form.name}
                    maxLength={80}
                    placeholder="可选"
                    onChange={(event) => update("name", event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  邮箱前缀
                  <Input
                    value={form.localPart}
                    maxLength={64}
                    autoComplete="off"
                    placeholder="例如 billing"
                    invalid={Boolean(fieldErrors.localPart)}
                    onChange={(event) =>
                      update("localPart", event.target.value)
                    }
                  />
                  {fieldErrors.localPart && (
                    <span className="text-red-700">
                      {fieldErrors.localPart}
                    </span>
                  )}
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  授权域名
                  <select
                    className="h-10 w-full rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-[border-color,box-shadow] hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-100"
                    value={form.domain}
                    aria-invalid={Boolean(fieldErrors.domain) || undefined}
                    onChange={(event) => update("domain", event.target.value)}
                  >
                    <option value="">选择域名</option>
                    {domains.map((domain) => (
                      <option key={domain} value={domain}>
                        @{domain}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.domain && (
                    <span className="text-red-700">{fieldErrors.domain}</span>
                  )}
                </label>
              </div>
              <p className="flex min-h-6 items-center gap-2 text-xs text-slate-500">
                <AtSign className="size-4" />
                {form.localPart && form.domain
                  ? `发件地址：${form.localPart}@${form.domain}`
                  : "填写前缀并选择域名后生成发件地址"}
              </p>
            </fieldset>

            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                收件人
                <Input
                  value={form.recipients}
                  placeholder="name@example.com，多个地址用逗号分隔"
                  invalid={Boolean(fieldErrors.recipients)}
                  onChange={(event) => update("recipients", event.target.value)}
                />
                {fieldErrors.recipients && (
                  <span className="text-xs text-red-700">
                    {fieldErrors.recipients}
                  </span>
                )}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                主题
                <Input
                  value={form.subject}
                  maxLength={998}
                  placeholder="邮件主题"
                  invalid={Boolean(fieldErrors.subject)}
                  onChange={(event) => update("subject", event.target.value)}
                />
                {fieldErrors.subject && (
                  <span className="text-xs text-red-700">
                    {fieldErrors.subject}
                  </span>
                )}
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                正文
                <textarea
                  className="min-h-52 w-full resize-y rounded-[var(--radius-control)] border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                  value={form.body}
                  placeholder="输入邮件正文"
                  aria-invalid={Boolean(fieldErrors.body) || undefined}
                  onChange={(event) => update("body", event.target.value)}
                />
                {fieldErrors.body && (
                  <span className="text-xs text-red-700">
                    {fieldErrors.body}
                  </span>
                )}
              </label>
            </div>

            <section aria-labelledby="compose-attachments-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3
                    id="compose-attachments-heading"
                    className="text-sm font-semibold text-slate-900"
                  >
                    附件
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    最多 10 个，总计不超过 25 MB。
                  </p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => void addFiles(event.target.files)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInput.current?.click()}
                >
                  <FilePlus2 className="size-4" />
                  添加附件
                </Button>
              </div>
              {!!form.attachments.length && (
                <ul className="mt-3 divide-y divide-slate-200 rounded-[var(--radius-control)] border border-slate-200">
                  {form.attachments.map((attachment, index) => (
                    <li
                      key={`${attachment.filename}-${index}`}
                      className="flex min-h-12 items-center gap-3 px-3 py-2"
                    >
                      <Paperclip className="size-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-medium text-slate-800">
                          {attachment.filename}
                        </strong>
                        <small className="text-xs text-slate-500">
                          {formatBytes(attachment.size)}
                        </small>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-11 text-slate-500 hover:bg-red-50 hover:text-red-700"
                        aria-label={`移除附件 ${attachment.filename}`}
                        onClick={() =>
                          update(
                            "attachments",
                            form.attachments.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <DialogFooter className="flex-row items-center justify-between border-t border-slate-200 px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            <p className="min-w-0 text-xs text-slate-500" role="status">
              {saving
                ? "正在保存草稿…"
                : dirty
                  ? "将在 2 秒后自动保存"
                  : form.draftId
                    ? "草稿已保存"
                    : "输入内容后自动保存"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving || sendMutation.isPending}
                onClick={() => void saveNow()}
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                保存草稿
              </Button>
              <Button
                type="button"
                loading={sendMutation.isPending}
                disabled={loadingIdentity || !domains.length}
                onClick={() => void sendMail()}
              >
                <Send className="size-4" />
                发送邮件
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardOpen}
        title="关闭写信窗口？"
        description="尚未完成自动保存的更改可能丢失。你也可以返回并点击“保存草稿”。"
        confirmLabel="放弃未保存更改"
        cancelLabel="继续编辑"
        destructive
        onOpenChange={setDiscardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          setDirty(false);
          close();
        }}
      />
    </>
  );
}
