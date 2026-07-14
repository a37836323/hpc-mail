#!/usr/bin/env node
// 幂等 admin 引导：库内无 admin 时插入（CI 部署后执行；本地传 --local）
// 哈希格式与 worker src/lib/password.ts 完全一致：pbkdf2-sha256$100000$<salt>$<hash>（base64url）
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const username = (process.env.ADMIN_USERNAME ?? '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
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

const sql = `INSERT INTO users (username, password_hash, role, status)
SELECT '${username}', '${hash}', 'admin', 'active'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');`;

const target = process.argv.includes('--local') ? '--local' : '--remote';
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'hpc-cloud-mail-db', target, '--command', sql],
  { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname },
);
console.log(`admin 引导完成（已存在则跳过）：${username}`);
