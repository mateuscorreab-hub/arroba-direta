import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { loteCriarSchema, loteFiltroSchema, type LoteCriar, type LoteFiltro } from '@arroba/shared';
import { perfilCompleto, type Usuario } from '../auth/auth.service.js';
import { AutenticadoGuard } from '../auth/autenticado.guard.js';
import { UsuarioLogado } from '../auth/usuario-logado.decorator.js';
import { idPipe } from '../comum/id.pipe.js';
import { ZodPipe } from '../comum/zod.pipe.js';
import { SoVendedorDoLote, VendedorDoLoteGuard } from '../midias/vendedor-do-lote.guard.js';
import { LotesService } from './lotes.service.js';

// ?rascunho=1: o app cria o lote, envia as fotos e só então publica (POST /lotes/:id/publicar).
const criarQuerySchema = z.object({
  rascunho: z
    .enum(['1', 'true'], { message: 'Use rascunho=1 para criar o anúncio como rascunho' })
    .optional()
    .transform((v) => v !== undefined),
});

function exigirPerfilCompleto(usuario: Usuario) {
  if (!perfilCompleto(usuario)) {
    throw new ForbiddenException({
      mensagem: 'Complete seu perfil (nome, município e estado) antes de anunciar.',
    });
  }
}

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

  /** O telefone fica fora do GET /lotes/:id, que é público: só quem fez login vê. */
  @Get(':id/contato')
  @UseGuards(AutenticadoGuard)
  contato(@UsuarioLogado() usuario: Usuario, @Param('id', idPipe('Lote não encontrado')) id: string) {
    return this.lotes.contato(id, usuario.id);
  }

  @Post()
  @UseGuards(AutenticadoGuard)
  criar(
    @UsuarioLogado() usuario: Usuario,
    @Query(new ZodPipe(criarQuerySchema)) { rascunho }: z.infer<typeof criarQuerySchema>,
    @Body(new ZodPipe(loteCriarSchema)) dados: LoteCriar,
  ) {
    exigirPerfilCompleto(usuario);
    return this.lotes.criar(usuario.id, dados, { rascunho });
  }

  @Post(':id/publicar')
  @HttpCode(200)
  @UseGuards(AutenticadoGuard, VendedorDoLoteGuard)
  @SoVendedorDoLote('Só o vendedor do lote pode publicar o anúncio.')
  publicar(@UsuarioLogado() usuario: Usuario, @Param('id') id: string) {
    exigirPerfilCompleto(usuario);
    return this.lotes.publicar(id);
  }
}
