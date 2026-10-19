import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, lte, gte, sql, type SQL } from 'drizzle-orm';
import {
  LOTE_NAO_ALTERA,
  MIN_FOTOS_PUBLICAR,
  celularDeContato,
  type ContatoVendedor,
  type Lote,
  type LoteCriar,
  type LoteFiltro,
  type Pagina,
  type RegrasAnuncio,
  type Sanidade,
  type StatusLote,
} from '@arroba/shared';
import { DB, type Db, type Tx } from '../db/db.module.js';
import { lotes, midias, usuarios } from '../db/schema.js';
import { MidiasService } from '../midias/midias.service.js';
import { avisarMudancaNoLote } from '../negociacao/negociacao.service.js';
import { APROVACAO_LOTES, type AprovacaoLotes } from './aprovacao-lotes.js';

// Os vendedores dos lotes de exemplo (seed) têm número de mentira, que não chama no WhatsApp.
const SEM_TELEFONE = 'Este é um anúncio de exemplo, sem telefone de contato.';

type AcaoStatus = 'pausar' | 'reativar' | 'vender';
// De onde cada ação parte. Já no destino, devolve o lote como está: o app repete o pedido quando perde a conexão.
const PARTE_DE: Record<AcaoStatus, StatusLote[]> = {
  pausar: ['ativo', 'em_analise'],
  reativar: ['encerrado'],
  vender: ['ativo', 'em_analise', 'encerrado', 'negociando'],
};
const JA_FEITO: Record<AcaoStatus, StatusLote[]> = {
  pausar: ['encerrado'],
  reativar: ['ativo', 'em_analise'],
  vender: ['vendido'],
};
const POR_QUE_NAO: Partial<Record<StatusLote, string>> = {
  rascunho: 'Este anúncio ainda não foi publicado.',
  negociando: 'Este lote tem negócio fechado pelo app. Quando o gado for entregue, marque como vendido.',
  vendido: 'Este lote já foi vendido.',
};
// Mudam o gado ou a conta de uma proposta. Título, descrição e preço pedido não mexem no que já foi proposto.
const CAMPOS_DO_GADO = ['categoria', 'raca', 'sexo', 'quantidade', 'pesoMedioKg', 'idadeMediaMeses', 'municipio', 'uf'] as const;
// Os outros campos do PUT, para saber se algo mudou.
const OUTROS_CAMPOS = ['titulo', 'unidadePreco', 'preco', 'lat', 'lng', 'descricao'] as const;

// Avisos nas conversas do lote, conforme a situação em que o lote fica.
const LOTE_ALTERADO: Partial<Record<StatusLote, string>> = {
  ativo: 'O vendedor alterou os dados do lote. Confira o anúncio antes de fazer uma proposta.',
  em_analise:
    'O vendedor alterou o anúncio, que passa por uma revisão antes de voltar à busca. Por enquanto não dá para fazer propostas.',
  encerrado: 'O vendedor alterou os dados do lote. O anúncio continua pausado.',
};
const AVISO_DO_STATUS: Partial<Record<StatusLote, string>> = {
  encerrado: 'O vendedor pausou o anúncio. Por enquanto não dá para fazer propostas por este lote.',
  ativo: 'O anúncio voltou ao ar. Vocês já podem negociar de novo.',
  em_analise: 'O anúncio voltou e passa por uma revisão antes de aceitar propostas de novo.',
  vendido: 'O vendedor marcou este lote como vendido.',
};

@Injectable()
export class LotesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APROVACAO_LOTES) private readonly aprovacao: AprovacaoLotes,
    private readonly midias: MidiasService,
  ) {}

  async buscar(f: LoteFiltro): Promise<Pagina<Lote>> {
    const temPonto = f.lat !== undefined && f.lng !== undefined;
    // Haversine em SQL. Trocar por ST_DWithin (PostGIS) quando houver volume.
    const distancia = temPonto
      ? sql<number>`6371 * 2 * asin(sqrt(
          power(sin(radians(${lotes.lat} - ${f.lat}) / 2), 2) +
          cos(radians(${f.lat})) * cos(radians(${lotes.lat})) *
          power(sin(radians(${lotes.lng} - ${f.lng}) / 2), 2)))`
      : undefined;

    const filtros: (SQL | undefined)[] = [
      eq(lotes.status, 'ativo'),
      f.categoria ? eq(lotes.categoria, f.categoria) : undefined,
      f.uf ? eq(lotes.uf, f.uf) : undefined,
      f.raca ? ilike(lotes.raca, `%${f.raca}%`) : undefined,
      f.quantidadeMin ? gte(lotes.quantidade, f.quantidadeMin) : undefined,
      f.precoMax ? lte(lotes.preco, f.precoMax) : undefined,
      distancia && f.raioKm ? lte(distancia, f.raioKm) : undefined,
    ];
    const where = and(...filtros);

    const [{ total }] = await this.db.select({ total: count() }).from(lotes).where(where);
    const linhas = await this.consulta(distancia)
      .where(where)
      .orderBy(distancia ?? desc(lotes.criadoEm))
      .limit(f.porPagina)
      .offset((f.pagina - 1) * f.porPagina);

    return {
      itens: linhas.map((l) => paraLote(l, this.midias.capa(l.capa))),
      total,
      pagina: f.pagina,
      porPagina: f.porPagina,
    };
  }

  async obter(id: string): Promise<Lote> {
    const [linha] = await this.consulta().where(eq(lotes.id, id));
    if (!linha) throw new NotFoundException({ mensagem: 'Lote não encontrado' });
    return { ...paraLote(linha, this.midias.capa(linha.capa)), midias: await this.midias.listar(id) };
  }

  async criar(vendedorId: string, dados: LoteCriar, { rascunho = false } = {}): Promise<Lote> {
    const [{ id }] = await this.db
      .insert(lotes)
      .values({
        ...dados,
        vendedorId,
        status: rascunho ? 'rascunho' : this.statusPublicado(),
      })
      .returning({ id: lotes.id });
    return this.obter(id);
  }

  /** Todos os lotes do vendedor, em qualquer situação, do mais novo para o mais antigo. */
  async doVendedor(vendedorId: string): Promise<Lote[]> {
    const linhas = await this.consulta()
      .where(eq(lotes.vendedorId, vendedorId))
      .orderBy(desc(lotes.criadoEm), desc(lotes.id));
    return linhas.map((l) => paraLote(l, this.midias.capa(l.capa)));
  }

  /** GET /lotes/regras: o app avisa antes de salvar quando a edição tira o lote da busca. */
  regras(): RegrasAnuncio {
    return { revisaoManual: this.aprovacao === 'manual' };
  }

  /**
   * Troca os dados do anúncio. Aqui e nas mudanças de situação abaixo, quem chama já conferiu que o usuário é o
   * vendedor (VendedorDoLoteGuard). Com revisão manual, o lote no ar volta para a revisão: o aprovado não pode
   * virar outro. Salvar sem mudar nada não mexe em nada.
   */
  async editar(id: string, dados: LoteCriar): Promise<Lote> {
    await this.db.transaction(async (tx) => {
      // Travado como no aceite de proposta: editar e fechar negócio ao mesmo tempo não se cruzam.
      const [atual] = await tx.select().from(lotes).where(eq(lotes.id, id)).for('update');
      const bloqueio = LOTE_NAO_ALTERA[atual.status];
      if (bloqueio) throw new ConflictException({ mensagem: bloqueio });
      const igual = (c: (typeof CAMPOS_DO_GADO)[number] | (typeof OUTROS_CAMPOS)[number]) =>
        (atual[c] ?? null) === (dados[c] ?? null);
      const mudouGado = !CAMPOS_DO_GADO.every(igual);
      const mudouAlgo =
        mudouGado ||
        !OUTROS_CAMPOS.every(igual) ||
        (atual.disponivelEm?.getTime() ?? null) !== (dados.disponivelEm?.getTime() ?? null) ||
        !mesmaSanidade(atual.sanidade, dados.sanidade);
      if (!mudouAlgo) return;

      const status = atual.status === 'ativo' ? this.statusPublicado() : atual.status;
      await tx
        .update(lotes)
        .set({
          ...dados,
          // PUT: o opcional que não veio fica em branco.
          idadeMediaMeses: dados.idadeMediaMeses ?? null,
          pesoMedioKg: dados.pesoMedioKg ?? null,
          preco: dados.preco ?? null,
          disponivelEm: dados.disponivelEm ?? null,
          descricao: dados.descricao ?? null,
          status,
        })
        .where(eq(lotes.id, id));
      const aviso = LOTE_ALTERADO[status];
      if (aviso && (mudouGado || status !== atual.status)) await avisarMudancaNoLote(tx, id, atual.vendedorId, aviso);
    });
    return this.obter(id);
  }

  pausar(id: string): Promise<Lote> {
    return this.mudarStatus(id, 'pausar', async () => 'encerrado');
  }

  /** Volta ao ar o lote pausado (com revisão manual, volta para a revisão). */
  reativar(id: string): Promise<Lote> {
    return this.mudarStatus(id, 'reativar', async (tx) => {
      await this.exigirFotos(id, 'reativar o anúncio', tx);
      return this.statusPublicado();
    });
  }

  /** Vendido é o fim: o lote sai da busca de vez, com ou sem negócio fechado pelo app. */
  marcarVendido(id: string): Promise<Lote> {
    return this.mudarStatus(id, 'vender', async () => 'vendido');
  }

  /** `destino` só roda quando a mudança vai acontecer, com o lote travado; o que ele ler usa o `tx`. */
  private async mudarStatus(id: string, acao: AcaoStatus, destino: (tx: Tx) => Promise<StatusLote>): Promise<Lote> {
    await this.db.transaction(async (tx) => {
      const [lote] = await tx
        .select({ status: lotes.status, vendedorId: lotes.vendedorId })
        .from(lotes)
        .where(eq(lotes.id, id))
        .for('update');
      if (JA_FEITO[acao].includes(lote.status)) return;
      if (!PARTE_DE[acao].includes(lote.status)) {
        throw new ConflictException({ mensagem: POR_QUE_NAO[lote.status] ?? 'Não dá para fazer isso com este lote agora.' });
      }
      const novo = await destino(tx);
      await tx.update(lotes).set({ status: novo }).where(eq(lotes.id, id));
      const aviso = AVISO_DO_STATUS[novo];
      if (aviso) await avisarMudancaNoLote(tx, id, lote.vendedorId, aviso);
    });
    return this.obter(id);
  }

  /** Tira o lote do rascunho. Quem chama já conferiu que o usuário é o vendedor (VendedorDoLoteGuard). */
  async publicar(id: string): Promise<Lote> {
    const [lote] = await this.db.select({ status: lotes.status }).from(lotes).where(eq(lotes.id, id));
    // Fora do rascunho devolve o lote como está: o app repete o pedido quando perde a conexão.
    if (lote?.status === 'rascunho') {
      await this.exigirFotos(id, 'publicar');
      // Só se ainda for rascunho: pedido repetido ou status mudado no meio do caminho não volta o lote para análise.
      await this.db
        .update(lotes)
        .set({ status: this.statusPublicado() })
        .where(and(eq(lotes.id, id), eq(lotes.status, 'rascunho')));
    }
    return this.obter(id);
  }

  /** Telefone do vendedor para quem fez login. Só de lote na busca; o próprio vendedor vê sempre. */
  async contato(id: string, usuarioId: string): Promise<ContatoVendedor> {
    const [linha] = await this.db
      .select({ status: lotes.status, vendedorId: lotes.vendedorId, nome: usuarios.nome, telefone: usuarios.telefone })
      .from(lotes)
      .innerJoin(usuarios, eq(lotes.vendedorId, usuarios.id))
      .where(eq(lotes.id, id));
    if (!linha) throw new NotFoundException({ mensagem: 'Lote não encontrado' });
    if (linha.status !== 'ativo' && linha.vendedorId !== usuarioId) {
      throw new ConflictException({ mensagem: 'Este lote não está mais disponível.' });
    }
    const telefone = celularDeContato(linha.telefone);
    if (!telefone) throw new NotFoundException({ mensagem: SEM_TELEFONE });
    return { nome: linha.nome ?? '', telefone };
  }

  private async exigirFotos(id: string, acao: string, db: Db | Tx = this.db) {
    if (this.midias.estado().ligado && (await this.midias.contar(id, 'foto', db)) < MIN_FOTOS_PUBLICAR) {
      throw new BadRequestException({ mensagem: `Coloque pelo menos uma foto do lote antes de ${acao}.` });
    }
  }

  /** Com APROVACAO_LOTES=automatica o lote publicado já entra na busca; senão espera a revisão. */
  private statusPublicado() {
    return this.aprovacao === 'automatica' ? ('ativo' as const) : ('em_analise' as const);
  }

  private consulta(distancia?: SQL<number>) {
    // Capa: a primeira foto pela ordem, ou o vídeo se não houver foto. Na mesma consulta, sem N+1.
    const capa = this.db
      .select({
        tipo: midias.tipo,
        publicId: midias.publicId,
        versao: midias.versao,
        url: midias.url,
        armazenamento: midias.armazenamento,
      })
      .from(midias)
      .where(eq(midias.loteId, lotes.id))
      .orderBy(sql`${midias.tipo} = 'video'`, asc(midias.ordem), asc(midias.criadoEm))
      .limit(1)
      .as('capa');
    return this.db
      .select({
        lote: lotes,
        vendedor: {
          id: usuarios.id,
          nome: usuarios.nome,
          verificado: usuarios.verificado,
          municipio: usuarios.municipio,
          uf: usuarios.uf,
        },
        distanciaKm: distancia ?? sql<null>`null`,
        capa: {
          tipo: capa.tipo,
          publicId: capa.publicId,
          versao: capa.versao,
          url: capa.url,
          armazenamento: capa.armazenamento,
        },
      })
      .from(lotes)
      .innerJoin(usuarios, eq(lotes.vendedorId, usuarios.id))
      .leftJoinLateral(capa, sql`true`);
  }
}

function mesmaSanidade(a: Sanidade, b: Sanidade): boolean {
  return (
    a.vermifugado === b.vermifugado &&
    (a.observacoes ?? null) === (b.observacoes ?? null) &&
    (a.vacinas ?? []).join() === (b.vacinas ?? []).join()
  );
}

type Linha = {
  lote: typeof lotes.$inferSelect;
  vendedor: Pick<typeof usuarios.$inferSelect, 'id' | 'nome' | 'verificado' | 'municipio' | 'uf'>;
  distanciaKm: number | null;
};

function paraLote({ lote, vendedor, distanciaKm }: Linha, capa: string | null): Lote {
  const { vendedorId: _, criadoEm, disponivelEm, idadeMediaMeses, pesoMedioKg, preco, descricao, ...resto } = lote;
  return {
    ...resto,
    categoria: resto.categoria,
    uf: resto.uf as Lote['uf'],
    idadeMediaMeses: idadeMediaMeses ?? undefined,
    pesoMedioKg: pesoMedioKg ?? undefined,
    preco: preco ?? undefined,
    descricao: descricao ?? undefined,
    disponivelEm: disponivelEm?.toISOString() ?? null,
    criadoEm: criadoEm.toISOString(),
    distanciaKm: distanciaKm === null ? undefined : Math.round(Number(distanciaKm)),
    capa,
    // Só anuncia quem tem perfil completo; o ?? '' existe para fechar o tipo.
    vendedor: {
      ...vendedor,
      nome: vendedor.nome ?? '',
      municipio: vendedor.municipio ?? '',
      uf: vendedor.uf ?? '',
    },
  };
}
