#!/usr/bin/env node
// 幂等 admin 引导：库内无 admin 时插入（CI 部署后执行；本地传 --local）
// 显式传 --reset 时，覆盖指定 admin 的密码并递增用户代，使旧会话失效。
// 哈希格式与 worker src/lib/password.ts 完全一致：pbkdf2-sha256$100000$<salt>$<hash>（base64url）
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const username = (process.env.ADMIN_USERNAME ?? '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
// --if-env：一键部署等无凭据场景下静默跳过（可稍后手动执行本脚本引导管理员）
if (process.argv.includes('--if-env') && (!username || !password)) {
  console.log('未提供 ADMIN_USERNAME/ADMIN_PASSWORD，跳过管理员引导；稍后可手动执行本脚本创建管理员');
  process.exit(0);
}
if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) {
  console.error('ADMIN_USERNAME 非法（3-32 位小写字母/数字/-_）');
  process.exit(1);
}
if (password.length < 12 || password.length > 128) {
  console.error('ADMIN_PASSWORD 需 12-128 位');
  process.exit(1);
}

const ITERATIONS = 100000;
const toB64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
  key,
  32 * 8,
);
const hash = `pbkdf2-sha256$${ITERATIONS}$${toB64url(salt)}$${toB64url(new Uint8Array(bits))}`;

const seedSql = `INSERT INTO users (username, password_hash, role, status)
SELECT '${username}', '${hash}', 'admin', 'active'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');`;

const target = process.argv.includes('--local') ? '--local' : '--remote';
const workerDir = new URL('..', import.meta.url).pathname;
const wrangler = (...args) =>
  execFileSync('npx', ['wrangler', ...args], {
    cwd: workerDir,
    encoding: 'utf8',
  });

// 'db'/'kv' 是 wrangler.toml 里的 binding 名，兼容一键部署自动创建的资源和 CI 注入的资源。
wrangler('d1', 'execute', 'db', target, '--command', seedSql);

if (!process.argv.includes('--reset')) {
  console.log(`admin 引导完成（已存在则跳过）：${username}`);
  process.exit(0);
}

const resetSql = `UPDATE users
SET password_hash = '${hash}', status = 'active'
WHERE username = '${username}' AND role = 'admin';
SELECT id FROM users WHERE username = '${username}' AND role = 'admin' LIMIT 1;`;
const resetResult = JSON.parse(
  wrangler('d1', 'execute', 'db', target, '--json', '--command', resetSql),
);
const statements = Array.isArray(resetResult) ? resetResult : [];
const userId = statements.flatMap((statement) => statement.results ?? []).at(-1)?.id;
if (!Number.isInteger(userId)) {
  console.error(`未找到要重置的 admin：${username}`);
  process.exit(1);
}

const epochKey = `uepoch:${userId}`;
let currentEpoch = 0;
try {
  currentEpoch = Number(wrangler('kv', 'key', 'get', epochKey, '--binding', 'kv', target, '--text').trim()) || 0;
} catch {
  // KV 中没有该 key 时用户代默认为 0。
}
wrangler('kv', 'key', 'put', epochKey, String(currentEpoch + 1), '--binding', 'kv', target);
console.log(`admin 密码已重置，旧会话已失效：${username}`);
