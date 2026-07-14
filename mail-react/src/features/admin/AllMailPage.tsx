import { type FormEvent, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Mail, Search, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import {
  AdminPage,
  EmptyState,
  ErrorState,
  formatDate,
  LoadingState,
  messageOf,
} from "./AdminPageParts";
import { managementApi } from "./managementApi";
import type { AdminMail } from "./adminTypes";

const PAGE_SIZE = 30;
function directionOf(mail: AdminMail) {
  return mail.type === 0 ? "收件" : "发件";
}
function mailboxOf(mail: AdminMail) {
  return mail.type === 0 ? mail.toEmail : mail.sendEmail || "—";
}
function counterpartOf(mail: AdminMail) {
  return mail.type === 0 ? mail.sendEmail || "未知发件人" : mail.toEmail;
}

export function AllMailPage() {
  const queryClient = useQueryClient();
  const [type, setType] = useState("all");
  const [subjectInput, setSubjectInput] = useState("");
  const [mailboxInput, setMailboxInput] = useState("");
  const [subject, setSubject] = useState("");
  const [mailbox, setMailbox] = useState("");
  const [cursors, setCursors] = useState<number[]>([0]);
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<AdminMail | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const cursor = cursors.at(-1) || 0;
  const mail = useQuery({
    queryKey: ["admin", "all-mail", type, subject, mailbox, cursor],
    queryFn: ({ signal }) =>
      managementApi.allMail(
        {
          emailId: cursor || undefined,
          size: PAGE_SIZE,
          subject,
          accountEmail: mailbox,
          type: type === "all" ? "" : type,
          timeSort: 0,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const deleteMutation = useMutation({
    mutationFn: managementApi.deleteMail,
    onSuccess: () => {
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["admin", "all-mail"] });
      toast({ title: "邮件记录已永久删除", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "删除失败",
        description: messageOf(error),
        variant: "error",
      }),
  });

  function filter(event: FormEvent) {
    event.preventDefault();
    setSubject(subjectInput.trim());
    setMailbox(mailboxInput.trim());
    setCursors([0]);
    setSelected([]);
  }
  function changeType(value: string) {
    setType(value);
    setCursors([0]);
    setSelected([]);
  }
  function nextPage() {
    const lastId = mail.data?.list.at(-1)?.emailId;
    if (lastId) setCursors((value) => [...value, lastId]);
  }
  function previousPage() {
    setCursors((value) => (value.length > 1 ? value.slice(0, -1) : value));
  }
  function toggle(id: number) {
    setSelected((value) =>
      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
    );
  }
  const rows = mail.data?.list || [];
  const allSelected =
    rows.length > 0 && rows.every((item) => selected.includes(item.emailId));

  return (
    <AdminPage
      title="全部邮件"
      description="审计平台内全部收发邮件。默认展示所有方向，可按邮箱地址和主题筛选。"
    >
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <form
          className="grid gap-3 md:grid-cols-[160px_minmax(160px,1fr)_minmax(160px,1fr)_auto]"
          onSubmit={filter}
        >
          <Select value={type} onValueChange={changeType}>
            <SelectTrigger aria-label="邮件方向">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部邮件</SelectItem>
              <SelectItem value="receive">仅收件</SelectItem>
              <SelectItem value="send">仅发件</SelectItem>
              <SelectItem value="delete">已删除</SelectItem>
            </SelectContent>
          </Select>
          <label className="relative">
            <span className="sr-only">邮箱地址</span>
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="筛选邮箱地址"
              value={mailboxInput}
              onChange={(event) => setMailboxInput(event.target.value)}
            />
          </label>
          <label className="relative">
            <span className="sr-only">主题</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="搜索主题"
              value={subjectInput}
              onChange={(event) => setSubjectInput(event.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary">
            筛选
          </Button>
        </form>
      </section>
      {selected.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span>已选择 {selected.length} 封</span>
          <Button
            size="sm"
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            永久删除
          </Button>
        </div>
      )}
      {mail.isPending ? (
        <LoadingState label="正在加载邮件" />
      ) : mail.isError ? (
        <ErrorState onRetry={() => void mail.refetch()} />
      ) : !rows.length ? (
        <EmptyState
          title="没有符合条件的邮件"
          description="清空筛选条件或切换邮件方向后重试。"
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {rows.map((item) => (
              <article
                key={item.emailId}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <input
                    aria-label={`选择邮件 ${item.subject || "无主题"}`}
                    type="checkbox"
                    className="mt-1 size-4 accent-blue-600"
                    checked={selected.includes(item.emailId)}
                    onChange={() => toggle(item.emailId)}
                  />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setDetail(item)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.type === 0 ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}
                      >
                        {directionOf(item)}
                      </span>
                      <time className="text-xs text-slate-500">
                        {formatDate(item.createTime)}
                      </time>
                    </div>
                    <h2 className="mt-3 truncate font-medium text-slate-950">
                      {item.subject || "（无主题）"}
                    </h2>
                    <p className="mt-1 truncate text-sm text-slate-600">
                      {counterpartOf(item)}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      邮箱：{mailboxOf(item)} · 用户：{item.username || "—"}
                    </p>
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      aria-label="选择当前页全部邮件"
                      type="checkbox"
                      className="size-4 accent-blue-600"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(
                          allSelected
                            ? selected.filter(
                                (id) => !rows.some((row) => row.emailId === id),
                              )
                            : [
                                ...new Set([
                                  ...selected,
                                  ...rows.map((row) => row.emailId),
                                ]),
                              ],
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-3">方向</th>
                  <th className="px-4 py-3">主题 / 对方</th>
                  <th className="px-4 py-3">平台邮箱</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((item) => (
                  <tr
                    key={item.emailId}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setDetail(item)}
                  >
                    <td
                      className="px-4 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        aria-label={`选择邮件 ${item.subject || "无主题"}`}
                        type="checkbox"
                        className="size-4 accent-blue-600"
                        checked={selected.includes(item.emailId)}
                        onChange={() => toggle(item.emailId)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.type === 0 ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}
                      >
                        {directionOf(item)}
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-medium text-slate-900">
                        {item.subject || "（无主题）"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {counterpartOf(item)}
                      </p>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                      {mailboxOf(item)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.username || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(item.createTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>共 {mail.data?.total ?? 0} 封</span>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                aria-label="上一页"
                disabled={cursors.length === 1}
                onClick={previousPage}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span>第 {cursors.length} 页</span>
              <Button
                size="icon"
                variant="secondary"
                aria-label="下一页"
                disabled={rows.length < PAGE_SIZE}
                onClick={nextPage}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.subject || "（无主题）"}</DialogTitle>
            <DialogDescription>
              {detail &&
                `${directionOf(detail)} · ${formatDate(detail.createTime)}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="grid gap-4 text-sm">
              <dl className="grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-[90px_1fr]">
                <dt className="text-slate-500">发件人</dt>
                <dd className="break-all">{detail.sendEmail || "—"}</dd>
                <dt className="text-slate-500">收件人</dt>
                <dd className="break-all">{detail.toEmail}</dd>
                <dt className="text-slate-500">平台用户</dt>
                <dd>{detail.username || "—"}</dd>
              </dl>
              <pre className="max-h-80 whitespace-pre-wrap overflow-auto rounded-xl border border-slate-200 bg-white p-4 font-sans leading-6 text-slate-700">
                {detail.text || "暂无纯文本内容"}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen}
        title="永久删除邮件？"
        description={`选中的 ${selected.length} 封邮件将被永久删除，此操作无法撤销。`}
        confirmLabel="永久删除"
        destructive
        loading={deleteMutation.isPending}
        onOpenChange={setDeleteOpen}
        onConfirm={() =>
          deleteMutation.mutate(selected, {
            onSuccess: () => setDeleteOpen(false),
          })
        }
      />
    </AdminPage>
  );
}
