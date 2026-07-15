import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import type { TwoFactorSetup } from '@hpc-mail/shared';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { authApi } from '@/api/resources';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { toast } from '@/components/ui/toast';
import { useCurrentUser } from '@/lib/use-session';

export function TwoFactorSection() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invalidateSession = () => queryClient.invalidateQueries({ queryKey: queryKeys.session });

  const startSetup = useMutation({
    mutationFn: () => authApi.setup2fa(),
    onSuccess: (data) => {
      setSetup(data);
      setError(null);
    },
    onError: (err) => toast({ title: err instanceof ApiError ? err.message : '启动失败', variant: 'error' }),
  });

  const enable = useMutation({
    mutationFn: () => authApi.enable2fa(code.trim()),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setCode('');
      void invalidateSession();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '验证失败'),
  });

  const disable = useMutation({
    mutationFn: () => authApi.disable2fa({ password: disablePassword || undefined }),
    onSuccess: () => {
      toast({ title: '两步验证已关闭', variant: 'success' });
      setDisableOpen(false);
      setDisablePassword('');
      void invalidateSession();
    },
    onError: (err) => toast({ title: err instanceof ApiError ? err.message : '关闭失败', variant: 'error' }),
  });

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        {user.twoFactorEnabled ? (
          <ShieldCheck className="size-4 text-positive" />
        ) : (
          <ShieldOff className="size-4 text-ink-tertiary" />
        )}
        <h2 className="text-sm font-semibold text-ink">两步验证（2FA）</h2>
      </div>

      {user.twoFactorEnabled ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-secondary">已启用。登录时需额外输入 Authenticator 生成的 6 位验证码。</p>
          <div>
            <Button variant="secondary" size="sm" onClick={() => setDisableOpen(true)}>
              关闭两步验证
            </Button>
          </div>
        </div>
      ) : setup ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-secondary">
            用 Authenticator（如 Google Authenticator、1Password）扫码或手动添加密钥，再输入生成的 6 位码完成启用。
          </p>
          <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2">
            <code className="flex-1 break-all font-mono text-xs text-ink">{setup.secret}</code>
            <CopyButton value={setup.secret} size="sm" />
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2">
            <code className="flex-1 break-all font-mono text-[11px] text-ink-secondary">{setup.otpauthUri}</code>
            <CopyButton value={setup.otpauthUri} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              placeholder="6 位验证码"
              className="max-w-40"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button size="sm" loading={enable.isPending} onClick={() => enable.mutate()}>
              验证并启用
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setSetup(null); setCode(''); setError(null); }}>
              取消
            </Button>
          </div>
          {error && <p className="text-sm text-critical">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-ink-secondary">
            开启后登录需 Authenticator 验证码，显著提升账户安全（本系统聚合各站验证码，账户价值高，建议开启）。
          </p>
          <div>
            <Button variant="secondary" size="sm" loading={startSetup.isPending} onClick={() => startSetup.mutate()}>
              启用两步验证
            </Button>
          </div>
        </div>
      )}

      {/* 恢复码一次性展示 */}
      <Dialog open={recoveryCodes !== null} onOpenChange={(next) => !next && setRecoveryCodes(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader title="保存恢复码" description="每个恢复码可在丢失设备时登录一次，请妥善保存——此后不再展示。" />
          <DialogBody>
            <div className="grid grid-cols-2 gap-2">
              {(recoveryCodes ?? []).map((rc) => (
                <code key={rc} className="rounded-md border border-line bg-canvas px-2 py-1.5 text-center font-mono text-sm text-ink">
                  {rc}
                </code>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <CopyButton value={(recoveryCodes ?? []).join('\n')} label="复制全部" />
            <Button onClick={() => setRecoveryCodes(null)}>我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 关闭确认 */}
      <Dialog open={disableOpen} onOpenChange={(next) => !next && setDisableOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader title="关闭两步验证" description="请输入当前密码确认。" />
          <DialogBody>
            <PasswordInput
              autoFocus
              placeholder="当前密码"
              value={disablePassword}
              onChange={(event) => setDisablePassword(event.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDisableOpen(false)}>
              取消
            </Button>
            <Button variant="danger" loading={disable.isPending} onClick={() => disable.mutate()}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
