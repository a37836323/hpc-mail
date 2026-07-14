import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
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
  ErrorState,
  LoadingState,
  messageOf,
  StatusBadge,
} from "./AdminPageParts";
import { managementApi } from "./managementApi";
import type { SystemSecretDraft, SystemSetting } from "./adminTypes";

type Tab = "access" | "mail" | "verification" | "delivery" | "push" | "content";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "access", label: "平台访问" },
  { id: "mail", label: "邮件行为" },
  { id: "verification", label: "安全验证" },
  { id: "delivery", label: "发信与存储" },
  { id: "push", label: "消息推送" },
  { id: "content", label: "内容规则" },
];
const emptySecrets: SystemSecretDraft = {
  siteKey: "",
  secretKey: "",
  s3AccessKey: "",
  s3SecretKey: "",
  tgBotToken: "",
  feishuWebhookUrl: "",
  feishuBotSecret: "",
  resendTokens: {},
};
const editableKeys = [
  "title",
  "register",
  "loginDomain",
  "regKey",
  "addEmail",
  "manyEmail",
  "minEmailPrefix",
  "emailPrefixFilter",
  "receive",
  "send",
  "noRecipient",
  "autoRefresh",
  "registerVerify",
  "addEmailVerify",
  "regVerifyCount",
  "addVerifyCount",
  "r2Domain",
  "bucket",
  "region",
  "endpoint",
  "forcePathStyle",
  "tgBotStatus",
  "tgChatId",
  "customDomain",
  "tgMsgFrom",
  "tgMsgTo",
  "tgMsgText",
  "feishuBotStatus",
  "forwardStatus",
  "forwardEmail",
  "ruleType",
  "ruleEmail",
  "notice",
  "noticeTitle",
  "noticeContent",
  "noticeType",
  "noticeDuration",
  "noticePosition",
  "noticeOffset",
  "noticeWidth",
  "aiCode",
  "aiCodeFilter",
] as const;

export function buildSystemSettingsPayload(
  setting: SystemSetting,
  secrets: SystemSecretDraft,
): Partial<SystemSetting> {
  const payload: Partial<SystemSetting> = {};
  for (const key of editableKeys)
    Object.assign(payload, { [key]: setting[key] });
  const secretKeys = [
    "siteKey",
    "secretKey",
    "s3AccessKey",
    "s3SecretKey",
    "tgBotToken",
    "feishuWebhookUrl",
    "feishuBotSecret",
  ] as const;
  for (const key of secretKeys)
    if (secrets[key].trim())
      Object.assign(payload, { [key]: secrets[key].trim() });
  const resendTokens = Object.fromEntries(
    Object.entries(secrets.resendTokens)
      .map(([domain, token]) => [domain, token.trim()])
      .filter(([, token]) => token),
  );
  if (Object.keys(resendTokens).length) payload.resendTokens = resendTokens;
  return payload;
}

function splitList(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
function configured(value: unknown) {
  return typeof value === "string" && Boolean(value);
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 py-6 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-5">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`grid content-start gap-1.5 text-sm font-medium text-slate-800 ${wide ? "sm:col-span-2" : ""}`}
    >
      <span>{label}</span>
      {children}
      {hint && (
        <span className="text-xs font-normal leading-5 text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}
function Area({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      className="min-h-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
function Choice({
  value,
  onChange,
  options,
}: {
  value: number | string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <Select value={String(value)} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([id, label]) => (
          <SelectItem key={id} value={id}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
const enabledOptions: Array<[string, string]> = [
  ["0", "启用"],
  ["1", "停用"],
];

function SecretField({
  label,
  isConfigured,
  value,
  onChange,
  hint,
}: {
  label: string;
  isConfigured: boolean;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <Field
      label={label}
      hint={
        hint || (isConfigured ? "已安全配置；留空表示不修改。" : "尚未配置。")
      }
    >
      <Input
        type="password"
        autoComplete="new-password"
        value={value}
        placeholder={isConfigured ? "已配置" : "输入新密钥"}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function SystemSettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("access");
  const [draft, setDraft] = useState<SystemSetting | null>(null);
  const [secrets, setSecrets] = useState<SystemSecretDraft>(emptySecrets);
  const [removeFeishuOpen, setRemoveFeishuOpen] = useState(false);
  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: ({ signal }) => managementApi.settings(signal),
  });
  useEffect(() => {
    if (settings.data) {
      setDraft(structuredClone(settings.data));
      setSecrets(emptySecrets);
    }
  }, [settings.data]);
  function update<K extends keyof SystemSetting>(
    key: K,
    value: SystemSetting[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }
  function secret<K extends keyof SystemSecretDraft>(
    key: K,
    value: SystemSecretDraft[K],
  ) {
    setSecrets((current) => ({ ...current, [key]: value }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const payload = buildSystemSettingsPayload(draft, secrets);
      await Promise.all([
        managementApi.updateSettings(payload),
        managementApi.updateBlacklist({
          blackSubject: draft.blackSubject || "",
          blackContent: draft.blackContent || "",
          blackFrom: draft.blackFrom || "",
        }),
      ]);
    },
    onSuccess: async () => {
      setSecrets(emptySecrets);
      await queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast({ title: "系统设置已保存", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "保存失败",
        description: messageOf(error),
        variant: "error",
      }),
  });
  const testFeishu = useMutation({
    mutationFn: managementApi.testFeishu,
    onSuccess: () => toast({ title: "飞书测试消息已发送", variant: "success" }),
    onError: (error) =>
      toast({
        title: "飞书测试失败",
        description: messageOf(error),
        variant: "error",
      }),
  });
  const removeFeishu = useMutation({
    mutationFn: () =>
      managementApi.updateSettings({
        feishuBotStatus: 1,
        feishuWebhookUrl: "",
        feishuBotSecret: "",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast({ title: "飞书配置已移除", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "移除失败",
        description: messageOf(error),
        variant: "error",
      }),
  });

  if (settings.isPending || !draft)
    return (
      <AdminPage title="系统设置" description="管理平台级能力。">
        <LoadingState label="正在加载系统设置" />
      </AdminPage>
    );
  if (settings.isError)
    return (
      <AdminPage title="系统设置" description="管理平台级能力。">
        <ErrorState onRetry={() => void settings.refetch()} />
      </AdminPage>
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    saveMutation.mutate();
  };
  const domains = draft.domainList || [];

  return (
    <AdminPage
      title="系统设置"
      description="按能力分组管理平台设置。所有密钥均只显示配置状态，留空不会覆盖服务端凭据。"
    >
      <form onSubmit={submit}>
        <div
          className="mb-5 overflow-x-auto border-b border-slate-200"
          role="tablist"
          aria-label="系统设置分组"
        >
          <div className="flex min-w-max gap-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`min-h-11 border-b-2 px-4 text-sm font-medium ${tab === item.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          {tab === "access" && (
            <>
              <Section
                title="平台身份"
                description="平台用户使用用户名和密码登录，邮箱在邮箱管理中单独维护。"
              >
                <Field label="站点名称">
                  <Input
                    value={draft.title || ""}
                    onChange={(event) => update("title", event.target.value)}
                  />
                </Field>
                <Field label="开放注册">
                  <Choice
                    value={draft.register}
                    onChange={(value) => update("register", Number(value))}
                    options={enabledOptions}
                  />
                </Field>
                <Field label="登录页域名可见性">
                  <Choice
                    value={draft.loginDomain}
                    onChange={(value) => update("loginDomain", Number(value))}
                    options={[
                      ["0", "公开已配置域名"],
                      ["1", "登录前隐藏域名"],
                    ]}
                  />
                </Field>
                <Field label="注册密钥">
                  <Choice
                    value={draft.regKey}
                    onChange={(value) => update("regKey", Number(value))}
                    options={[
                      ["0", "必须提供"],
                      ["1", "不使用"],
                      ["2", "可选"],
                    ]}
                  />
                </Field>
              </Section>
              <Section title="邮箱创建">
                <Field label="允许用户添加邮箱">
                  <Choice
                    value={draft.addEmail}
                    onChange={(value) => update("addEmail", Number(value))}
                    options={enabledOptions}
                  />
                </Field>
                <Field label="允许管理多个邮箱">
                  <Choice
                    value={draft.manyEmail}
                    onChange={(value) => update("manyEmail", Number(value))}
                    options={enabledOptions}
                  />
                </Field>
                <Field label="邮箱前缀最短长度">
                  <Input
                    type="number"
                    min={0}
                    max={64}
                    value={draft.minEmailPrefix || 0}
                    onChange={(event) =>
                      update("minEmailPrefix", Number(event.target.value))
                    }
                  />
                </Field>
                <Field
                  label="禁止使用的邮箱前缀"
                  wide
                  hint="每行一个，创建邮箱时会拒绝这些前缀。"
                >
                  <Area
                    value={(draft.emailPrefixFilter || []).join("\n")}
                    onChange={(value) =>
                      update("emailPrefixFilter", splitList(value))
                    }
                  />
                </Field>
              </Section>
            </>
          )}
          {tab === "mail" && (
            <Section
              title="邮件行为"
              description="控制平台是否接收、发送以及客户端自动刷新。"
            >
              <Field label="接收邮件">
                <Choice
                  value={draft.receive}
                  onChange={(value) => update("receive", Number(value))}
                  options={enabledOptions}
                />
              </Field>
              <Field label="发送邮件">
                <Choice
                  value={draft.send}
                  onChange={(value) => update("send", Number(value))}
                  options={enabledOptions}
                />
              </Field>
              <Field label="接收未匹配邮箱的邮件">
                <Choice
                  value={draft.noRecipient}
                  onChange={(value) => update("noRecipient", Number(value))}
                  options={enabledOptions}
                />
              </Field>
              <Field label="自动刷新间隔">
                <Choice
                  value={draft.autoRefresh}
                  onChange={(value) => update("autoRefresh", Number(value))}
                  options={[
                    ["0", "关闭"],
                    ["3", "3 秒"],
                    ["5", "5 秒"],
                    ["10", "10 秒"],
                    ["15", "15 秒"],
                    ["20", "20 秒"],
                  ]}
                />
              </Field>
            </Section>
          )}
          {tab === "verification" && (
            <>
              <Section
                title="Cloudflare Turnstile"
                description="注册和添加邮箱可按策略触发人机验证。"
              >
                <Field label="注册验证策略">
                  <Choice
                    value={draft.registerVerify}
                    onChange={(value) =>
                      update("registerVerify", Number(value))
                    }
                    options={[
                      ["0", "始终验证"],
                      ["1", "关闭"],
                      ["2", "达到阈值后验证"],
                    ]}
                  />
                </Field>
                <Field label="注册阈值">
                  <Input
                    type="number"
                    min={1}
                    value={draft.regVerifyCount || 1}
                    onChange={(event) =>
                      update("regVerifyCount", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="添加邮箱验证策略">
                  <Choice
                    value={draft.addEmailVerify}
                    onChange={(value) =>
                      update("addEmailVerify", Number(value))
                    }
                    options={[
                      ["0", "始终验证"],
                      ["1", "关闭"],
                      ["2", "达到阈值后验证"],
                    ]}
                  />
                </Field>
                <Field label="添加邮箱阈值">
                  <Input
                    type="number"
                    min={1}
                    value={draft.addVerifyCount || 1}
                    onChange={(event) =>
                      update("addVerifyCount", Number(event.target.value))
                    }
                  />
                </Field>
                <SecretField
                  label="Site Key"
                  isConfigured={configured(draft.siteKey)}
                  value={secrets.siteKey}
                  onChange={(value) => secret("siteKey", value)}
                />
                <SecretField
                  label="Secret Key"
                  isConfigured={configured(draft.secretKey)}
                  value={secrets.secretKey}
                  onChange={(value) => secret("secretKey", value)}
                />
              </Section>
            </>
          )}
          {tab === "delivery" && (
            <>
              <Section
                title="邮件发送通道"
                description="优先使用 Cloudflare Email；也可为各域名单独配置 Resend Token。"
              >
                <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-slate-50 p-4">
                  <span className="text-sm text-slate-600">
                    Cloudflare Email Binding
                  </span>
                  <StatusBadge
                    active={Boolean(draft.hasCfEmail)}
                    activeText="可用"
                    inactiveText="不可用"
                  />
                </div>
                {domains.map((domain) => {
                  const key = domain.replace(/^@/, "");
                  return (
                    <SecretField
                      key={domain}
                      label={`${domain} · Resend Token`}
                      isConfigured={
                        configured(draft.resendTokens?.[domain]) ||
                        configured(draft.resendTokens?.[key])
                      }
                      value={secrets.resendTokens[key] || ""}
                      onChange={(value) =>
                        secret("resendTokens", {
                          ...secrets.resendTokens,
                          [key]: value,
                        })
                      }
                    />
                  );
                })}
              </Section>
              <Section title="附件与对象存储">
                <Field label="R2 公网域名">
                  <Input
                    value={draft.r2Domain || ""}
                    placeholder="https://files.example.com"
                    onChange={(event) => update("r2Domain", event.target.value)}
                  />
                </Field>
                <div className="flex items-end justify-between rounded-xl bg-slate-50 p-3 text-sm">
                  <span>R2 Binding</span>
                  <StatusBadge
                    active={Boolean(draft.hasR2)}
                    activeText="可用"
                    inactiveText="不可用"
                  />
                </div>
                <Field label="S3 Bucket">
                  <Input
                    value={draft.bucket || ""}
                    onChange={(event) => update("bucket", event.target.value)}
                  />
                </Field>
                <Field label="Region">
                  <Input
                    value={draft.region || ""}
                    onChange={(event) => update("region", event.target.value)}
                  />
                </Field>
                <Field label="Endpoint">
                  <Input
                    value={draft.endpoint || ""}
                    onChange={(event) => update("endpoint", event.target.value)}
                  />
                </Field>
                <Field label="Path Style">
                  <Choice
                    value={draft.forcePathStyle}
                    onChange={(value) =>
                      update("forcePathStyle", Number(value))
                    }
                    options={[
                      ["1", "启用"],
                      ["0", "关闭"],
                    ]}
                  />
                </Field>
                <SecretField
                  label="S3 Access Key"
                  isConfigured={configured(draft.s3AccessKey)}
                  value={secrets.s3AccessKey}
                  onChange={(value) => secret("s3AccessKey", value)}
                />
                <SecretField
                  label="S3 Secret Key"
                  isConfigured={configured(draft.s3SecretKey)}
                  value={secrets.s3SecretKey}
                  onChange={(value) => secret("s3SecretKey", value)}
                />
              </Section>
            </>
          )}
          {tab === "push" && (
            <>
              <Section
                title="转发规则"
                description="同一范围规则同时用于机器人和其他邮箱转发。"
              >
                <Field label="转发范围">
                  <Choice
                    value={draft.ruleType}
                    onChange={(value) => update("ruleType", Number(value))}
                    options={[
                      ["0", "全部注册邮箱"],
                      ["1", "指定邮箱"],
                    ]}
                  />
                </Field>
                {draft.ruleType === 1 && (
                  <Field label="指定邮箱" wide>
                    <Area
                      value={(draft.ruleEmail || "")
                        .split(",")
                        .filter(Boolean)
                        .join("\n")}
                      onChange={(value) =>
                        update("ruleEmail", splitList(value).join(","))
                      }
                      placeholder="notice@example.com"
                    />
                  </Field>
                )}
              </Section>
              <Section title="Telegram 机器人">
                <Field label="状态">
                  <Choice
                    value={draft.tgBotStatus}
                    onChange={(value) => update("tgBotStatus", Number(value))}
                    options={enabledOptions}
                  />
                </Field>
                <SecretField
                  label="Bot Token"
                  isConfigured={configured(draft.tgBotToken)}
                  value={secrets.tgBotToken}
                  onChange={(value) => secret("tgBotToken", value)}
                />
                <Field label="Chat ID">
                  <Input
                    value={draft.tgChatId || ""}
                    onChange={(event) => update("tgChatId", event.target.value)}
                  />
                </Field>
                <Field label="邮件详情站点域名">
                  <Input
                    value={draft.customDomain || ""}
                    onChange={(event) =>
                      update("customDomain", event.target.value)
                    }
                  />
                </Field>
                <Field label="发件人展示">
                  <Choice
                    value={draft.tgMsgFrom || "only-name"}
                    onChange={(value) => update("tgMsgFrom", value)}
                    options={[
                      ["show", "完整显示"],
                      ["hide", "隐藏"],
                      ["only-name", "仅名称"],
                    ]}
                  />
                </Field>
                <Field label="正文展示">
                  <Choice
                    value={draft.tgMsgText || "hide"}
                    onChange={(value) => update("tgMsgText", value)}
                    options={[
                      ["show", "显示"],
                      ["hide", "隐藏"],
                    ]}
                  />
                </Field>
              </Section>
              <Section
                title="飞书 Webhook 机器人"
                description="新邮件入库后推送主题、收发件人、验证码与正文摘要。"
              >
                <Field label="状态">
                  <Choice
                    value={draft.feishuBotStatus}
                    onChange={(value) =>
                      update("feishuBotStatus", Number(value))
                    }
                    options={enabledOptions}
                  />
                </Field>
                <SecretField
                  label="Webhook 地址"
                  isConfigured={Boolean(draft.feishuWebhookConfigured)}
                  value={secrets.feishuWebhookUrl}
                  onChange={(value) => secret("feishuWebhookUrl", value)}
                />
                <SecretField
                  label="签名密钥"
                  isConfigured={Boolean(draft.feishuBotSecretConfigured)}
                  value={secrets.feishuBotSecret}
                  onChange={(value) => secret("feishuBotSecret", value)}
                />
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={testFeishu.isPending}
                    disabled={!draft.feishuWebhookConfigured}
                    onClick={() => testFeishu.mutate()}
                  >
                    <Send className="size-4" />
                    测试
                  </Button>
                  {draft.feishuWebhookConfigured && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-700"
                      loading={removeFeishu.isPending}
                      onClick={() => setRemoveFeishuOpen(true)}
                    >
                      <Trash2 className="size-4" />
                      移除
                    </Button>
                  )}
                </div>
              </Section>
              <Section title="转发到其他邮箱">
                <Field label="状态">
                  <Choice
                    value={draft.forwardStatus}
                    onChange={(value) => update("forwardStatus", Number(value))}
                    options={enabledOptions}
                  />
                </Field>
                <Field label="目标邮箱" wide>
                  <Area
                    value={(draft.forwardEmail || "")
                      .split(",")
                      .filter(Boolean)
                      .join("\n")}
                    onChange={(value) =>
                      update("forwardEmail", splitList(value).join(","))
                    }
                  />
                </Field>
              </Section>
            </>
          )}
          {tab === "content" && (
            <>
              <Section
                title="邮件黑名单"
                description="匹配后拒绝邮件。多个规则请分行填写。"
              >
                <Field label="发件邮箱或域名">
                  <Area
                    value={(draft.blackFrom || "")
                      .split(",")
                      .filter(Boolean)
                      .join("\n")}
                    onChange={(value) =>
                      update("blackFrom", splitList(value).join(","))
                    }
                  />
                </Field>
                <Field label="主题关键词">
                  <Area
                    value={(draft.blackSubject || "")
                      .split(",")
                      .filter(Boolean)
                      .join("\n")}
                    onChange={(value) =>
                      update("blackSubject", splitList(value).join(","))
                    }
                  />
                </Field>
                <Field label="正文关键词" wide>
                  <Area
                    value={(draft.blackContent || "")
                      .split(",")
                      .filter(Boolean)
                      .join("\n")}
                    onChange={(value) =>
                      update("blackContent", splitList(value).join(","))
                    }
                  />
                </Field>
              </Section>
              <Section title="公告">
                <Field label="显示公告">
                  <Choice
                    value={draft.notice}
                    onChange={(value) => update("notice", Number(value))}
                    options={enabledOptions}
                  />
                </Field>
                <Field label="公告类型">
                  <Choice
                    value={draft.noticeType || "info"}
                    onChange={(value) => update("noticeType", value)}
                    options={[
                      ["info", "信息"],
                      ["success", "成功"],
                      ["warning", "警告"],
                      ["error", "错误"],
                    ]}
                  />
                </Field>
                <Field label="标题">
                  <Input
                    value={draft.noticeTitle || ""}
                    onChange={(event) =>
                      update("noticeTitle", event.target.value)
                    }
                  />
                </Field>
                <Field label="显示时长（毫秒，0 为持续）">
                  <Input
                    type="number"
                    min={0}
                    value={draft.noticeDuration || 0}
                    onChange={(event) =>
                      update("noticeDuration", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="公告内容" wide>
                  <Area
                    value={draft.noticeContent || ""}
                    onChange={(value) => update("noticeContent", value)}
                  />
                </Field>
              </Section>
              <Section title="AI 验证码提取">
                <Field label="自动提取">
                  <Choice
                    value={draft.aiCode}
                    onChange={(value) => update("aiCode", Number(value))}
                    options={enabledOptions}
                  />
                </Field>
                <Field
                  label="仅处理这些发件邮箱或域名"
                  wide
                  hint="留空表示不限制。"
                >
                  <Area
                    value={(draft.aiCodeFilter || "")
                      .split(",")
                      .filter(Boolean)
                      .join("\n")}
                    onChange={(value) =>
                      update("aiCodeFilter", splitList(value).join(","))
                    }
                  />
                </Field>
              </Section>
            </>
          )}
        </div>
        <div className="sticky bottom-3 z-10 mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>密钥留空不会修改现有配置</span>
            {settings.data && (
              <CheckCircle2 className="size-4 text-emerald-600" />
            )}
          </div>
          <Button type="submit" loading={saveMutation.isPending}>
            <Save className="size-4" />
            保存全部设置
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={removeFeishuOpen}
        title="移除飞书 Webhook？"
        description="Webhook 地址和签名密钥将从平台配置中清除，新邮件将不再推送到飞书。"
        confirmLabel="移除配置"
        destructive
        loading={removeFeishu.isPending}
        onOpenChange={setRemoveFeishuOpen}
        onConfirm={() =>
          removeFeishu.mutate(undefined, {
            onSuccess: () => setRemoveFeishuOpen(false),
          })
        }
      />
    </AdminPage>
  );
}
