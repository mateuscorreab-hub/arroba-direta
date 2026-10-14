import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequisicaoLogada } from './autenticado.guard.js';

/** O usuário da sessão. Só em rotas protegidas por AutenticadoGuard. */
export const UsuarioLogado = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<RequisicaoLogada>().sessao.usuario,
);

/** O id da sessão em uso (para sair). Só em rotas protegidas por AutenticadoGuard. */
export const SessaoId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<RequisicaoLogada>().sessao.id,
);
