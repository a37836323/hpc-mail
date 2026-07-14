import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Inbox,
  LoaderCircle,
  MailOpen,
  Paperclip,
  RefreshCw,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, ConfirmDialog } from "@/components/ui";
import { MailboxFilter, useMailboxes } from "@/features/mailboxes";
import { mailApi } from "./mailApi";
import { mailKeys } from "./queryKeys";
import type { MailListResponse, MailMessage } from "./types";
import { formatDate, readableError, recipientsOf } from "./utils";

const PAGE_SIZE = 30;

type Timeline = "inbox" | "sent" | "starred";

interface MailListPageProps {
  timeline: Timeline;
  title: string;
  description: string;
}

function useMailTimeline(
  timeline: Timeline,
  accountId: number,
  timeSort: 0 | 1,
) {
  return useInfiniteQuery({
    queryKey:
      timeline === "starred"
        ? mailKeys.starred()
        : mailKeys.list(timeline, accountId, timeSort),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }): Promise<MailListResponse> =>
      timeline === "starred"
        ? mailApi.stars(pageParam, PAGE_SIZE, signal)
        : mailApi.list(
            {
              accountId: timeline === "sent" ? 0 : accountId,
              emailId: pageParam,
              timeSort,
              size: PAGE_SIZE,
              type: timeline === "sent" ? 1 : 0,
            },
            signal,
          ),
    getNextPageParam: (page) => {
      if (page.list.length < PAGE_SIZE) return undefined;
      return page.list.at(-1)?.emailId;
    },
    staleTime: 10_000,
  });
}

function messagePeer(message: MailMessage, timeline: Timeline): string {
  return timeline === "sent"
    ? recipientsOf(message)
    : message.name || message.sendEmail || "未知发件人";
}

function EmptyState({ timeline }: { timeline: Timeline }) {
  const Icon =
    timeline === "sent" ? Send : timeline === "starred" ? Star : Inbox;
  const message =
    timeline === "sent"
      ? "发出的邮件会显示在这里。"
      : timeline === "starred"
        ? "收藏重要邮件，之后可以快速找到。"
        : "新邮件会自动汇总到这里，也可以选择一个邮箱筛选。";
  return (
    <div className="grid min-h-72 place-items-center px-6 py-16 text-center">
      <div className="max-w-sm">
        <Icon
          className="mx-auto size-9 text-slate-400"
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          暂无邮件
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div
      className="grid min-h-72 place-items-center px-6 py-16 text-center"
      role="alert"
    >
      <div className="max-w-sm">
        <h2 className="text-base font-semibold text-slate-900">邮件加载失败</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {readableError(error, "请检查网络连接后重试。")}
        </p>
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          重新加载
        </Button>
      </div>
    </div>
  );
}

export function MailListPage({
  timeline,
  title,
  description,
}: MailListPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState(0);
  const [timeSort, setTimeSort] = useState<0 | 1>(0);
  const [actionError, setActionError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MailMessage>();
  const mailboxes = useMailboxes();
  const config = useQuery({
    queryKey: mailKeys.config(),
    queryFn: ({ signal }) => mailApi.websiteConfig(signal),
    staleTime: 60_000,
  });
  const query = useMailTimeline(timeline, accountId, timeSort);
  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.list) ?? [],
    [query.data],
  );

  useEffect(() => {
    if (
      accountId !== 0 &&
      !mailboxes.isPending &&
      !mailboxes.data?.some((item) => item.accountId === accountId)
    ) {
      setAccountId(0);
    }
  }, [accountId, mailboxes.data, mailboxes.isPending]);

  useEffect(() => {
    if (timeline !== "inbox" || timeSort !== 0) return;
    const seconds = config.data?.autoRefresh ?? 0;
    if (seconds <= 1) return;
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void query.refetch();
      },
      Math.max(seconds, 5) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [accountId, config.data?.autoRefresh, query.refetch, timeSort, timeline]);

  const starMutation = useMutation({
    mutationFn: ({ message, next }: { message: MailMessage; next: boolean }) =>
      next
        ? mailApi.addStar(message.emailId)
        : mailApi.cancelStar(message.emailId),
    onMutate: () => setActionError(""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.root }),
    onError: (error) =>
      setActionError(readableError(error, "收藏状态更新失败，请重试。")),
  });

  const deleteMutation = useMutation({
    mutationFn: (message: MailMessage) => mailApi.remove([message.emailId]),
    onMutate: () => setActionError(""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.root }),
    onError: (error) =>
      setActionError(readableError(error, "删除失败，请重试。")),
  });

  const readMutation = useMutation({
    mutationFn: (message: MailMessage) => mailApi.markRead([message.emailId]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.root }),
  });

  function openMessage(message: MailMessage) {
    if (timeline === "inbox" && message.unread === 0)
      readMutation.mutate(message);
    navigate(`/message?emailId=${message.emailId}`, { state: { message } });
  }

  return (
    <main
      className="app-page flex h-full min-h-0 flex-col overflow-hidden"
      aria-labelledby={`${timeline}-heading`}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1480px] flex-col gap-3">
      <header className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              id={`${timeline}-heading`}
              className="app-page-title"
            >
              {title}
            </h1>
            <p className="app-page-description mt-1">{description}</p>
          </div>
          <div className="flex min-h-11 items-center gap-1">
            {timeline !== "starred" && (
              <Button
                size="icon"
                variant="ghost"
                aria-label={timeSort === 0 ? "改为最早优先" : "改为最新优先"}
                title={timeSort === 0 ? "改为最早优先" : "改为最新优先"}
                onClick={() => setTimeSort((value) => (value === 0 ? 1 : 0))}
              >
                {timeSort === 0 ? (
                  <ArrowUpNarrowWide className="size-5" />
                ) : (
                  <ArrowDownNarrowWide className="size-5" />
                )}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              aria-label="刷新邮件"
              title="刷新邮件"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                className={`size-5 ${query.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
        {timeline === "inbox" && (
          <div className="mt-3 max-w-sm">
            <MailboxFilter
              mailboxes={mailboxes.data ?? []}
              value={accountId}
              loading={mailboxes.isPending}
              onChange={setAccountId}
            />
          </div>
        )}
      </header>

      {actionError && (
        <div
          className="shrink-0 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <section
        className="app-panel min-h-0 flex-1 overflow-y-auto"
        aria-label={`${title}邮件列表`}
      >
        {query.isPending ? (
          <div
            className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-500"
            role="status"
          >
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            正在加载邮件…
          </div>
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : messages.length === 0 ? (
          <EmptyState timeline={timeline} />
        ) : (
          <ul className="divide-y divide-slate-200 bg-white">
            {messages.map((message) => {
              const unread = timeline === "inbox" && message.unread === 0;
              return (
                <li
                  key={message.emailId}
                  className={unread ? "bg-blue-50/40" : undefined}
                >
                  <article className="group relative flex min-h-[76px] items-stretch sm:min-h-[64px]">
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-3 py-3 text-left outline-none transition-colors hover:bg-slate-50 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:grid sm:grid-cols-[minmax(12rem,0.72fr)_minmax(14rem,1.4fr)_auto] sm:items-center sm:gap-4 sm:px-4"
                      onClick={() => openMessage(message)}
                      aria-label={`打开邮件：${message.subject || "无主题"}`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${unread ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`} aria-hidden>
                          {messagePeer(message, timeline).slice(0, 1).toUpperCase()}
                        </span>
                        {unread && (
                          <span
                            className="sr-only"
                            aria-label="未读"
                          />
                        )}
                        <strong
                          className={`truncate text-sm ${unread ? "font-semibold text-slate-950" : "font-medium text-slate-700"}`}
                        >
                          {messagePeer(message, timeline)}
                        </strong>
                      </span>
                      <span className="mt-1 block min-w-0 sm:mt-0">
                        <span
                          className={`block truncate text-sm ${unread ? "font-semibold text-slate-950" : "text-slate-700"}`}
                        >
                          {message.subject || "无主题"}
                        </span>
                        {message.text && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {message.text}
                          </span>
                        )}
                      </span>
                      <span className="mt-2 flex items-center gap-2 text-xs text-slate-500 sm:mt-0 sm:justify-end">
                        {!!message.attList?.length && (
                          <Paperclip
                            className="size-3.5"
                            aria-label="包含附件"
                          />
                        )}
                        {formatDate(message.createTime)}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 pe-2 sm:pe-4">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-10"
                        aria-label={message.isStar ? "取消收藏" : "收藏邮件"}
                        title={message.isStar ? "取消收藏" : "收藏邮件"}
                        disabled={starMutation.isPending}
                        onClick={() =>
                          starMutation.mutate({
                            message,
                            next: !message.isStar,
                          })
                        }
                      >
                        <Star
                          className={`size-4.5 ${message.isStar ? "fill-amber-400 text-amber-500" : ""}`}
                        />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-10 text-slate-500 hover:bg-red-50 hover:text-red-700"
                        aria-label="删除邮件"
                        title="删除邮件"
                        disabled={deleteMutation.isPending}
                        onClick={() => setPendingDelete(message)}
                      >
                        <Trash2 className="size-4.5" />
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {query.hasNextPage && (
          <div className="flex justify-center border-t border-slate-200 bg-white px-4 py-5">
            <Button
              variant="secondary"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "正在加载…" : "加载更多"}
            </Button>
          </div>
        )}
      </section>
      <span className="sr-only" aria-live="polite">
        {query.isFetching && !query.isPending
          ? "正在刷新邮件"
          : `${messages.length} 封邮件`}
      </span>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除邮件？"
        description={`邮件“${pendingDelete?.subject || "无主题"}”将被永久删除，此操作无法撤销。`}
        confirmLabel="删除邮件"
        destructive
        loading={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(undefined);
        }}
        onConfirm={() =>
          pendingDelete &&
          deleteMutation.mutate(pendingDelete, {
            onSuccess: () => setPendingDelete(undefined),
          })
        }
      />
      </div>
    </main>
  );
}

export function InboxPage() {
  return (
    <MailListPage
      timeline="inbox"
      title="收件箱"
      description="默认展示全部邮箱收到的邮件，可按邮箱筛选。"
    />
  );
}

export function SentPage() {
  return (
    <MailListPage
      timeline="sent"
      title="已发送"
      description="查看从平台发出的全部邮件。"
    />
  );
}

export function StarredPage() {
  return (
    <MailListPage
      timeline="starred"
      title="星标邮件"
      description="集中处理你收藏的重要邮件。"
    />
  );
}
