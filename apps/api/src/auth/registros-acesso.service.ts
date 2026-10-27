import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { lt, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, registrosAcesso } from '../db/schema.js';
import type { SessaoAtual } from './auth.service.js';

const UMA_HORA_MS = 60 * 60 * 1000;
const UM_DIA_MS = 24 * UMA_HORA_MS;
/** O Marco Civil (art. 15) manda guardar 6 meses; a Política de privacidade promete apagar depois disso. */
const PRAZO = sql`now() - interval '6 months'`;

/**
 * Registros de acesso (Marco Civil, art. 15). A entrada fica registrada no login (AuthService.entrar); aqui
 * fica o uso: cada sessão com cada IP no máximo uma vez por hora. Também apaga, ao subir e uma vez por dia,
 * os registros de acesso e os pedidos de código com mais de 6 meses.
 */
@Injectable()
export class RegistrosAcessoService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Acessos');
  /** Sessão e IP já registrados na última hora. Com mais de uma instância ou depois de reiniciar, sai uma linha a mais. */
  private readonly recentes = new Map<string, number>();
  private timer: NodeJS.Timeout | undefined;
  private limpando: Promise<void> | undefined;

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Não atrapalha o pedido: se o registro falhar, fica no log e a pessoa continua usando o app. */
  async registrarUso(sessao: SessaoAtual, ip: string | null): Promise<void> {
    const chave = `${sessao.id} ${ip}`;
    const agora = Date.now();
    if (agora - (this.recentes.get(chave) ?? 0) < UMA_HORA_MS) return;
    if (this.recentes.size >= 10_000) this.recentes.clear();
    this.recentes.set(chave, agora);
    try {
      await this.db.insert(registrosAcesso).values({
        usuarioId: sessao.usuario.id,
        sessaoId: sessao.id,
        telefone: sessao.usuario.telefone,
        evento: 'uso',
        ip,
      });
    } catch (e) {
      this.recentes.delete(chave);
      this.logger.error(`Não deu para guardar o registro de acesso: ${(e as Error).message}`);
    }
  }

  /** Apaga o que passou de 6 meses. Devolve quantas linhas saíram de cada tabela. */
  async limparAntigos(): Promise<{ acessos: number; codigos: number }> {
    const acessos = await this.db.delete(registrosAcesso).where(lt(registrosAcesso.criadoEm, PRAZO));
    const codigos = await this.db.delete(codigosLogin).where(lt(codigosLogin.criadoEm, PRAZO));
    return { acessos: acessos.rowCount ?? 0, codigos: codigos.rowCount ?? 0 };
  }

  onApplicationBootstrap() {
    // No plano grátis o Render desliga a API parada; ela limpa de novo toda vez que sobe.
    this.limpar();
    this.timer = setInterval(() => this.limpar(), UM_DIA_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.limpando;
  }

  private limpar() {
    this.limpando = this.limparAntigos().then(
      ({ acessos, codigos }) => {
        if (acessos || codigos) this.logger.log(`Apagados por terem mais de 6 meses: ${acessos} registros de acesso e ${codigos} pedidos de código.`);
      },
      (e: unknown) => this.logger.error(`Não deu para apagar os registros antigos: ${(e as Error).message}`),
    );
  }
}
