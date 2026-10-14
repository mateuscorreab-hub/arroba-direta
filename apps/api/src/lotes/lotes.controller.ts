import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { loteCriarSchema, loteFiltroSchema, type LoteCriar, type LoteFiltro } from '@arroba/shared';
import { perfilCompleto, type Usuario } from '../auth/auth.service.js';
import { AutenticadoGuard } from '../auth/autenticado.guard.js';
import { UsuarioLogado } from '../auth/usuario-logado.decorator.js';
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
  @UseGuards(AutenticadoGuard)
  criar(@UsuarioLogado() usuario: Usuario, @Body(new ZodPipe(loteCriarSchema)) dados: LoteCriar) {
    if (!perfilCompleto(usuario)) {
      throw new ForbiddenException({
        mensagem: 'Complete seu perfil (nome, município e estado) antes de anunciar.',
      });
    }
    return this.lotes.criar(usuario.id, dados);
  }
}
