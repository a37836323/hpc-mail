import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { Button, ConfirmDialog } from "@/components/ui";
import { openDraft } from "@/features/composer/composerStore";
import { mailApi } from "@/features/mail/mailApi";
import { mailKeys } from "@/features/mail/queryKeys";
import { formatDate, readableError } from "@/features/mail/utils";
import { deleteDraft, draftKeys, listDrafts } from "./draftDb";
import type { DraftRecord } from "./types";

export function DraftsPage() {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<DraftRecord>();
  const user = useQuery({
    queryKey: mailKeys.user(),
    queryFn: ({ signal }) => mailApi.currentUser(signal),
    staleTime: 60_000,
  });
  const drafts = useQuery({
    queryKey: draftKeys.list(user.data?.userId ?? 0),
    queryFn: () => listDrafts(user.data!.userId),
    enabled: Boolean(user.data?.userId),
  });
  const remove = useMutation({
    mutationFn: (draft: DraftRecord) =>
      deleteDraft(draft.userId, draft.draftId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: draftKeys.root }),
  });

  const error = user.error || drafts.error || remove.error;

  return (
    <main
      className="flex h-full min-h-0 flex-col bg-slate-50"
      aria-labelledby="drafts-heading"
    >
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1
          id="drafts-heading"
          className="text-xl font-semibold tracking-tight text-slate-950"
        >
          草稿箱
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          草稿仅保存在当前浏览器，并按平台账户隔离。
        </p>
      </header>
      {error && (
        <div
          className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {readableError(error, "草稿操作失败，请重试。")}
        </div>
      )}
      <section className="min-h-0 flex-1 overflow-y-auto" aria-label="草稿列表">
        {user.isPending || (user.isSuccess && drafts.isPending) ? (
          <div
            className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-500"
            role="status"
          >
            <LoaderCircle className="size-5 animate-spin" />
            正在加载草稿…
          </div>
        ) : user.isError || drafts.isError ? (
          <div className="grid min-h-72 place-items-center px-6 py-16 text-center">
            <div className="max-w-sm">
              <h2 className="text-base font-semibold text-slate-900">
                无法加载草稿
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                请检查登录状态和浏览器存储权限后重试。
              </p>
              <Button
                className="mt-5"
                variant="secondary"
                onClick={() =>
                  void Promise.all([user.refetch(), drafts.refetch()])
                }
              >
                重新加载
              </Button>
            </div>
          </div>
        ) : !drafts.data?.length ? (
          <div className="grid min-h-72 place-items-center px-6 py-16 text-center">
            <div className="max-w-sm">
              <FileText
                className="mx-auto size-9 text-slate-400"
                strokeWidth={1.6}
              />
              <h2 className="mt-4 text-base font-semibold text-slate-900">
                还没有草稿
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                写信时输入的内容会自动保存在这里。
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 bg-white">
            {drafts.data.map((draft) => (
              <li
                key={draft.draftId}
                className="flex min-h-[76px] items-center gap-2 px-4 py-3 sm:px-6"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  onClick={() => openDraft(draft)}
                >
                  <strong className="block truncate text-sm font-medium text-slate-900">
                    {draft.subject || "无主题"}
                  </strong>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {draft.receiveEmail.length
                      ? `收件人：${draft.receiveEmail.join(", ")}`
                      : "尚未填写收件人"}{" "}
                    · {formatDate(draft.updatedAt)}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11"
                  aria-label="继续编辑草稿"
                  onClick={() => openDraft(draft)}
                >
                  <Pencil className="size-4.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 text-slate-500 hover:bg-red-50 hover:text-red-700"
                  aria-label="删除草稿"
                  disabled={remove.isPending}
                  onClick={() => setPendingDelete(draft)}
                >
                  <Trash2 className="size-4.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除草稿？"
        description={`草稿“${pendingDelete?.subject || "无主题"}”将被永久删除，此操作无法撤销。`}
        confirmLabel="删除草稿"
        destructive
        loading={remove.isPending}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(undefined);
        }}
        onConfirm={() =>
          pendingDelete?.draftId &&
          remove.mutate(pendingDelete, {
            onSuccess: () => setPendingDelete(undefined),
          })
        }
      />
    </main>
  );
}
