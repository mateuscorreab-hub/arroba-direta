import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  entrarSchema,
  perfilSchema,
  solicitarCodigoSchema,
  type Entrar,
  type Eu,
  type Perfil,
  type SolicitarCodigo,
} from '@arroba/shared';
import { ZodPipe } from '../comum/zod.pipe.js';
import { AuthService, paraEu, type Usuario } from './auth.service.js';
import { AutenticadoGuard } from './autenticado.guard.js';
import { ipCompleto, ipDoCliente } from './ip-do-cliente.js';
import { SessaoId, UsuarioLogado } from './usuario-logado.decorator.js';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/codigo')
  solicitarCodigo(@Body(new ZodPipe(solicitarCodigoSchema)) { telefone }: SolicitarCodigo, @Req() req: Request) {
    return this.auth.solicitarCodigo(telefone, ipDoCliente(req));
  }

  @Post('auth/entrar')
  @HttpCode(200)
  entrar(@Body(new ZodPipe(entrarSchema)) { telefone, codigo }: Entrar, @Req() req: Request) {
    return this.auth.entrar(telefone, codigo, ipCompleto(req));
  }

  @Post('auth/sair')
  @HttpCode(204)
  @UseGuards(AutenticadoGuard)
  async sair(@SessaoId() sessaoId: string): Promise<void> {
    await this.auth.sair(sessaoId);
  }

  @Get('eu')
  @UseGuards(AutenticadoGuard)
  eu(@UsuarioLogado() usuario: Usuario): Eu {
    return paraEu(usuario);
  }

  @Patch('eu')
  @UseGuards(AutenticadoGuard)
  atualizarPerfil(@UsuarioLogado() usuario: Usuario, @Body(new ZodPipe(perfilSchema)) perfil: Perfil) {
    return this.auth.atualizarPerfil(usuario.id, perfil);
  }
}
