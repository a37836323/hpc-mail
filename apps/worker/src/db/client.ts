import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../types.js';
import * as schema from './schema.js';

export function createDb(env: Env) {
  return drizzle(env.db, { schema });
}

export type Db = ReturnType<typeof createDb>;
