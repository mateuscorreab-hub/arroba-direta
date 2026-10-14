import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export const DB = Symbol('DB');
export type Db = NodePgDatabase<typeof schema>;

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://arroba:arroba@localhost:5432/arroba_direta',
});

@Global()
@Module({
  providers: [{ provide: DB, useValue: drizzle(pool, { schema }) }],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown() {
    await pool.end();
  }
}
