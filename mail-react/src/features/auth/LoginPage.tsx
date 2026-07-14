import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";
import { authApi } from "./authApi";
import { TurnstileWidget } from "./TurnstileWidget";

type Mode = "login" | "register";
type Errors = Partial<
  Record<
    | "username"
    | "password"
    | "confirmPassword"
    | "code"
    | "verification"
    | "service",
    string
  >
>;

const validUsername = /^[a-zA-Z0-9_-](?:[a-zA-Z0-9._-]{1,30}[a-zA-Z0-9_-])?$/;

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs leading-5 text-slate-500">{hint}</p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const setToken = useAuthStore((state) => state.setToken);
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forceTurnstile, setForceTurnstile] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const usernameRef = useRef<HTMLInputElement>(null);
  const config = useQuery({
    queryKey: ["auth", "config"],
    queryFn: ({ signal }) => authApi.config(signal),
    staleTime: 60_000,
  });
  const registrationEnabled = config.data?.register !== 1;
  const needsCode = config.data?.regKey === 0 || config.data?.regKey === 2;
  const codeRequired = config.data?.regKey === 0;
  const needsTurnstile =
    mode === "register" &&
    (config.data?.registerVerify === 0 ||
      (config.data?.registerVerify === 2 &&
        (Boolean(config.data.regVerifyOpen) || forceTurnstile)));
  const receiveVerifyToken = useCallback((token: string) => {
    setVerifyToken(token);
    if (token)
      setErrors((current) => ({ ...current, verification: undefined }));
  }, []);

  useEffect(() => {
    usernameRef.current?.focus();
  }, [mode]);

  async function establishSession(token: string) {
    setToken(token);
    navigate("/inbox", { replace: true });
  }

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(username.trim(), password),
    onSuccess: (data) => void establishSession(data.token),
    onError: () =>
      setErrors((current) => ({
        ...current,
        service: "用户名或密码不正确，请重新输入。",
      })),
  });
  const registerMutation = useMutation({
    mutationFn: async () => {
      const registered = await authApi.register({
        username: username.trim(),
        displayName: username.trim(),
        password,
        code: code.trim() || null,
        token: verifyToken || undefined,
      });
      return registered.token
        ? { token: registered.token }
        : authApi.login(username.trim(), password);
    },
    onSuccess: (data) => void establishSession(data.token),
    onError: (error) => {
      const value = error as {
        code?: number;
        httpStatus?: number | null;
        payload?: unknown;
        regVerifyOpen?: boolean;
      };
      const payload = value.payload as
        | { regVerifyOpen?: boolean }
        | null
        | undefined;
      const badRequest = value.code === 400 || value.httpStatus === 400;
      const verificationRequired =
        badRequest &&
        (config.data?.registerVerify === 2 ||
          payload?.regVerifyOpen === true ||
          value.regVerifyOpen === true);
      setVerifyToken("");
      setTurnstileResetKey((current) => current + 1);
      if (verificationRequired) {
        setForceTurnstile(true);
        setErrors((current) => ({
          ...current,
          verification: "请先完成安全验证，再重新提交注册。",
          service:
            error instanceof Error ? error.message : "服务端要求完成安全验证。",
        }));
        return;
      }
      setErrors((current) => ({
        ...current,
        service:
          error instanceof Error
            ? error.message
            : "创建账户失败，请检查信息后重试。",
      }));
    },
  });

  function validate(): boolean {
    const next: Errors = {};
    const normalized = username.trim();
    if (!normalized) next.username = "请输入用户名。";
    else if (
      normalized.length < 3 ||
      normalized.length > 32 ||
      !validUsername.test(normalized)
    )
      next.username = "用户名应为 3–32 位字母、数字、点、下划线或短横线。";
    if (!password) next.password = "请输入密码。";
    else if (mode === "register" && password.length < 6)
      next.password = "密码至少需要 6 个字符。";
    else if (mode === "register" && password.length > 30)
      next.password = "密码最多允许 30 个字符。";
    if (mode === "register" && password !== confirmPassword)
      next.confirmPassword = "两次输入的密码不一致。";
    if (mode === "register" && codeRequired && !code.trim())
      next.code = "请输入注册密钥。";
    if (mode === "register" && needsTurnstile && !verifyToken)
      next.verification = "请完成安全验证。";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (mode === "login") loginMutation.mutate();
    else registerMutation.mutate();
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setErrors({});
    setPassword("");
    setConfirmPassword("");
    setVerifyToken("");
    setForceTurnstile(false);
  }

  const pending = loginMutation.isPending || registerMutation.isPending;
  return (
    <main className="grid h-dvh content-start overflow-y-auto bg-slate-50 px-4 py-[max(2rem,env(safe-area-inset-top))] text-slate-950 sm:content-center sm:place-items-center sm:py-10">
      <section className="w-full max-w-[400px]" aria-labelledby="auth-title">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white">
            <Mail className="size-5" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold">
            {config.data?.title || "HPC Mail"}
          </span>
        </div>
        <form
          className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          noValidate
          onSubmit={submit}
        >
          <header>
            <h1
              id="auth-title"
              className="text-2xl font-semibold tracking-tight"
            >
              {mode === "login" ? "欢迎回来" : "创建平台账户"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {mode === "login"
                ? "使用用户名和密码登录。"
                : "一个账户可以管理多个域名与邮箱。"}
            </p>
          </header>
          {errors.service && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
              role="alert"
            >
              {errors.service}
            </div>
          )}
          <Field
            id="auth-username"
            label="用户名"
            error={errors.username}
            hint={
              mode === "register"
                ? "3–32 位，可使用字母、数字、点、下划线和短横线。"
                : undefined
            }
          >
            <div className="relative">
              <UserRound
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="auth-username"
                ref={usernameRef}
                className="h-11 pl-10"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                invalid={Boolean(errors.username)}
                aria-describedby={
                  errors.username ? "auth-username-error" : undefined
                }
              />
            </div>
          </Field>
          <Field id="auth-password" label="密码" error={errors.password}>
            <div className="relative">
              <LockKeyhole
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="auth-password"
                className="h-11 px-10"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "auth-password-error" : undefined
                }
              />
              <button
                type="button"
                className="absolute right-0 top-0 grid size-11 place-items-center rounded-lg text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </Field>
          {mode === "register" && (
            <Field
              id="auth-confirm"
              label="确认密码"
              error={errors.confirmPassword}
            >
              <Input
                id="auth-confirm"
                className="h-11"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                invalid={Boolean(errors.confirmPassword)}
                aria-describedby={
                  errors.confirmPassword ? "auth-confirm-error" : undefined
                }
              />
            </Field>
          )}
          {mode === "register" && needsCode && (
            <Field
              id="auth-code"
              label={codeRequired ? "注册密钥" : "注册密钥（可选）"}
              error={errors.code}
            >
              <Input
                id="auth-code"
                className="h-11"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? "auth-code-error" : undefined}
              />
            </Field>
          )}
          {needsTurnstile && (
            <div className="grid gap-1.5">
              <TurnstileWidget
                siteKey={config.data?.siteKey || ""}
                resetKey={turnstileResetKey}
                onToken={receiveVerifyToken}
              />
              {errors.verification && (
                <p className="text-sm text-red-700" role="alert">
                  {errors.verification}
                </p>
              )}
            </div>
          )}
          <Button type="submit" className="h-11 w-full" loading={pending}>
            {mode === "login" ? "登录" : "创建账户"}
          </Button>
          {registrationEnabled && (
            <button
              type="button"
              className="min-h-11 text-sm text-slate-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() =>
                switchMode(mode === "login" ? "register" : "login")
              }
            >
              {mode === "login" ? "没有账户？创建账户" : "已有账户？返回登录"}
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
