import type {
  DisableTwoFactorRequest,
  TwoFactorEnabled,
  TwoFactorSetup,
} from '@hpc-mail/shared';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { verifyPassword } from '../lib/password.js';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from '../lib/totp.js';
import type { Env } from '../types.js';

/** 开始登记：生成密钥（未启用），返回 otpauth URI 供扫码 */
export async function setupTwoFactor(env: Env, userId: number): Promise<TwoFactorSetup> {
  const db = createDb(env);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AppError('not_found', '用户不存在');
  if (user.totpEnabledAt) throw new AppError('conflict', '两步验证已启用');
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpSecret: secret, totpEnabledAt: null, totpRecoveryCodes: null })
    .where(eq(users.id, userId));
  return { secret, otpauthUri: otpauthUri(secret, user.username) };
}

/** 校验一次性码并启用，返回一次性恢复码 */
export async function enableTwoFactor(
  env: Env,
  userId: number,
  code: string,
): Promise<TwoFactorEnabled> {
  const db = createDb(env);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.totpSecret) throw new AppError('validation_failed', '请先开始登记');
  if (user.totpEnabledAt) throw new AppError('conflict', '两步验证已启用');
  if (!(await verifyTotp(user.totpSecret, code))) {
    throw new AppError('bad_credentials', '验证码错误，请重试');
  }
  const { plain, hashes } = await generateRecoveryCodes();
  await db
    .update(users)
    .set({ totpEnabledAt: new Date(), totpRecoveryCodes: hashes })
    .where(eq(users.id, userId));
  return { recoveryCodes: plain };
}

/** 关闭两步验证：需当前密码或有效 TOTP 码 */
export async function disableTwoFactor(
  env: Env,
  userId: number,
  req: DisableTwoFactorRequest,
): Promise<void> {
  const db = createDb(env);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AppError('not_found', '用户不存在');
  if (user.totpEnabledAt) {
    let verified = false;
    if (req.password) verified = await verifyPassword(req.password, user.passwordHash);
    if (!verified && req.code && user.totpSecret) {
      verified = await verifyTotp(user.totpSecret, req.code);
    }
    if (!verified) throw new AppError('bad_credentials', '密码或验证码错误');
  }
  await db
    .update(users)
    .set({ totpSecret: null, totpEnabledAt: null, totpRecoveryCodes: null })
    .where(eq(users.id, userId));
}
