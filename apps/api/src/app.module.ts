import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module.js';
import { LotesController } from './lotes/lotes.controller.js';
import { LotesService } from './lotes/lotes.service.js';
import { SaudeController } from './saude/saude.controller.js';

@Module({
  imports: [DbModule],
  controllers: [SaudeController, LotesController],
  providers: [LotesService],
})
export class AppModule {}
