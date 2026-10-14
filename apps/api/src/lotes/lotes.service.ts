import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, ilike, lte, gte, sql, type SQL } from 'drizzle-orm';
import type { Lote, LoteCriar, LoteFiltro, Pagina } from '@arroba/shared';
import { DB, type Db } from '../db/db.module.js';
import { lotes, usuarios } from '../db/schema.js';

@Injectable()
export class LotesService {
  constructor(@Inject(DB) private readonly db: Db) {}

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

    return { itens: linhas.map(paraLote), total, pagina: f.pagina, porPagina: f.porPagina };
  }

  async obter(id: string): Promise<Lote> {
    const [linha] = await this.consulta().where(eq(lotes.id, id));
    if (!linha) throw new NotFoundException('Lote não encontrado');
    return paraLote(linha);
  }

  async criar(vendedorId: string, dados: LoteCriar): Promise<Lote> {
    const [{ id }] = await this.db
      .insert(lotes)
      .values({ ...dados, vendedorId, status: 'em_analise' })
      .returning({ id: lotes.id });
    return this.obter(id);
  }

  private consulta(distancia?: SQL<number>) {
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
      })
      .from(lotes)
      .innerJoin(usuarios, eq(lotes.vendedorId, usuarios.id));
  }
}

type Linha = {
  lote: typeof lotes.$inferSelect;
  vendedor: Lote['vendedor'];
  distanciaKm: number | null;
};

function paraLote({ lote, vendedor, distanciaKm }: Linha): Lote {
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
    vendedor,
  };
}
