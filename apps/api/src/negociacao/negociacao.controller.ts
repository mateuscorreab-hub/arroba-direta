import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  mensagemCriarSchema,
  propostaCriarSchema,
  type ConversaDetalhe,
  type ListaConversas,
  type Mensagem,
  type MensagemCriar,
  type PropostaCriar,
  type PropostaNegociacao,
} from '@arroba/shared';
import { perfilCompleto, type Usuario } from '../auth/auth.service.js';
import { AutenticadoGuard } from '../auth/autenticado.guard.js';
import { UsuarioLogado } from '../auth/usuario-logado.decorator.js';
import { idPipe } from '../comum/id.pipe.js';
import { ZodPipe } from '../comum/zod.pipe.js';
import {
  CONVERSA_NAO_ENCONTRADA,
  LOTE_NAO_ENCONTRADO,
  NegociacaoService,
  PROPOSTA_NAO_ENCONTRADA,
} from './negociacao.service.js';

/** Ler conversas exige só login; negociar exige também o perfil completo. */
function exigirPerfil(usuario: Usuario) {
  if (!perfilCompleto(usuario)) {
    throw new ForbiddenException({ mensagem: 'Complete seu perfil (nome, município e estado) antes de negociar.' });
  }
}

@Controller()
@UseGuards(AutenticadoGuard)
export class NegociacaoController {
  constructor(private readonly negociacao: NegociacaoService) {}

  @Post('lotes/:id/conversas')
  @HttpCode(200)
  abrir(
    @UsuarioLogado() usuario: Usuario,
    @Param('id', idPipe(LOTE_NAO_ENCONTRADO)) loteId: string,
  ): Promise<ConversaDetalhe> {
    exigirPerfil(usuario);
    return this.negociacao.abrir(loteId, usuario.id);
  }

  @Get('conversas')
  listar(@UsuarioLogado() usuario: Usuario): Promise<ListaConversas> {
    return this.negociacao.listar(usuario.id);
  }

  @Get('conversas/:id')
  obter(
    @UsuarioLogado() usuario: Usuario,
    @Param('id', idPipe(CONVERSA_NAO_ENCONTRADA)) id: string,
  ): Promise<ConversaDetalhe> {
    return this.negociacao.detalhe(id, usuario.id);
  }

  @Post('conversas/:id/mensagens')
  enviarMensagem(
    @UsuarioLogado() usuario: Usuario,
    @Param('id', idPipe(CONVERSA_NAO_ENCONTRADA)) id: string,
    @Body(new ZodPipe(mensagemCriarSchema)) { texto }: MensagemCriar,
  ): Promise<Mensagem> {
    exigirPerfil(usuario);
    return this.negociacao.enviarMensagem(id, usuario.id, texto);
  }

  @Post('conversas/:id/propostas')
  enviarProposta(
    @UsuarioLogado() usuario: Usuario,
    @Param('id', idPipe(CONVERSA_NAO_ENCONTRADA)) id: string,
    @Body(new ZodPipe(propostaCriarSchema)) dados: PropostaCriar,
  ): Promise<PropostaNegociacao> {
    exigirPerfil(usuario);
    return this.negociacao.enviarProposta(id, usuario.id, dados);
  }

  @Post('propostas/:id/aceitar')
  @HttpCode(200)
  aceitar(
    @UsuarioLogado() usuario: Usuario,
    @Param('id', idPipe(PROPOSTA_NAO_ENCONTRADA)) id: string,
  ): Promise<ConversaDetalhe> {
    exigirPerfil(usuario);
    return this.negociacao.aceitar(id, usuario.id);
  }

  @Post('propostas/:id/recusar')
  @HttpCode(200)
  recusar(
    @UsuarioLogado() usuario: Usuario,
    @Param('id', idPipe(PROPOSTA_NAO_ENCONTRADA)) id: string,
  ): Promise<ConversaDetalhe> {
    exigirPerfil(usuario);
    return this.negociacao.recusar(id, usuario.id);
  }
}
