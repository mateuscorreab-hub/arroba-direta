import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { lerModoEnvio, MODO_ENVIO } from './auth/modo-envio.js';
import { DbModule } from './db/db.module.js';
import { LotesController } from './lotes/lotes.controller.js';
import { LotesService } from './lotes/lotes.service.js';
import { SaudeController } from './saude/saude.controller.js';

@Module({
  imports: [DbModule],
  controllers: [SaudeController, AuthController, LotesController],
  providers: [
    // Lido ao subir: com CODIGO_MODO inválido a API não inicia.
    { provide: MODO_ENVIO, useFactory: () => lerModoEnvio() },
    AuthService,
    LotesService,
  ],
})
export class AppModule {}
