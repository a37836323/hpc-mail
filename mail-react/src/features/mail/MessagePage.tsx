import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Forward,
  ImageOff,
  LoaderCircle,
  Paperclip,
  Reply,
  Star,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, ConfirmDialog } from "@/components/ui";
import { EmailHtml } from "@/lib/email-html";
import { openForward, openReply } from "@/features/composer/composerStore";
import { mailApi } from "./mailApi";
import { mailKeys } from "./queryKeys";
import type { MailMessage } from "./types";
import {
  formatBytes,
  formatDate,
  objectUrl,
  readableError,
  recipientsOf,
  resolveEmailHtml,
  trustedImageOrigins,
} from "./utils";

interface LocationState {
  message?: MailMessage;
}

export interface MessagePageProps {
  message?: MailMessage;
  onBack?: () => void;
}

function deliveryMessage(message: MailMessage): string {
  if (message.status === 4) return "收件人已将这封邮件标记为垃圾邮件。";
  if (message.status === 5) return "邮件投递延迟，服务端仍会继续尝试。";
  if (message.status !== 3) return "";
  try {
    const parsed = JSON.parse(message.message || "{}") as { message?: string };
    return parsed.message || "邮件投递失败。";
  } catch {
    return "邮件投递失败。";
  }
}

export function MessagePage({
  message: messageProp,
  onBack,
}: MessagePageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const routeMessage = (location.state as LocationState | null)?.message;
  const message = messageProp || routeMessage;
  const [isStar, setIsStar] = useState(Boolean(message?.isStar));
  const [allowRemoteImages, setAllowRemoteImages] = useState(true);
  const [actionError, setActionError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const config = useQuery({
    queryKey: mailKeys.config(),
    queryFn: ({ signal }) => mailApi.websiteConfig(signal),
    staleTime: 60_000,
  });
  const attachments = useQuery({
    queryKey: mailKeys.attachments(message?.emailId ?? 0),
    queryFn: ({ signal }) => mailApi.attachments(message!.emailId, signal),
    enabled: Boolean(message?.emailId),
    initialData: message?.attList,
  });

  useEffect(() => {
    setIsStar(Boolean(message?.isStar));
  }, [message?.emailId, message?.isStar]);

  useEffect(() => {
    if (!message || message.type === 1 || message.unread !== 0) return;
    void mailApi
      .markRead([message.emailId])
      .then(() => queryClient.invalidateQueries({ queryKey: mailKeys.root }))
      .catch(() => undefined);
  }, [message, queryClient]);

  const starMutation = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? mailApi.addStar(message!.emailId)
        : mailApi.cancelStar(message!.emailId),
    onMutate: (next) => {
      setActionError("");
      setIsStar(next);
    },
    onError: (error, next) => {
      setIsStar(!next);
      setActionError(readableError(error, "收藏状态更新失败，请重试。"));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.root }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => mailApi.remove([message!.emailId]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mailKeys.root });
      if (onBack) onBack();
      else navigate(-1);
    },
    onError: (error) =>
      setActionError(readableError(error, "删除失败，请重试。")),
  });

  const attachmentList = useMemo(
    () => attachments.data ?? message?.attList ?? [],
    [attachments.data, message?.attList],
  );
  const delivery = message ? deliveryMessage(message) : "";

  if (!message) {
    return (
      <main className="app-page grid h-full min-h-80 place-items-center text-center">
        <div className="app-panel max-w-md p-8">
          <h1 className="text-lg font-semibold text-slate-950">
            无法打开这封邮件
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            邮件详情不会保存在浏览器中。请返回邮件列表后重新打开。
          </p>
          <Button
            className="mt-5"
            variant="secondary"
            onClick={() => (onBack ? onBack() : navigate("/inbox"))}
          >
            返回收件箱
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="app-page flex h-full min-h-0 flex-col gap-3 overflow-hidden"
      aria-labelledby="message-subject"
    >
      <header
        className="app-panel mx-auto flex min-h-12 w-full max-w-5xl shrink-0 items-center gap-1 px-2 sm:px-3"
        aria-label="邮件操作"
      >
        <Button
          size="icon"
          variant="ghost"
          className="size-10"
          aria-label="返回"
          onClick={() => (onBack ? onBack() : navigate(-1))}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-10 text-slate-500 hover:bg-red-50 hover:text-red-700"
          aria-label="删除邮件"
          loading={deleteMutation.isPending}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-10"
          aria-label={isStar ? "取消收藏" : "收藏邮件"}
          disabled={starMutation.isPending}
          onClick={() => starMutation.mutate(!isStar)}
        >
          <Star
            className={`size-4.5 ${isStar ? "fill-amber-400 text-amber-500" : ""}`}
          />
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          className="min-h-10 px-3"
          onClick={() => openReply(message)}
        >
          <Reply className="size-4.5" />
          <span className="hidden sm:inline">回复</span>
        </Button>
        <Button
          variant="ghost"
          className="min-h-10 px-3"
          onClick={() => openForward(message)}
        >
          <Forward className="size-4.5" />
          <span className="hidden sm:inline">转发</span>
        </Button>
      </header>

      {actionError && (
        <div
          className="mx-auto w-full max-w-5xl shrink-0 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="app-panel mx-auto min-h-full w-full max-w-5xl overflow-hidden sm:min-h-0">
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-6 sm:px-7 sm:py-7">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              邮件详情
            </p>
            <h1
              id="message-subject"
              className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]"
            >
              {message.subject || "无主题"}
            </h1>
            <dl className="mt-6 grid gap-2 text-sm">
              <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3">
                <dt className="font-medium text-slate-500">发件人</dt>
                <dd className="min-w-0 break-words text-slate-800">
                  <strong>{message.name || message.sendEmail}</strong>
                  {message.name && (
                    <span className="ms-2 text-slate-500">
                      &lt;{message.sendEmail}&gt;
                    </span>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3">
                <dt className="font-medium text-slate-500">收件人</dt>
                <dd className="min-w-0 break-words text-slate-800">
                  {recipientsOf(message)}
                </dd>
              </div>
              <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3">
                <dt className="font-medium text-slate-500">时间</dt>
                <dd className="text-slate-800">
                  {formatDate(message.createTime, true)}
                </dd>
              </div>
            </dl>
            {delivery && (
              <div
                className={`mt-5 rounded-[var(--radius-control)] border px-3 py-2.5 text-sm ${message.status === 3 ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                role="status"
              >
                {delivery}
              </div>
            )}
          </header>

          <section
            className="min-h-56 px-4 py-6 sm:px-7 sm:py-7"
            aria-label="邮件正文"
          >
            <div className="mb-4 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={!allowRemoteImages}
                onClick={() => setAllowRemoteImages((value) => !value)}
              >
                <ImageOff className="size-4" />
                {allowRemoteImages ? "阻止远程图片" : "显示远程图片"}
              </Button>
            </div>
            {message.content ? (
              <EmailHtml
                html={resolveEmailHtml(message.content, config.data)}
                trustedImageOrigins={trustedImageOrigins(config.data)}
                allowRemoteImages={allowRemoteImages}
              />
            ) : (
              <pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-800">
                {message.text || "（空邮件）"}
              </pre>
            )}
          </section>

          {(attachments.isPending || attachmentList.length > 0) && (
            <section
              className="mx-4 mb-6 border-t border-slate-200 pt-5 sm:mx-8 sm:mb-8"
              aria-labelledby="attachments-heading"
            >
              <div className="flex items-center gap-2">
                <Paperclip className="size-4.5 text-slate-500" />
                <h2
                  id="attachments-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  附件
                </h2>
                {!attachments.isPending && (
                  <span className="text-xs text-slate-500">
                    {attachmentList.length} 个
                  </span>
                )}
              </div>
              {attachments.isPending ? (
                <div
                  className="mt-3 flex items-center gap-2 text-sm text-slate-500"
                  role="status"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                  正在加载附件…
                </div>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {attachmentList.map((attachment, index) => (
                    <li
                      key={
                        attachment.attId || `${attachment.filename}-${index}`
                      }
                      className="flex min-h-14 min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-slate-200 px-3 py-2"
                    >
                      <Paperclip className="size-4.5 shrink-0 text-blue-600" />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-medium text-slate-800">
                          {attachment.filename}
                        </strong>
                        <small className="text-xs text-slate-500">
                          {formatBytes(attachment.size)}
                        </small>
                      </span>
                      <a
                        className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500"
                        href={objectUrl(attachment.key, config.data)}
                        download={attachment.filename}
                        aria-label={`下载附件 ${attachment.filename}`}
                      >
                        <Download className="size-4.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {attachments.isError && (
                <p className="mt-3 text-sm text-red-700" role="alert">
                  {readableError(attachments.error, "附件加载失败。")}
                </p>
              )}
            </section>
          )}
        </article>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        title="删除邮件？"
        description={`邮件“${message.subject || "无主题"}”将被永久删除，此操作无法撤销。`}
        confirmLabel="删除邮件"
        destructive
        loading={deleteMutation.isPending}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMutation.mutate()}
      />
    </main>
  );
}
