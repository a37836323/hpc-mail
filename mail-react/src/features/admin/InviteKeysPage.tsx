import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Search, Trash2 } from "lucide-react";
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
  StatusBadge,
} from "./AdminPageParts";
import { managementApi } from "./managementApi";

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
function defaultExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function InviteKeysPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState(randomCode);
  const [roleId, setRoleId] = useState("");
  const [count, setCount] = useState("1");
  const [expireTime, setExpireTime] = useState(defaultExpiry);
  const [deleteId, setDeleteId] = useState<number>();
  const [clearOpen, setClearOpen] = useState(false);
  const keys = useQuery({
    queryKey: ["admin", "invite-keys", query],
    queryFn: ({ signal }) => managementApi.inviteKeys(query, signal),
  });
  const roles = useQuery({
    queryKey: ["admin", "selectable-roles"],
    queryFn: ({ signal }) => managementApi.selectableRoles(signal),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "invite-keys"] });
  const createMutation = useMutation({
    mutationFn: () =>
      managementApi.addInviteKey({
        code: code.trim(),
        roleId: Number(roleId),
        count: Number(count),
        expireTime,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      resetForm();
      void refresh();
      toast({ title: "注册密钥已创建", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "创建失败",
        description: messageOf(error),
        variant: "error",
      }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => managementApi.deleteInviteKeys([id]),
    onSuccess: () => {
      void refresh();
      toast({ title: "注册密钥已删除", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "删除失败",
        description: messageOf(error),
        variant: "error",
      }),
  });
  const clearMutation = useMutation({
    mutationFn: managementApi.clearInviteKeys,
    onSuccess: () => {
      void refresh();
      toast({ title: "无效密钥已清理", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "清理失败",
        description: messageOf(error),
        variant: "error",
      }),
  });

  function resetForm() {
    setCode(randomCode());
    setRoleId("");
    setCount("1");
    setExpireTime(defaultExpiry());
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || !roleId || Number(count) < 1 || !expireTime) {
      toast({ title: "请完整填写密钥信息", variant: "error" });
      return;
    }
    createMutation.mutate();
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "密钥已复制", variant: "success" });
    } catch {
      toast({ title: "复制失败，请手动复制", variant: "error" });
    }
  }
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AdminPage
      title="注册密钥"
      description="创建一次或多次使用的注册凭证，并为新用户预设角色。"
      action={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            loading={clearMutation.isPending}
            onClick={() => setClearOpen(true)}
          >
            清理无效密钥
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            创建密钥
          </Button>
        </div>
      }
    >
      <form
        className="mb-4 flex gap-2 rounded-2xl border border-slate-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索注册密钥</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="按密钥前缀搜索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button type="submit" variant="secondary">
          搜索
        </Button>
      </form>
      {keys.isPending ? (
        <LoadingState label="正在加载注册密钥" />
      ) : keys.isError ? (
        <ErrorState onRetry={() => void keys.refetch()} />
      ) : !keys.data.length ? (
        <EmptyState
          title="暂无注册密钥"
          description="创建密钥后即可邀请新用户注册。"
        />
      ) : (
        <div className="grid gap-3">
          {keys.data.map((item) => {
            const active = Boolean(item.expireTime && item.count > 0);
            return (
              <article
                key={item.regKeyId}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                      <KeyRound className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all font-mono text-sm font-semibold text-slate-900">
                          {item.code}
                        </code>
                        <StatusBadge
                          active={active}
                          activeText="可使用"
                          inactiveText="已失效"
                        />
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        角色：{item.roleName || "—"} · 剩余 {item.count} 次 ·
                        到期{" "}
                        {item.expireTime
                          ? formatDate(item.expireTime)
                          : "已过期"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void copy(item.code)}
                    >
                      <Copy className="size-4" />
                      复制
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-700"
                      aria-label="删除密钥"
                      loading={deleteMutation.isPending}
                      onClick={() => setDeleteId(item.regKeyId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建注册密钥</DialogTitle>
            <DialogDescription>
              密钥仅用于创建平台账户，不代表任何邮箱地址。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submit}>
            <label className="grid gap-1.5 text-sm font-medium">
              密钥
              <div className="flex gap-2">
                <Input
                  className="font-mono"
                  value={code}
                  maxLength={100}
                  onChange={(event) => setCode(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCode(randomCode())}
                >
                  重新生成
                </Button>
              </div>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              新用户角色
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  {roles.data?.map((role) => (
                    <SelectItem key={role.roleId} value={String(role.roleId)}>
                      {role.name}
                      {role.isDefault ? "（默认）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                可用次数
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                到期日期
                <Input
                  type="date"
                  min={today}
                  value={expireTime}
                  onChange={(event) => setExpireTime(event.target.value)}
                />
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                创建密钥
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteId)}
        title="删除注册密钥？"
        description="此注册密钥将立即失效并被永久删除。"
        confirmLabel="删除密钥"
        destructive
        loading={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteId(undefined);
        }}
        onConfirm={() =>
          deleteId &&
          deleteMutation.mutate(deleteId, {
            onSuccess: () => setDeleteId(undefined),
          })
        }
      />
      <ConfirmDialog
        open={clearOpen}
        title="清理无效密钥？"
        description="所有已过期或可用次数已耗尽的注册密钥将被永久删除。"
        confirmLabel="确认清理"
        destructive
        loading={clearMutation.isPending}
        onOpenChange={setClearOpen}
        onConfirm={() =>
          clearMutation.mutate(undefined, {
            onSuccess: () => setClearOpen(false),
          })
        }
      />
    </AdminPage>
  );
}
