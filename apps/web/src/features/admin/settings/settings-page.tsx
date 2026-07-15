import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { SECRET_MASK, type Settings } from '@hpc-mail/shared';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { adminApi } from '@/api/resources';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { RecipientInput } from '@/features/compose/recipient-input';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-secondary">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col">
        <span className="text-sm font-medium text-ink">{label}</span>
        {description && <span className="text-xs text-ink-tertiary">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: queryKeys.admin.settings, queryFn: () => adminApi.getSettings() });
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (data && draft === null) setDraft(structuredClone(data));
  }, [data, draft]);

  const patch = (updater: (settings: Settings) => void) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      updater(next);
      return next;
    });

  const save = useMutation({
    mutationFn: (payload: Settings) => adminApi.updateSettings(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.admin.settings, saved);
      setDraft(structuredClone(saved));
      void queryClient.invalidateQueries({ queryKey: queryKeys.config });
      toast({ title: '设置已保存', variant: 'success' });
    },
    onError: (err) => toast({ title: err instanceof ApiError ? err.message : '保存失败，请重试', variant: 'error' }),
  });

  const feishuTest = useMutation({
    mutationFn: () => adminApi.testFeishu(),
    onSuccess: () => toast({ title: '测试卡片已发送', variant: 'success' }),
    onError: (err) => toast({ title: err instanceof ApiError ? err.message : '发送失败', variant: 'error' }),
  });

  if (isLoading || !draft || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  // 域名完全由 settings.domains.list 驱动（后端 getDomains 已去部署配置 fallback）；
  // 域名的增删在独立的 /admin/domains 页面管理。
  const domains = draft.domains.list;

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <PageHeader title="系统设置" description="站点级配置，保存后立即生效。" />

      <div className="flex flex-col gap-4">
        <Section title="站点">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">站点标题</span>
            <Input
              value={draft.site.title}
              maxLength={64}
              onChange={(event) => patch((s) => void (s.site.title = event.target.value))}
            />
          </label>
          <ToggleRow
            label="开放 API"
            description="关闭后所有 /v1 请求将被拒绝。"
            checked={draft.api.enabled}
            onChange={(value) => patch((s) => void (s.api.enabled = value))}
          />
        </Section>

        <Section title="注册模式" description="控制新用户如何注册平台账户。">
          <SegmentedControl
            aria-label="注册模式"
            value={draft.register_mode}
            onValueChange={(value) => patch((s) => void (s.register_mode = value))}
            options={[
              { value: 'closed', label: '关闭' },
              { value: 'invite', label: '邀请码' },
              { value: 'open', label: '开放' },
            ]}
          />
        </Section>

        <Section title="验证码提取" description="从收件正文中自动识别一次性验证码。">
          <ToggleRow
            label="启用验证码提取"
            checked={draft.code_extract.enabled}
            onChange={(value) => patch((s) => void (s.code_extract.enabled = value))}
          />
          <ToggleRow
            label="AI 兜底提取"
            description="正则未命中时用 Workers AI 异步补充。"
            checked={draft.code_extract.aiEnabled}
            onChange={(value) => patch((s) => void (s.code_extract.aiEnabled = value))}
          />
        </Section>

        <Section title="Gmail 转发" description="将收到的邮件转发到已验证的 Gmail 地址。">
          <ToggleRow
            label="启用转发"
            checked={draft.gmail_forward.enabled}
            onChange={(value) => patch((s) => void (s.gmail_forward.enabled = value))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">转发目标地址</span>
            <RecipientInput
              value={draft.gmail_forward.addresses}
              onChange={(addresses) => patch((s) => void (s.gmail_forward.addresses = addresses))}
              placeholder="输入已验证的 Gmail 地址后回车"
            />
          </label>
        </Section>

        <Section title="飞书通知" description="收件时推送飞书卡片。">
          <ToggleRow
            label="启用飞书通知"
            checked={draft.feishu.enabled}
            onChange={(value) => patch((s) => void (s.feishu.enabled = value))}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Webhook URL</span>
            <Input
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              value={draft.feishu.webhookUrl}
              onChange={(event) => patch((s) => void (s.feishu.webhookUrl = event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">签名密钥</span>
            <PasswordInput
              placeholder={draft.feishu.secret === SECRET_MASK ? '已配置（留空保持不变）' : '可选'}
              value={draft.feishu.secret === SECRET_MASK ? '' : draft.feishu.secret}
              onChange={(event) => patch((s) => void (s.feishu.secret = event.target.value))}
            />
          </label>
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={feishuTest.isPending}
              onClick={() => feishuTest.mutate()}
            >
              发送测试卡片
            </Button>
          </div>
        </Section>

        <Section title="Resend 外发" description="按发件域名配置 Resend API Token，用于站外投递。">
          {domains.length === 0 ? (
            <p className="text-sm text-ink-tertiary">请先在“域名”页添加收件域名。</p>
          ) : (
            domains.map((domain) => {
              const current = draft.resend.tokens[domain] ?? '';
              const configured = current === SECRET_MASK;
              return (
                <label key={domain} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">{domain}</span>
                  <PasswordInput
                    placeholder={configured ? '已配置（留空保持不变）' : 're_...'}
                    value={configured ? '' : current}
                    onChange={(event) => patch((s) => void (s.resend.tokens[domain] = event.target.value))}
                  />
                </label>
              );
            })
          )}
        </Section>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:pl-[220px]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="text-sm text-ink-secondary">有未保存的更改</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setDraft(structuredClone(data))} disabled={save.isPending}>
                放弃
              </Button>
              <Button loading={save.isPending} onClick={() => save.mutate(draft)}>
                保存更改
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
