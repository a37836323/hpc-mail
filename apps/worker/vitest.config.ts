import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        // AI 无本地模拟；单测不真正调用 AI，关闭远程绑定避免要求 CF 凭据
        remoteBindings: false,
        wrangler: { configPath: './wrangler.test.toml' },
        miniflare: {
          bindings: {
            jwt_secret: 'test-jwt-secret-for-vitest-only-0000000000',
            resend_webhook_secret: 'whsec_dGVzdHNlY3JldGtleWZvcnZpdGVzdA==',
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
