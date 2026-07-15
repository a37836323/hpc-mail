import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import type { ComposeInitial } from './compose-init';
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

function splitLocalPart(address: string | undefined): { localPart: string; domain: string } {
  if (!address) return { localPart: '', domain: '' };
  const at = address.lastIndexOf('@');
  return at > 0 ? { localPart: address.slice(0, at), domain: address.slice(at + 1) } : { localPart: '', domain: '' };
}

const DRAFT_KEY = 'hpc-compose-draft';
interface ComposeDraft {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  isHtml: boolean;
}

function readDraft(): ComposeDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ComposeDraft) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function ComposePage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isAdmin = user.role === 'admin';
  const { data: config } = usePublicConfig();
  const { data: mailboxes } = useMailboxesQuery(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initial = useMemo<ComposeInitial>(() => (location.state as ComposeInitial | null) ?? {}, [location.state]);
  const initialIdentity = useMemo(() => splitLocalPart(initial.fromAddress), [initial.fromAddress]);
  // 全新写信（无回复/转发预填）时恢复本地草稿；回复/转发有 location.state 则不覆盖
  const savedDraft = useMemo(() => (location.state ? null : readDraft()), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [mailboxId, setMailboxId] = useState<number | null>(null);
  const [localPart, setLocalPart] = useState(() => (isAdmin ? initialIdentity.localPart : ''));
  const [adminDomain, setAdminDomain] = useState(() => (isAdmin ? initialIdentity.domain : ''));
  const [to, setTo] = useState<string[]>(initial.to ?? savedDraft?.to ?? []);
  const [cc, setCc] = useState<string[]>(initial.cc ?? savedDraft?.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(savedDraft?.bcc ?? []);
  const [showCc, setShowCc] = useState((initial.cc?.length ?? savedDraft?.cc?.length ?? 0) > 0);
  const [showBcc, setShowBcc] = useState((savedDraft?.bcc?.length ?? 0) > 0);
  const [subject, setSubject] = useState(initial.subject ?? savedDraft?.subject ?? '');
  const [isHtml, setIsHtml] = useState(initial.isHtml ?? savedDraft?.isHtml ?? false);
  const [body, setBody] = useState(initial.body ?? savedDraft?.body ?? '');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const replyToMessageId = initial.replyToMessageId;

  // 预填了发件地址则选中匹配项；否则只有一个认领地址时自动选中（省一步手选）
  useEffect(() => {
    if (isAdmin || mailboxId !== null) return;
    const boxes = mailboxes ?? [];
    if (initial.fromAddress) {
      const match = boxes.find((box) => box.address === initial.fromAddress);
      if (match) setMailboxId(match.id);
    } else if (boxes.length === 1) {
      setMailboxId(boxes[0]!.id);
    }
  }, [mailboxes, isAdmin, mailboxId, initial.fromAddress]);

  // 草稿自动保存到 localStorage；有内容才存，清空则删；发送成功时清除
  useEffect(() => {
    const hasContent =
      to.length > 0 || cc.length > 0 || bcc.length > 0 || subject.trim() !== '' || body.trim() !== '';
    if (!hasContent) {
      clearDraft();
      return;
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ to, cc, bcc, subject, body, isHtml }));
    } catch {
      // 存储不可用时静默
    }
  }, [to, cc, bcc, subject, body, isHtml]);

  // 有未发送内容时离开页面/刷新给出浏览器原生拦截
  useEffect(() => {
    const dirty = to.length > 0 || subject.trim() !== '' || body.trim() !== '';
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [to.length, subject, body]);

  const sendMutation = useMutation({
    mutationFn: (payload: SendMailRequest) => messageApi.send(payload),
    onSuccess: () => {
      toast({ title: '邮件已发送', variant: 'success' });
      clearDraft();
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
      bcc,
      subject,
      ...(isHtml ? { html: body } : { text: body }),
      attachments: attachments.map(({ filename, contentType, content }) => ({ filename, contentType, content })),
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(initial.forwardAttachmentsFrom ? { forwardAttachmentsFrom: initial.forwardAttachmentsFrom } : {}),
    };

    const parsed = sendMailRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    sendMutation.mutate(parsed.data);
  };

  const attachmentTotal = attachments.reduce((sum, item) => sum + item.size, 0);
  const title =
    initial.mode === 'reply'
      ? '回复邮件'
      : initial.mode === 'forward'
        ? '转发邮件'
        : initial.mode === 'resend'
          ? '重新发送'
          : '写邮件';

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={title} />
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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">
              收件人<span className="ml-0.5 text-critical">*</span>
            </span>
            {(!showCc || !showBcc) && (
              <div className="flex gap-3 text-sm">
                {!showCc && (
                  <button type="button" onClick={() => setShowCc(true)} className="text-accent hover:underline">
                    抄送
                  </button>
                )}
                {!showBcc && (
                  <button type="button" onClick={() => setShowBcc(true)} className="text-accent hover:underline">
                    密送
                  </button>
                )}
              </div>
            )}
          </div>
          <RecipientInput value={to} onChange={setTo} placeholder="输入邮箱后回车" />
        </div>

        {showCc && (
          <FormField label="抄送">
            {(field) => <RecipientInput {...field} value={cc} onChange={setCc} placeholder="抄送收件人" />}
          </FormField>
        )}

        {showBcc && (
          <FormField label="密送">
            {(field) => <RecipientInput {...field} value={bcc} onChange={setBcc} placeholder="密送收件人" />}
          </FormField>
        )}

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
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
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
