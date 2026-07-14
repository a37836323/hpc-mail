import { describe, expect, it } from 'vitest';
import { constantTimeEqual, hashPassword, verifyPassword } from '../src/lib/password.js';
import { signToken, verifyToken } from '../src/lib/jwt.js';
import { decodeCursor, encodeCursor } from '../src/lib/pagination.js';
import {
  assertNoHeaderInjection,
  getEmailDomain,
  normalizeEmail,
  validateLocalPart,
} from '../src/lib/email-address.js';
import { extractCodeByRegex } from '../src/services/code-extract.js';
import { AppError } from '../src/lib/errors.js';

const SECRET = 'unit-test-secret-key-000000000000';

describe('password', () => {
  it('hash/verify 往返成功', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('pbkdf2-sha256$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
  it('非法哈希格式返回 false', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
  it('常量时间比较', () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(constantTimeEqual(a, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(a, new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(a, new Uint8Array([1, 2]))).toBe(false);
  });
});

describe('jwt', () => {
  it('签发并校验通过', async () => {
    const token = await signToken(SECRET, { sub: 7, sid: 'abc', epoch: 0, uepoch: 1 });
    const claims = await verifyToken(SECRET, token);
    expect(claims?.sub).toBe(7);
    expect(claims?.sid).toBe('abc');
    expect(claims?.uepoch).toBe(1);
  });
  it('过期令牌返回 null', async () => {
    const token = await signToken(SECRET, { sub: 1, sid: 's', epoch: 0, uepoch: 0 }, -10);
    expect(await verifyToken(SECRET, token)).toBeNull();
  });
  it('篡改签名返回 null', async () => {
    const token = await signToken(SECRET, { sub: 1, sid: 's', epoch: 0, uepoch: 0 });
    const tampered = `${token.slice(0, -2)}xy`;
    expect(await verifyToken(SECRET, tampered)).toBeNull();
  });
  it('错误密钥返回 null', async () => {
    const token = await signToken(SECRET, { sub: 1, sid: 's', epoch: 0, uepoch: 0 });
    expect(await verifyToken('another-secret', token)).toBeNull();
  });
});

describe('pagination', () => {
  it('编解码往返', () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
  });
  it('非法游标返回 null', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('!!!not base64!!!')).toBeNull();
    expect(decodeCursor(btoa('-3'))).toBeNull();
    expect(decodeCursor(btoa('abc'))).toBeNull();
  });
});

describe('email-address', () => {
  it('归一化与取域名', () => {
    expect(normalizeEmail('  Foo@HPC.Email ')).toBe('foo@hpc.email');
    expect(getEmailDomain('a@b.com')).toBe('b.com');
  });
  it('头注入断言抛错', () => {
    expect(() => assertNoHeaderInjection('safe')).not.toThrow();
    expect(() => assertNoHeaderInjection('bad\r\nInjected: 1')).toThrow(AppError);
  });
  it('validateLocalPart 归一化并拒绝非法', () => {
    expect(validateLocalPart(' Test.User ')).toBe('test.user');
    expect(() => validateLocalPart('.bad')).toThrow(AppError);
    expect(() => validateLocalPart('a b')).toThrow(AppError);
  });
});

describe('code-extract 正则', () => {
  it('英文 code 关键词', () => {
    expect(extractCodeByRegex('', 'Your verification code is 482913. Thanks')).toBe('482913');
  });
  it('中文验证码', () => {
    expect(extractCodeByRegex('登录验证码', '您的验证码为 6391，请勿泄露')).toBe('6391');
  });
  it('多候选取最近关键词', () => {
    const body = '订单号 99887766 已生成。验证码：551203，五分钟内有效';
    expect(extractCodeByRegex('', body)).toBe('551203');
  });
  it('字母数字混合码', () => {
    expect(extractCodeByRegex('', 'Your OTP code: A1B2C3')).toBe('A1B2C3');
  });
  it('无关键词不误报', () => {
    expect(extractCodeByRegex('', '订单号 99887766 已发货')).toBe('');
  });
  it('无候选返回空', () => {
    expect(extractCodeByRegex('', 'your verification code is coming soon')).toBe('');
  });
});
