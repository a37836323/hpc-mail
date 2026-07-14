import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_TOTAL_BYTES,
  type SendMailRequest,
  sendMailRequestSchema,
} from '@hpc-mail/shared';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { messageApi } from '@/api/resources';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { formatBytes } from '@/lib/format';
import { usePublicConfig } from '@/lib/use-config';
import { useCurrentUser } from '@/lib/use-session';
import { useMailboxesQuery } from '@/features/mailboxes/use-mailboxes';
import { IdentityPicker } from './identity-picker';
import { RecipientInput } from './recipient-input';

interface LocalAttachment {
  filename: string;
  contentType: string;
  content: string;
  size: number;
}

async function fileToAttachment(file: File): Promise<LocalAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    content: btoa(binary),
    size: file.size,
  };
}

export function ComposePage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user.role === 'admin';
  const { data: config } = usePublicConfig();
  const { data: mailboxes } = useMailboxesQuery(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mailboxId, setMailboxId] = useState<number | null>(null);
  const [localPart, setLocalPart] = useState('');
  const [adminDomain, setAdminDomain] = useState('');
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [isHtml, setIsHtml] = useState(false);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sendMutation = useMutation({
    mutationFn: (payload: SendMailRequest) => messageApi.send(payload),
    onSuccess: () => {
      toast({ title: '邮件已发送', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.root });
      navigate('/sent');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '发送失败，请重试'),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = await Promise.all(Array.from(files).map(fileToAttachment));
    const next = [...attachments, ...incoming];
    if (next.length > MAX_ATTACHMENTS) {
      toast({ title: `最多添加 ${MAX_ATTACHMENTS} 个附件`, variant: 'error' });
      return;
    }
    const total = next.reduce((sum, item) => sum + item.size, 0);
    if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
      toast({ title: '附件合计超过 25MB 上限', variant: 'error' });
      return;
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isAdmin) {
      if (!localPart || !adminDomain) {
        setError('请填写发件地址');
        return;
      }
    } else if (!mailboxId) {
      setError('请选择发件地址');
      return;
    }

    const payload = {
      from: isAdmin ? { localPart, domain: adminDomain } : { mailboxId: mailboxId ?? undefined },
      to,
      cc,
      bcc: [],
      subject,
      ...(isHtml ? { html: body } : { text: body }),
      attachments: attachments.map(({ filename, contentType, content }) => ({ filename, contentType, content })),
    };

    const parsed = sendMailRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    sendMutation.mutate(parsed.data);
  };

  const attachmentTotal = attachments.reduce((sum, item) => sum + item.size, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="写邮件" />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <IdentityPicker
          isAdmin={isAdmin}
          mailboxes={mailboxes ?? []}
          domains={config?.domains ?? []}
          mailboxId={mailboxId}
          onMailboxId={setMailboxId}
          localPart={localPart}
          onLocalPart={setLocalPart}
          domain={adminDomain}
          onDomain={setAdminDomain}
        />

        <FormField label="收件人" required>
          {(field) => <RecipientInput {...field} value={to} onChange={setTo} placeholder="输入邮箱后回车" />}
        </FormField>

        <FormField label="抄送">
          {(field) => <RecipientInput {...field} value={cc} onChange={setCc} placeholder="可选" />}
        </FormField>

        <FormField label="主题" required>
          {(field) => (
            <Input
              {...field}
              maxLength={998}
              placeholder="邮件主题"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          )}
        </FormField>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">正文</span>
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              HTML
              <Switch checked={isHtml} onCheckedChange={setIsHtml} aria-label="以 HTML 发送" />
            </label>
          </div>
          <Textarea
            rows={10}
            placeholder={isHtml ? '支持简单 HTML 标记' : '纯文本正文'}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="font-sans"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
              添加附件
            </Button>
            <span className="text-xs text-ink-tertiary">
              最多 {MAX_ATTACHMENTS} 个，合计 25MB；已用 {formatBytes(attachmentTotal)}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </div>
          {attachments.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {attachments.map((attachment, index) => (
                <li
                  key={`${attachment.filename}-${index}`}
                  className="flex items-center gap-3 rounded-md border border-line px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{attachment.filename}</span>
                  <span className="shrink-0 text-xs text-ink-tertiary">{formatBytes(attachment.size)}</span>
                  <button
                    type="button"
                    aria-label={`移除 ${attachment.filename}`}
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                    className="shrink-0 text-ink-tertiary hover:text-ink"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-critical">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            取消
          </Button>
          <Button type="submit" loading={sendMutation.isPending} disabled={to.length === 0}>
            发送
          </Button>
        </div>
      </form>
    </div>
  );
}
