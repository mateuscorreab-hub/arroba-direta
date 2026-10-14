import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';

@Controller('saude')
export class SaudeController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async verificar() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}
