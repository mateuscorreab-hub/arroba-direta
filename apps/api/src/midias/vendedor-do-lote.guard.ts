import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RequisicaoLogada } from '../auth/autenticado.guard.js';
import { DB, type Db } from '../db/db.module.js';
import { lotes } from '../db/schema.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Depois do AutenticadoGuard: o lote de :id existe e é do usuário logado. Roda antes de validar o corpo. */
@Injectable()
export class VendedorDoLoteGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequisicaoLogada>();
    const loteId = req.params.id;
    const [lote] =
      typeof loteId === 'string' && UUID.test(loteId)
        ? await this.db.select({ vendedorId: lotes.vendedorId }).from(lotes).where(eq(lotes.id, loteId))
        : [];
    if (!lote) throw new NotFoundException({ mensagem: 'Lote não encontrado' });
    if (lote.vendedorId !== req.sessao.usuario.id) {
      throw new ForbiddenException({ mensagem: 'Só o vendedor do lote pode mudar as fotos e o vídeo.' });
    }
    return true;
  }
}
