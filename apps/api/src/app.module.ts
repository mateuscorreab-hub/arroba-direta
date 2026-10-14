import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { lerModoEnvio, MODO_ENVIO } from './auth/modo-envio.js';
import { DbModule } from './db/db.module.js';
import { APROVACAO_LOTES, lerAprovacaoLotes } from './lotes/aprovacao-lotes.js';
import { LotesController } from './lotes/lotes.controller.js';
import { LotesService } from './lotes/lotes.service.js';
import { NegociacaoController } from './negociacao/negociacao.controller.js';
import { NegociacaoService } from './negociacao/negociacao.service.js';
import { SaudeController } from './saude/saude.controller.js';

@Module({
  imports: [DbModule],
  controllers: [SaudeController, AuthController, LotesController, NegociacaoController],
  providers: [
    // Lidos ao subir: com CODIGO_MODO ou APROVACAO_LOTES inválido a API não inicia.
    { provide: MODO_ENVIO, useFactory: () => lerModoEnvio() },
    { provide: APROVACAO_LOTES, useFactory: () => lerAprovacaoLotes() },
    AuthService,
    LotesService,
    NegociacaoService,
  ],
})
export class AppModule {}
