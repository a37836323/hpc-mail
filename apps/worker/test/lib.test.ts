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
import { injectAttachmentLinks } from '../src/services/outbound.js';
import { ipInAllowList } from '../src/lib/ip-allowlist.js';
import { foldBase64 } from '../src/lib/mime.js';
import { generateCode, generateTotpSecret, verifyTotp } from '../src/lib/totp.js';
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

describe('ip-allowlist', () => {
  it('空白名单放行', () => {
    expect(ipInAllowList('1.2.3.4', [])).toBe(true);
  });
  it('IPv4 精确匹配', () => {
    expect(ipInAllowList('1.2.3.4', ['1.2.3.4'])).toBe(true);
    expect(ipInAllowList('1.2.3.5', ['1.2.3.4'])).toBe(false);
  });
  it('IPv4 CIDR', () => {
    expect(ipInAllowList('192.168.1.55', ['192.168.1.0/24'])).toBe(true);
    expect(ipInAllowList('192.168.2.55', ['192.168.1.0/24'])).toBe(false);
    expect(ipInAllowList('10.0.0.1', ['0.0.0.0/0'])).toBe(true);
  });
  it('IPv6 精确匹配（压缩与展开等价）', () => {
    expect(ipInAllowList('2001:db8::1', ['2001:db8::1'])).toBe(true);
    expect(ipInAllowList('2001:0db8:0000:0000:0000:0000:0000:0001', ['2001:db8::1'])).toBe(true);
    expect(ipInAllowList('::1', ['::1'])).toBe(true);
  });
  it('IPv6 CIDR（此前静默锁死的场景）', () => {
    expect(ipInAllowList('2001:db8::abcd', ['2001:db8::/32'])).toBe(true);
    expect(ipInAllowList('2001:db9::1', ['2001:db8::/32'])).toBe(false);
    expect(ipInAllowList('fe80::1', ['fe80::/10'])).toBe(true);
  });
  it('跨协议族不误匹配', () => {
    expect(ipInAllowList('1.2.3.4', ['2001:db8::/32'])).toBe(false);
    expect(ipInAllowList('2001:db8::1', ['192.168.0.0/16'])).toBe(false);
  });
});

describe('totp', () => {
  // RFC 6238 测试向量（seed=ascii "12345678901234567890" → base32）
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it('匹配 RFC 6238 向量', async () => {
    expect(await generateCode(RFC_SECRET, 1)).toBe('287082');
    expect(await generateCode(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
  });
  it('当前时间码 verifyTotp 往返成功', async () => {
    const secret = generateTotpSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = await generateCode(secret, counter);
    expect(await verifyTotp(secret, code)).toBe(true);
  });
  it('非法/错误码被拒', async () => {
    const secret = generateTotpSecret();
    expect(await verifyTotp(secret, '000000')).toBe(false);
    expect(await verifyTotp(secret, 'abc')).toBe(false);
    expect(await verifyTotp(secret, '')).toBe(false);
  });
});

describe('foldBase64', () => {
  it('短串（≤76）原样返回', () => {
    expect(foldBase64('QUJD')).toBe('QUJD');
    expect(foldBase64('A'.repeat(76))).toBe('A'.repeat(76));
  });
  it('长串按 76 字符 CRLF 折行，每行不超限', () => {
    const b64 = btoa(String.fromCharCode(...new Uint8Array(10000).fill(7)));
    const folded = foldBase64(b64);
    const lines = folded.split('\r\n');
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(76);
    expect(lines.slice(0, -1).every((l) => l.length === 76)).toBe(true);
  });
  it('折行后去掉 CRLF 与原串一致（内容无损）', () => {
    const b64 = btoa(String.fromCharCode(...new Uint8Array(5000).map((_, i) => i % 251)));
    expect(foldBase64(b64).replace(/\r\n/g, '')).toBe(b64);
  });
});

describe('injectAttachmentLinks', () => {
  const links = [{ filename: 'a.pdf', size: 9_500_000, url: 'https://hpc.email/api/attachments/1?exp=1&sig=x' }];

  it('纯文本邮件不生成 html part（否则收件端优先渲染 html，正文被链接块盖掉）', () => {
    const out = injectAttachmentLinks('很长的正文', '', links);
    expect(out.html).toBe('');
    expect(out.text).toContain('很长的正文');
    expect(out.text).toContain('a.pdf');
    expect(out.text).toContain('https://hpc.email/api/attachments/1?exp=1&sig=x');
  });

  it('HTML 邮件只追加到 html，不凭空造 text part', () => {
    const out = injectAttachmentLinks('', '<p>很长的正文</p>', links);
    expect(out.text).toBe('');
    expect(out.html).toContain('<p>很长的正文</p>');
    expect(out.html).toContain('<a href="https://hpc.email/api/attachments/1?exp=1&sig=x">a.pdf</a>');
  });

  it('text + html 都有时各追加一份；无链接时原样返回', () => {
    const both = injectAttachmentLinks('文本', '<p>富文本</p>', links);
    expect(both.text).toContain('文本');
    expect(both.text).toContain('a.pdf');
    expect(both.html).toContain('<p>富文本</p>');
    expect(both.html).toContain('a.pdf');
    expect(injectAttachmentLinks('文本', '', [])).toEqual({ text: '文本', html: '' });
  });
});
