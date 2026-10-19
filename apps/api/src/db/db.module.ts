import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export const DB = Symbol('DB');
export type Db = NodePgDatabase<typeof schema>;
/** O `tx` de db.transaction(async (tx) => ...). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const POOL = Symbol('POOL');

// Um pool por app: os testes sobem mais de um app no mesmo arquivo e fecham cada um.
@Global()
@Module({
  providers: [
    {
      provide: POOL,
      useFactory: () =>
        new pg.Pool({
          connectionString:
            process.env.DATABASE_URL ?? 'postgres://arroba:arroba@localhost:5432/arroba_direta',
        }),
    },
    { provide: DB, useFactory: (pool: pg.Pool) => drizzle(pool, { schema }), inject: [POOL] },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
