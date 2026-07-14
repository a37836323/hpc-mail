import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { changePasswordRequestSchema } from '@hpc-mail/shared';
import { ApiError } from '@/api/errors';
import { authApi } from '@/api/resources';
import { setAuthToken } from '@/lib/auth-token';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { toast } from '@/components/ui/toast';

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword({ oldPassword, newPassword }),
    onSuccess: (res) => {
      // 改密会踢掉全部旧会话，服务端返回的新 token 需立即替换，当前会话才不掉线
      setAuthToken(res.token);
      toast({ title: '密码已修改', variant: 'success' });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '修改失败，请重试'),
  });

  const reset = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirm('');
    setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    const parsed = changePasswordRequestSchema.safeParse({ oldPassword, newPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader title="修改密码" />
        <form onSubmit={handleSubmit}>
          <DialogBody className="flex flex-col gap-4">
            <FormField label="当前密码" required>
              {(field) => (
                <PasswordInput
                  {...field}
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="新密码" description="至少 8 位" required>
              {(field) => (
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="确认新密码" required error={error ?? undefined}>
              {(field) => (
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              )}
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
