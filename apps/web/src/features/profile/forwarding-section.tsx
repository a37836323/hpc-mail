import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { SECRET_MASK, type UserNotifyPrefs } from '@hpc-mail/shared';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { notifyPrefsApi } from '@/api/resources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { RecipientInput } from '@/features/compose/recipient-input';
import { useCurrentUser } from '@/lib/use-session';

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-medium text-ink">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function ForwardingSection() {
  const user = useCurrentUser();
  const isAdmin = user.role === 'admin';
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: queryKeys.notifyPrefs, queryFn: () => notifyPrefsApi.get() });
  const [draft, setDraft] = useState<UserNotifyPrefs | null>(null);

  useEffect(() => {
    if (data) setDraft(structuredClone(data));
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: UserNotifyPrefs) => notifyPrefsApi.update(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.notifyPrefs, saved);
      setDraft(structuredClone(saved));
      toast({ title: '转发与通知已保存', variant: 'success' });
    },
    onError: (err) =>
      toast({ title: err instanceof ApiError ? err.message : '保存失败，请重试', variant: 'error' }),
  });

  const testFeishu = useMutation({
    mutationFn: () => notifyPrefsApi.testFeishu(),
    onSuccess: () => toast({ title: '测试卡片已发送', variant: 'success' }),
    onError: (err) => toast({ title: err instanceof ApiError ? err.message : '发送失败', variant: 'error' }),
  });

  if (!draft || !data) {
    return (
      <section className="rounded-lg border border-line bg-surface p-5">
        <Skeleton className="h-40 w-full rounded-md" />
      </section>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const patch = (fn: (d: UserNotifyPrefs) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev!);
      fn(next);
      return next;
    });
  };

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">转发与通知</h2>
        <p className="mt-0.5 text-[13px] text-ink-secondary">
          你认领地址收到的邮件会按下面的配置转发与通知。
          {isAdmin && '作为管理员，这份配置还会作用于未认领地址收到的邮件与系统通知。'}
        </p>
      </div>

      {/* 邮箱转发 */}
      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <ToggleRow
          label="转发到邮箱"
          checked={draft.forward.enabled}
          onChange={(v) => patch((d) => void (d.forward.enabled = v))}
        />
        <RecipientInput
          value={draft.forward.addresses}
          onChange={(addresses) => patch((d) => void (d.forward.addresses = addresses))}
          placeholder="输入目标邮箱地址后回车"
        />
        <p className="text-xs text-caution">
          ⚠️ 目标邮箱须是 Cloudflare Email Routing 中<b>已验证</b>的地址，否则邮件不会送达。请联系管理员在
          Cloudflare 后台把它加为已验证 destination。
        </p>
      </div>

      {/* 飞书通知 */}
      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <ToggleRow
          label="飞书通知"
          checked={draft.feishu.enabled}
          onChange={(v) => patch((d) => void (d.feishu.enabled = v))}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-secondary">Webhook URL</span>
          <Input
            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
            value={draft.feishu.webhookUrl}
            onChange={(e) => patch((d) => void (d.feishu.webhookUrl = e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-secondary">签名密钥</span>
          <PasswordInput
            placeholder={draft.feishu.secret === SECRET_MASK ? '已配置（留空保持不变）' : '可选'}
            value={draft.feishu.secret === SECRET_MASK ? '' : draft.feishu.secret}
            onChange={(e) => patch((d) => void (d.feishu.secret = e.target.value))}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-secondary">推送内容</span>
          <SegmentedControl
            aria-label="飞书推送内容分级"
            value={draft.feishu.contentLevel}
            onValueChange={(value) =>
              patch((d) => void (d.feishu.contentLevel = value as UserNotifyPrefs['feishu']['contentLevel']))
            }
            options={[
              { value: 'code_only', label: '仅验证码' },
              { value: 'summary', label: '摘要' },
              { value: 'full', label: '全文原文' },
            ]}
          />
          <span className="text-xs text-ink-tertiary">
            摘要仅推送正文前 200 字；全文会把完整正文（含敏感信息）推送到群里，请谨慎。
          </span>
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={testFeishu.isPending}
            onClick={() => testFeishu.mutate()}
          >
            发送测试卡片
          </Button>
          <span className="ml-2 text-xs text-ink-tertiary">测试用当前已保存的配置，未保存的改动不生效。</span>
        </div>
      </div>

      {/* 通用 webhook */}
      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <ToggleRow
          label="通用 Webhook"
          checked={draft.webhook.enabled}
          onChange={(v) => patch((d) => void (d.webhook.enabled = v))}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-secondary">Webhook URL</span>
          <Input
            placeholder="https://...（Bark / ntfy / 自建服务）"
            value={draft.webhook.url}
            onChange={(e) => patch((d) => void (d.webhook.url = e.target.value))}
          />
          <span className="text-xs text-ink-tertiary">仅支持 HTTPS，且不能指向内网地址。新邮件会 POST JSON。</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-secondary">签名密钥</span>
          <PasswordInput
            placeholder={
              draft.webhook.secret === SECRET_MASK ? '已配置（留空保持不变）' : '可选，用于 X-HPC-Signature 校验'
            }
            value={draft.webhook.secret === SECRET_MASK ? '' : draft.webhook.secret}
            onChange={(e) => patch((d) => void (d.webhook.secret = e.target.value))}
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        {dirty && <span className="text-xs text-ink-tertiary">有未保存的改动</span>}
        <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(draft)}>
          保存
        </Button>
      </div>
    </section>
  );
}
