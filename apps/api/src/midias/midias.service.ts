import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, eq, max, sql } from 'drizzle-orm';
import {
  ENVIO_MIDIA_VALIDADE_MS,
  LIMITES_MIDIA,
  duracaoVideoAceita,
  type EnvioMidia,
  type Midia,
  type PedidoEnvioMidia,
  type RegistrarMidia,
  type TipoMidia,
} from '@arroba/shared';
import { DB, type Db } from '../db/db.module.js';
import { lotes, midias } from '../db/schema.js';
import { ARMAZENAMENTO, type Armazenamento, type DadosArquivo, type MidiaGuardada } from './armazenamento.js';
import { FORMATOS_ACEITOS, mensagemFormato, mensagemTamanho } from './arquivo-midia.js';

type LinhaMidia = typeof midias.$inferSelect;
/** O que basta para montar url e miniatura (inclusive a capa da lista de lotes). */
export type MidiaParaUrl = MidiaGuardada & { armazenamento: LinhaMidia['armazenamento'] };

export const pastaDoLote = (loteId: string) => `arroba/lotes/${loteId}`;

const mensagemLimite = (tipo: TipoMidia) =>
  tipo === 'foto'
    ? `Este lote já tem ${LIMITES_MIDIA.foto.maximo} fotos.`
    : 'Este lote já tem um vídeo. Apague o atual para enviar outro.';

const envioInvalido = () => new BadRequestException({ mensagem: 'Envio inválido. Tente de novo.' });

/** Por que o arquivo não pode ficar no anúncio, ou null se está tudo certo. */
export function problemaNoArquivo(tipo: TipoMidia, dados: DadosArquivo): string | null {
  if (dados.formato && !FORMATOS_ACEITOS[tipo].includes(dados.formato)) return mensagemFormato(tipo);
  const { maxBytes } = LIMITES_MIDIA[tipo];
  if (dados.bytes > maxBytes) return mensagemTamanho(tipo, maxBytes);
  if (tipo === 'video' && dados.duracaoSeg !== null && !duracaoVideoAceita(dados.duracaoSeg)) {
    return 'O vídeo passa de 1 minuto. Grave um vídeo mais curto, de até 1 minuto.';
  }
  return null;
}

/**
 * Fotos e vídeo dos lotes. Quem chama as operações de escrita já conferiu que o usuário
 * é o vendedor do lote (VendedorDoLoteGuard).
 */
@Injectable()
export class MidiasService {
  private readonly logger = new Logger('Midias');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento | null,
  ) {}

  private ligado(): Armazenamento {
    if (!this.armazenamento) {
      throw new ServiceUnavailableException({
        mensagem: 'O envio de fotos e vídeos ainda não está ligado nesta versão.',
      });
    }
    return this.armazenamento;
  }

  async pedirEnvio(loteId: string, { tipo, mime }: PedidoEnvioMidia): Promise<EnvioMidia> {
    const armazenamento = this.ligado();
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(midias)
      .where(and(eq(midias.loteId, loteId), eq(midias.tipo, tipo)));
    if (total >= LIMITES_MIDIA[tipo].maximo) throw new ConflictException({ mensagem: mensagemLimite(tipo) });
    return armazenamento.prepararEnvio({
      loteId,
      tipo,
      mime,
      publicId: `${pastaDoLote(loteId)}/${tipo}_${randomUUID().replaceAll('-', '')}`,
      expiraEm: new Date(Date.now() + ENVIO_MIDIA_VALIDADE_MS),
    });
  }

  async registrar(loteId: string, r: RegistrarMidia): Promise<Midia> {
    const armazenamento = this.ligado();
    const nome = r.publicId.slice(`${pastaDoLote(loteId)}/`.length);
    if (
      !r.publicId.startsWith(`${pastaDoLote(loteId)}/${r.tipo}_`) ||
      nome.includes('/') ||
      !armazenamento.assinaturaValida(r.publicId, r.versao, r.assinatura)
    ) {
      throw envioInvalido();
    }

    const [jaRegistrada] = await this.db.select().from(midias).where(eq(midias.publicId, r.publicId));
    if (jaRegistrada) {
      if (jaRegistrada.loteId !== loteId) throw envioInvalido();
      return this.paraMidia(jaRegistrada);
    }

    let dados: DadosArquivo | null;
    try {
      dados = await armazenamento.buscarDados(r.tipo, r.publicId);
    } catch (e) {
      this.logger.error(`Não deu para conferir ${r.publicId}: ${(e as Error).message}`);
      throw new ServiceUnavailableException({
        mensagem: 'Não foi possível conferir o arquivo agora. Tente de novo em instantes.',
      });
    }
    if (!dados) throw new BadRequestException({ mensagem: 'O arquivo não chegou. Envie de novo.' });
    if (r.tipo === 'video' && dados.duracaoSeg === null) {
      this.logger.warn(`Sem a duração de ${r.publicId}: o limite de 1 minuto não foi conferido.`);
    }
    const problema = problemaNoArquivo(r.tipo, dados);
    if (problema) {
      await this.apagarDoArmazenamento(armazenamento, r.tipo, r.publicId);
      throw new BadRequestException({ mensagem: problema });
    }

    const resultado = await this.db.transaction(async (tx) => {
      // Lote travado: registros simultâneos são contados um de cada vez.
      await tx.select({ id: lotes.id }).from(lotes).where(eq(lotes.id, loteId)).for('update');
      const [mesma] = await tx.select().from(midias).where(eq(midias.publicId, r.publicId));
      if (mesma) return mesma;
      const [{ doTipo, ultima }] = await tx
        .select({
          doTipo: sql<number>`(count(*) filter (where ${midias.tipo} = ${r.tipo}))::int`,
          ultima: max(midias.ordem),
        })
        .from(midias)
        .where(eq(midias.loteId, loteId));
      if (doTipo >= LIMITES_MIDIA[r.tipo].maximo) return null;
      const [nova] = await tx
        .insert(midias)
        .values({
          loteId,
          tipo: r.tipo,
          url: dados.url,
          ordem: ultima === null ? 0 : ultima + 1,
          publicId: r.publicId,
          versao: r.versao,
          armazenamento: armazenamento.nome,
          largura: dados.largura,
          altura: dados.altura,
          duracaoSeg: dados.duracaoSeg,
          bytes: dados.bytes,
        })
        .returning();
      return nova;
    });
    if (!resultado) {
      await this.apagarDoArmazenamento(armazenamento, r.tipo, r.publicId);
      throw new ConflictException({ mensagem: mensagemLimite(r.tipo) });
    }
    return this.paraMidia(resultado);
  }

  async apagar(loteId: string, midiaId: string): Promise<void> {
    const [apagada] = await this.db
      .delete(midias)
      .where(and(eq(midias.id, midiaId), eq(midias.loteId, loteId)))
      .returning();
    if (!apagada) throw new NotFoundException({ mensagem: 'Foto ou vídeo não encontrado.' });
    if (this.armazenamento?.nome === apagada.armazenamento) {
      await this.apagarDoArmazenamento(this.armazenamento, apagada.tipo, apagada.publicId);
    } else {
      this.logger.warn(`${apagada.publicId} ficou no armazenamento "${apagada.armazenamento}", que não está em uso agora.`);
    }
  }

  async ordenar(loteId: string, ids: string[]): Promise<Midia[]> {
    await this.db.transaction(async (tx) => {
      await tx.select({ id: lotes.id }).from(lotes).where(eq(lotes.id, loteId)).for('update');
      const atuais = await tx.select({ id: midias.id }).from(midias).where(eq(midias.loteId, loteId));
      if (atuais.length !== ids.length || !atuais.every((m) => ids.includes(m.id))) {
        throw new BadRequestException({
          mensagem: 'A ordem precisa ter todas as fotos e o vídeo do lote, cada um uma vez.',
        });
      }
      const lista = sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      await tx
        .update(midias)
        .set({ ordem: sql`array_position(array[${lista}], ${midias.id}) - 1` })
        .where(eq(midias.loteId, loteId));
    });
    return this.listar(loteId);
  }

  /** As mídias do lote, em ordem. */
  async listar(loteId: string): Promise<Midia[]> {
    const linhas = await this.db
      .select()
      .from(midias)
      .where(eq(midias.loteId, loteId))
      .orderBy(asc(midias.ordem), asc(midias.criadoEm));
    return linhas.map((m) => this.paraMidia(m));
  }

  /** Mídia gravada em outro armazenamento (ex.: Cloudinary desligado depois) usa a url original. */
  urls(m: MidiaParaUrl) {
    if (this.armazenamento?.nome === m.armazenamento) return this.armazenamento.urls(m);
    return { url: m.url, miniatura: m.url };
  }

  capa(m: MidiaParaUrl | null): string | null {
    return m ? this.urls(m).miniatura : null;
  }

  private paraMidia(m: LinhaMidia): Midia {
    return {
      id: m.id,
      tipo: m.tipo,
      ...this.urls(m),
      largura: m.largura,
      altura: m.altura,
      duracaoSeg: m.duracaoSeg,
      ordem: m.ordem,
    };
  }

  /** Falha do armazenamento não derruba a requisição: o arquivo fica órfão e vai para o log. */
  private async apagarDoArmazenamento(a: Armazenamento, tipo: TipoMidia, publicId: string) {
    try {
      await a.apagar(tipo, publicId);
    } catch (e) {
      this.logger.error(`Não deu para apagar ${publicId} do armazenamento: ${(e as Error).message}`);
    }
  }
}
