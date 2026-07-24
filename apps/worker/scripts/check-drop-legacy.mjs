#!/usr/bin/env node
/**
 * 校验 drop-legacy.sql 覆盖了 migrations 里建的每一张表。
 *
 * 清库流程会 DROP d1_migrations 让迁移从 0000 全量重放，所以漏 DROP 任何一张表，
 * 重放到建该表的那次迁移就会报 "table X already exists" —— 而此时 users/messages
 * 已经被删光，deploy 与 seed-admin 都不会执行，库停在不可恢复的半残状态。
 * （历史上漏过 stars / admin_audit_logs / draft_attachments 三张。）
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'migrations');

const created = new Set();
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi)) {
    created.add(m[1]);
  }
}

const dropSql = readFileSync(join(root, 'scripts', 'drop-legacy.sql'), 'utf8');
const dropped = new Set(
  [...dropSql.matchAll(/DROP TABLE(?: IF EXISTS)?\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi)].map((m) => m[1]),
);

const missing = [...created].filter((t) => !dropped.has(t)).sort();
if (missing.length) {
  console.error(
    `drop-legacy.sql 漏了 ${missing.length} 张 migrations 建的表：${missing.join(', ')}\n` +
      '清库重建会在迁移重放时撞 "table already exists" 而中断，请补上对应的 DROP TABLE IF EXISTS。',
  );
  process.exit(1);
}
console.log(`drop-legacy.sql 覆盖检查通过（${created.size} 张表）`);
