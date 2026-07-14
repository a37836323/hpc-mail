import { applyD1Migrations, env } from 'cloudflare:test';

// 每个测试文件的隔离存储在运行前应用全部 migration
await applyD1Migrations(env.db, env.TEST_MIGRATIONS);
