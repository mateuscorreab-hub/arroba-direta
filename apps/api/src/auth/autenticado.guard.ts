import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type SessaoAtual } from './auth.service.js';
import { ipCompleto } from './ip-do-cliente.js';
import { RegistrosAcessoService } from './registros-acesso.service.js';

export type RequisicaoLogada = Request & { sessao: SessaoAtual };

/**
 * Exige "Authorization: Bearer <token>" de uma sessão válida e guarda a sessão na requisição. Também deixa
 * o registro de acesso (Marco Civil) da sessão com o IP do pedido.
 */
@Injectable()
export class AutenticadoGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly acessos: RegistrosAcessoService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & Partial<RequisicaoLogada>>();
    const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization ?? '')?.[1];
    const sessao = token ? await this.auth.sessaoPorToken(token) : null;
    if (!sessao) throw new UnauthorizedException({ mensagem: 'Faça login para continuar.' });
    req.sessao = sessao;
    await this.acessos.registrarUso(sessao, ipCompleto(req));
    return true;
  }
}
