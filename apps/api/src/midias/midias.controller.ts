import {
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  envioMidiaSchema,
  ordemMidiasSchema,
  registrarMidiaSchema,
  type OrdemMidias,
  type PedidoEnvioMidia,
  type RegistrarMidia,
} from '@arroba/shared';
import { AutenticadoGuard } from '../auth/autenticado.guard.js';
import { ZodPipe } from '../comum/zod.pipe.js';
import { MidiasService } from './midias.service.js';
import { VendedorDoLoteGuard } from './vendedor-do-lote.guard.js';

/** Fotos e vídeo do lote. Só o vendedor do lote mexe aqui. */
@Controller('lotes/:id/midias')
@UseGuards(AutenticadoGuard, VendedorDoLoteGuard)
export class MidiasController {
  constructor(private readonly midias: MidiasService) {}

  @Post('envio')
  pedirEnvio(@Param('id') loteId: string, @Body(new ZodPipe(envioMidiaSchema)) pedido: PedidoEnvioMidia) {
    return this.midias.pedirEnvio(loteId, pedido);
  }

  @Post()
  registrar(@Param('id') loteId: string, @Body(new ZodPipe(registrarMidiaSchema)) dados: RegistrarMidia) {
    return this.midias.registrar(loteId, dados);
  }

  @Patch('ordem')
  ordenar(@Param('id') loteId: string, @Body(new ZodPipe(ordemMidiasSchema)) { ids }: OrdemMidias) {
    return this.midias.ordenar(loteId, ids);
  }

  @Delete(':midiaId')
  @HttpCode(204)
  async apagar(
    @Param('id') loteId: string,
    @Param(
      'midiaId',
      new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException({ mensagem: 'Foto ou vídeo não encontrado.' }) }),
    )
    midiaId: string,
  ): Promise<void> {
    await this.midias.apagar(loteId, midiaId);
  }
}
