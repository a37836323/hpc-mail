import { CopyButton } from '@/components/ui/copy-button';

export function OtpBanner({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-otp-border bg-otp-bg px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-otp-ink">验证码</p>
        <p className="font-mono text-[22px] font-semibold tracking-wider text-otp-ink">{code}</p>
      </div>
      <CopyButton value={code} label="复制" size="sm" />
    </div>
  );
}
