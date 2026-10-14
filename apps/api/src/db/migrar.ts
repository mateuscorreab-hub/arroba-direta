/** Aplica as migrations da pasta drizzle/. Usado no deploy, onde não há drizzle-kit. */
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://arroba:arroba@localhost:5432/arroba_direta',
});

// Funciona tanto em src/db (tsx) quanto em dist/db (compilado): a pasta fica dois níveis acima.
await migrate(drizzle(pool), { migrationsFolder: path.join(import.meta.dirname, '../../drizzle') });
await pool.end();
console.log('Migrations aplicadas.');
