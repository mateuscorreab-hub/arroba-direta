import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, lte, gte, sql, type SQL } from 'drizzle-orm';
import { MIN_FOTOS_PUBLICAR, type Lote, type LoteCriar, type LoteFiltro, type Pagina } from '@arroba/shared';
import { DB, type Db } from '../db/db.module.js';
import { lotes, midias, usuarios } from '../db/schema.js';
import { MidiasService } from '../midias/midias.service.js';

@Injectable()
export class LotesService {
  constructor(
    @Inject(DB) private readonly db: Db,
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
      .values({ ...dados, vendedorId, status: rascunho ? 'rascunho' : 'em_analise' })
      .returning({ id: lotes.id });
    return this.obter(id);
  }

  /** Tira o lote do rascunho. Quem chama já conferiu que o usuário é o vendedor (VendedorDoLoteGuard). */
  async publicar(id: string): Promise<Lote> {
    const [lote] = await this.db.select({ status: lotes.status }).from(lotes).where(eq(lotes.id, id));
    // Fora do rascunho devolve o lote como está: o app repete o pedido quando perde a conexão.
    if (lote?.status === 'rascunho') {
      if (this.midias.estado().ligado && (await this.midias.contar(id, 'foto')) < MIN_FOTOS_PUBLICAR) {
        throw new BadRequestException({ mensagem: 'Coloque pelo menos uma foto do lote antes de publicar.' });
      }
      // Só se ainda for rascunho: pedido repetido ou status mudado no meio do caminho não volta o lote para análise.
      await this.db
        .update(lotes)
        .set({ status: 'em_analise' })
        .where(and(eq(lotes.id, id), eq(lotes.status, 'rascunho')));
    }
    return this.obter(id);
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
