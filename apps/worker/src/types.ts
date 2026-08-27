import type { ApiScope, Role, UserStatus } from '@hpc-mail/shared';

/** Worker 运行时绑定与变量（对应 wrangler.toml） */
export interface Env {
  db: D1Database;
  kv: KVNamespace;
  r2: R2Bucket;
  ai: Ai;
  assets: Fetcher;
  /** send_email binding：域名接入 Email Sending 后可发任意外部地址 */
  email: SendEmail;
  /** [vars] ai_model：验证码兜底模型 */
  ai_model: string;
  /** secret：JWT 签名密钥 */
  jwt_secret: string;
}

/** 内部 API 鉴权后的用户上下文 */
export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  avatarKey: string | null;
  twoFactorEnabled: boolean;
}

/** /v1 API Key 鉴权后的上下文 */
export interface ApiKeyContext {
  id: number;
  userId: number;
  role: Role;
  scopes: ApiScope[];
}

export interface AppVariables {
  requestId: string;
  user?: AuthUser;
  sessionId?: string;
  apiKey?: ApiKeyContext;
  apiClientIp?: string;
  apiStartedAt?: number;
}

/** Hono 泛型上下文 */
export interface AppContext {
  Bindings: Env;
  Variables: AppVariables;
}

/** waitUntil 的最小结构类型（兼容 CF 与 Hono 的 ExecutionContext） */
export interface ExecCtx {
  waitUntil(promise: Promise<unknown>): void;
}
