import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { lerModoEnvio, MODO_ENVIO } from './auth/modo-envio.js';
import { DbModule } from './db/db.module.js';
import { APROVACAO_LOTES, lerAprovacaoLotes } from './lotes/aprovacao-lotes.js';
import { LotesController, MeusLotesController } from './lotes/lotes.controller.js';
import { LotesService } from './lotes/lotes.service.js';
import { ARMAZENAMENTO, type Armazenamento } from './midias/armazenamento.js';
import { ArmazenamentoModule } from './midias/armazenamento.module.js';
import { ArmazenamentoLocal } from './midias/local.js';
import { MidiasLocalController } from './midias/midias-local.controller.js';
import { EstadoMidiasController, MidiasController } from './midias/midias.controller.js';
import { MidiasService } from './midias/midias.service.js';
import { NegociacaoController } from './negociacao/negociacao.controller.js';
import { NegociacaoService } from './negociacao/negociacao.service.js';
import { SaudeController } from './saude/saude.controller.js';

@Module({
  imports: [
    DbModule,
    ArmazenamentoModule,
    // Multipart só em POST /midias/local (modo local); com o Cloudinary o app envia direto para lá.
    MulterModule.registerAsync({
      imports: [ArmazenamentoModule],
      inject: [ARMAZENAMENTO],
      useFactory: (a: Armazenamento | null) => (a instanceof ArmazenamentoLocal ? a.opcoesMulter() : {}),
    }),
  ],
  controllers: [
    SaudeController,
    AuthController,
    LotesController,
    MeusLotesController,
    MidiasController,
    EstadoMidiasController,
    MidiasLocalController,
    NegociacaoController,
  ],
  providers: [
    // Lidos ao subir: com CODIGO_MODO ou APROVACAO_LOTES inválido a API não inicia.
    { provide: MODO_ENVIO, useFactory: () => lerModoEnvio() },
    { provide: APROVACAO_LOTES, useFactory: () => lerAprovacaoLotes() },
    AuthService,
    LotesService,
    MidiasService,
    NegociacaoService,
  ],
})
export class AppModule {}
