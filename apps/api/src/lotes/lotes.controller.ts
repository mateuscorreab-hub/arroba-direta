import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UnauthorizedException } from '@nestjs/common';
import { loteCriarSchema, loteFiltroSchema, type LoteCriar, type LoteFiltro } from '@arroba/shared';
import { ZodPipe } from '../comum/zod.pipe.js';
import { LotesService } from './lotes.service.js';

@Controller('lotes')
export class LotesController {
  constructor(private readonly lotes: LotesService) {}

  @Get()
  buscar(@Query(new ZodPipe(loteFiltroSchema)) filtro: LoteFiltro) {
    return this.lotes.buscar(filtro);
  }

  @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotes.obter(id);
  }

  @Post()
  criar(
    // TODO: substituir pelo usuário autenticado (login por código no celular).
    @Headers('x-usuario-id') usuarioId: string | undefined,
    @Body(new ZodPipe(loteCriarSchema)) dados: LoteCriar,
  ) {
    if (!usuarioId) throw new UnauthorizedException('Faça login para anunciar');
    return this.lotes.criar(usuarioId, dados);
  }
}
