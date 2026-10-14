import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  VALIDADE_PROPOSTA_HORAS,
  comissao,
  dataEmbarqueValida,
  mascararContato,
  resumoProposta,
  valorTotal,
  type ConversaDetalhe,
  type ConversaResumo,
  type EntradaValorTotal,
  type ListaConversas,
  type Mensagem,
  type PapelNegociacao,
  type ParteNegociacao,
  type PedidoResumo,
  type PropostaCriar,
  type PropostaNegociacao,
} from '@arroba/shared';
import { DB, type Db } from '../db/db.module.js';
import { conversas, lotes, mensagens, pedidos, propostas, usuarios } from '../db/schema.js';

export const CONVERSA_NAO_ENCONTRADA = 'Conversa não encontrada.';
export const PROPOSTA_NAO_ENCONTRADA = 'Proposta não encontrada.';
export const LOTE_NAO_ENCONTRADO = 'Lote não encontrado';
const LOTE_INDISPONIVEL = 'Este lote não está mais disponível para negociação.';
const NEGOCIO_FECHADO = 'Negócio fechado! O próximo passo é o pagamento protegido, que chega em breve.';
const OUTRO_COMPRADOR = 'O vendedor fechou negócio com outro comprador. Este lote não está mais disponível.';
const PROPOSTA_RECUSADA = 'Proposta recusada.';
const MENSAGENS_NO_DETALHE = 200;
const VALOR_TOTAL_MAX = 999_999_999_999.99; // limite de pedidos.valor_total numeric(14,2)

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type PropostaLinha = typeof propostas.$inferSelect;
type MensagemLinha = typeof mensagens.$inferSelect;
type PedidoLinha = typeof pedidos.$inferSelect;

const comprador = alias(usuarios, 'comprador');
const vendedor = alias(usuarios, 'vendedor');

function consultaConversas(db: Db) {
  return db
    .select({
      conversa: conversas,
      lote: {
        id: lotes.id,
        titulo: lotes.titulo,
        categoria: lotes.categoria,
        quantidade: lotes.quantidade,
        unidadePreco: lotes.unidadePreco,
        preco: lotes.preco,
        pesoMedioKg: lotes.pesoMedioKg,
        municipio: lotes.municipio,
        uf: lotes.uf,
        status: lotes.status,
      },
      comprador: {
        id: comprador.id,
        nome: comprador.nome,
        verificado: comprador.verificado,
        municipio: comprador.municipio,
        uf: comprador.uf,
        telefone: comprador.telefone,
      },
      vendedor: {
        id: vendedor.id,
        nome: vendedor.nome,
        verificado: vendedor.verificado,
        municipio: vendedor.municipio,
        uf: vendedor.uf,
        telefone: vendedor.telefone,
      },
    })
    .from(conversas)
    .innerJoin(lotes, eq(conversas.loteId, lotes.id))
    .innerJoin(comprador, eq(conversas.compradorId, comprador.id))
    .innerJoin(vendedor, eq(conversas.vendedorId, vendedor.id));
}
type LinhaConversa = Awaited<ReturnType<typeof consultaConversas>>[number];

const participante = (usuarioId: string) =>
  or(eq(conversas.compradorId, usuarioId), eq(conversas.vendedorId, usuarioId));

/*
 * Ordem das travas em toda a negociação: lote, conversa, proposta. O aceite trava o lote com
 * FOR UPDATE; proposta nova e recusa travam com FOR SHARE. Assim um aceite nunca corre junto
 * com outra mudança de proposta do mesmo lote, e não há espera em círculo (deadlock).
 */
@Injectable()
export class NegociacaoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Pega a conversa do comprador nesse lote ou cria uma nova. */
  async abrir(loteId: string, usuarioId: string): Promise<ConversaDetalhe> {
    const [lote] = await this.db
      .select({ vendedorId: lotes.vendedorId, status: lotes.status })
      .from(lotes)
      .where(eq(lotes.id, loteId));
    if (!lote) throw new NotFoundException({ mensagem: LOTE_NAO_ENCONTRADO });
    if (lote.vendedorId === usuarioId) {
      throw new ForbiddenException({ mensagem: 'Você não pode negociar o próprio lote.' });
    }
    const existente = await this.conversaDoComprador(loteId, usuarioId);
    if (existente) return this.detalhe(existente, usuarioId);
    if (lote.status !== 'ativo') throw new ConflictException({ mensagem: LOTE_INDISPONIVEL });

    await this.db
      .insert(conversas)
      .values({ loteId, compradorId: usuarioId, vendedorId: lote.vendedorId })
      .onConflictDoNothing();
    return this.detalhe((await this.conversaDoComprador(loteId, usuarioId))!, usuarioId);
  }

  async listar(usuarioId: string): Promise<ListaConversas> {
    const linhas = await consultaConversas(this.db)
      .where(participante(usuarioId))
      .orderBy(desc(conversas.atualizadoEm));
    const itens = (await this.montar(linhas, usuarioId)).map((m) => m.resumo);
    return { itens, naoLidas: itens.reduce((total, c) => total + c.naoLidas, 0) };
  }

  /** A conversa com as últimas mensagens. Marca como lida para quem está vendo. */
  async detalhe(conversaId: string, usuarioId: string): Promise<ConversaDetalhe> {
    const marcada = await this.db
      .update(conversas)
      .set({
        lidoCompradorEm: sql`case when ${conversas.compradorId} = ${usuarioId} then now() else ${conversas.lidoCompradorEm} end`,
        lidoVendedorEm: sql`case when ${conversas.vendedorId} = ${usuarioId} then now() else ${conversas.lidoVendedorEm} end`,
      })
      .where(and(eq(conversas.id, conversaId), participante(usuarioId)))
      .returning({ id: conversas.id });
    if (marcada.length === 0) throw new NotFoundException({ mensagem: CONVERSA_NAO_ENCONTRADA });

    const [linhas, recentes] = await Promise.all([
      consultaConversas(this.db).where(eq(conversas.id, conversaId)),
      this.db
        .select()
        .from(mensagens)
        .where(eq(mensagens.conversaId, conversaId))
        .orderBy(desc(mensagens.criadoEm), desc(mensagens.id))
        .limit(MENSAGENS_NO_DETALHE),
    ]);
    const idsPropostas = recentes.flatMap((m) => (m.propostaId ? [m.propostaId] : []));
    const [[{ resumo, pedido }], citadas] = await Promise.all([
      this.montar(linhas, usuarioId),
      idsPropostas.length > 0
        ? this.db.select().from(propostas).where(inArray(propostas.id, idsPropostas))
        : Promise.resolve([]),
    ]);
    const agora = Date.now();
    const porId = new Map(citadas.map((p) => [p.id, paraProposta(p, resumo.lote.pesoMedioKg, agora)]));
    return {
      ...resumo,
      mensagens: recentes.reverse().map((m) => paraMensagem(m, m.propostaId ? porId.get(m.propostaId) : undefined)),
      pedido,
    };
  }

  async enviarMensagem(conversaId: string, usuarioId: string, texto: string): Promise<Mensagem> {
    const nova = await this.db.transaction(async (tx) => {
      await travarConversa(tx, conversaId, usuarioId);
      const final = (await negocioFechado(tx, conversaId)) ? texto : mascararContato(texto).texto;
      const [m] = await tx
        .insert(mensagens)
        .values({ conversaId, autorId: usuarioId, tipo: 'texto', texto: final })
        .returning();
      await tocar(tx, [conversaId]);
      return m;
    });
    return paraMensagem(nova);
  }

  async enviarProposta(conversaId: string, usuarioId: string, dados: PropostaCriar): Promise<PropostaNegociacao> {
    const conversa = await this.conversaDoParticipante(conversaId, usuarioId);
    const { nova, pesoMedioKg } = await this.db.transaction(async (tx) => {
      const [lote] = await tx.select().from(lotes).where(eq(lotes.id, conversa.loteId)).for('share');
      if (lote.status !== 'ativo') throw new ConflictException({ mensagem: LOTE_INDISPONIVEL });
      validarNoLote(dados, lote);
      await travarConversa(tx, conversaId, usuarioId);

      // Uma proposta aberta por conversa: a anterior vira contraproposta se era do outro lado,
      // ou expirada se era do mesmo autor (foi substituída) ou já tinha vencido.
      const [aberta] = await tx
        .select()
        .from(propostas)
        .where(and(eq(propostas.conversaId, conversaId), eq(propostas.status, 'enviada')));
      if (aberta) {
        const respondida = aberta.autorId !== usuarioId && !vencida(aberta, Date.now());
        await tx
          .update(propostas)
          .set(respondida ? { status: 'contraproposta', respondidaEm: sql`now()` } : { status: 'expirada' })
          .where(eq(propostas.id, aberta.id));
      }

      let mensagem = dados.mensagem || null;
      if (mensagem && !(await negocioFechado(tx, conversaId))) mensagem = mascararContato(mensagem).texto;
      const [proposta] = await tx
        .insert(propostas)
        .values({
          loteId: lote.id,
          conversaId,
          compradorId: conversa.compradorId,
          autorId: usuarioId,
          preco: dados.preco,
          unidadePreco: dados.unidadePreco,
          quantidade: dados.quantidade,
          quebraPercentual: dados.quebraPercentual,
          fretePorConta: dados.fretePorConta,
          dataEmbarque: dados.dataEmbarque,
          mensagem,
          expiraEm: sql`now() + ${VALIDADE_PROPOSTA_HORAS} * interval '1 hour'`,
        })
        .returning();
      await tx.insert(mensagens).values({ conversaId, autorId: usuarioId, tipo: 'proposta', propostaId: proposta.id });
      await tocar(tx, [conversaId]);
      return { nova: proposta, pesoMedioKg: lote.pesoMedioKg };
    });
    return paraProposta(nova, pesoMedioKg, Date.now());
  }

  async aceitar(propostaId: string, usuarioId: string): Promise<ConversaDetalhe> {
    const proposta = await this.propostaDoParticipante(propostaId, usuarioId);
    if (proposta.autorId === usuarioId) {
      throw new ForbiddenException({ mensagem: 'Você não pode aceitar a própria proposta.' });
    }
    await this.db.transaction(async (tx) => {
      // Com o lote travado, dois aceites ao mesmo tempo em conversas diferentes não fecham dois negócios.
      const [lote] = await tx.select().from(lotes).where(eq(lotes.id, proposta.loteId)).for('update');
      const atual = await travarPropostaAberta(tx, propostaId, 'aceita');
      if (lote.status !== 'ativo') throw new ConflictException({ mensagem: LOTE_INDISPONIVEL });

      const total = valorTotal(entradaValor(atual, lote.pesoMedioKg));
      await tx.insert(pedidos).values({ propostaId, valorTotal: total, valorComissao: comissao(total).valorComissao });
      await tx.update(propostas).set({ status: 'aceita', respondidaEm: sql`now()` }).where(eq(propostas.id, propostaId));
      await tx.update(lotes).set({ status: 'negociando' }).where(eq(lotes.id, lote.id));
      await avisar(tx, [proposta.conversaId], NEGOCIO_FECHADO);

      const outras = await tx
        .update(propostas)
        .set({ status: 'expirada' })
        .where(and(eq(propostas.loteId, lote.id), eq(propostas.status, 'enviada')))
        .returning({ conversaId: propostas.conversaId });
      await avisar(tx, outras.map((p) => p.conversaId), OUTRO_COMPRADOR);
    });
    return this.detalhe(proposta.conversaId, usuarioId);
  }

  async recusar(propostaId: string, usuarioId: string): Promise<ConversaDetalhe> {
    const proposta = await this.propostaDoParticipante(propostaId, usuarioId);
    if (proposta.autorId === usuarioId) {
      throw new ForbiddenException({ mensagem: 'Você não pode recusar a própria proposta.' });
    }
    await this.db.transaction(async (tx) => {
      await tx.select({ id: lotes.id }).from(lotes).where(eq(lotes.id, proposta.loteId)).for('share');
      await travarConversa(tx, proposta.conversaId, usuarioId);
      await travarPropostaAberta(tx, propostaId, 'recusada');
      await tx
        .update(propostas)
        .set({ status: 'recusada', respondidaEm: sql`now()` })
        .where(eq(propostas.id, propostaId));
      await avisar(tx, [proposta.conversaId], PROPOSTA_RECUSADA);
    });
    return this.detalhe(proposta.conversaId, usuarioId);
  }

  private async conversaDoComprador(loteId: string, compradorId: string): Promise<string | undefined> {
    const [c] = await this.db
      .select({ id: conversas.id })
      .from(conversas)
      .where(and(eq(conversas.loteId, loteId), eq(conversas.compradorId, compradorId)));
    return c?.id;
  }

  private async conversaDoParticipante(conversaId: string, usuarioId: string) {
    const [c] = await this.db
      .select()
      .from(conversas)
      .where(and(eq(conversas.id, conversaId), participante(usuarioId)));
    if (!c) throw new NotFoundException({ mensagem: CONVERSA_NAO_ENCONTRADA });
    return c;
  }

  private async propostaDoParticipante(propostaId: string, usuarioId: string) {
    const [p] = await this.db
      .select({ loteId: propostas.loteId, conversaId: propostas.conversaId, autorId: propostas.autorId })
      .from(propostas)
      .innerJoin(conversas, eq(propostas.conversaId, conversas.id))
      .where(and(eq(propostas.id, propostaId), participante(usuarioId)));
    if (!p) throw new NotFoundException({ mensagem: PROPOSTA_NAO_ENCONTRADA });
    return p;
  }

  /** Completa as conversas com o que vem de outras tabelas, numa consulta por tabela. */
  private async montar(
    linhas: LinhaConversa[],
    usuarioId: string,
  ): Promise<{ resumo: ConversaResumo; pedido: PedidoResumo | null }[]> {
    if (linhas.length === 0) return [];
    const ids = linhas.map((l) => l.conversa.id);
    const [abertas, fechados, ultimas, naoLidas] = await Promise.all([
      this.db
        .select()
        .from(propostas)
        .where(and(inArray(propostas.conversaId, ids), eq(propostas.status, 'enviada'))),
      this.db
        .select({ conversaId: propostas.conversaId, pedido: pedidos })
        .from(pedidos)
        .innerJoin(propostas, eq(pedidos.propostaId, propostas.id))
        .where(inArray(propostas.conversaId, ids))
        .orderBy(pedidos.criadoEm),
      this.db
        .selectDistinctOn([mensagens.conversaId], {
          conversaId: mensagens.conversaId,
          texto: mensagens.texto,
          criadoEm: mensagens.criadoEm,
          preco: propostas.preco,
          unidadePreco: propostas.unidadePreco,
        })
        .from(mensagens)
        .leftJoin(propostas, eq(mensagens.propostaId, propostas.id))
        .where(inArray(mensagens.conversaId, ids))
        .orderBy(mensagens.conversaId, desc(mensagens.criadoEm), desc(mensagens.id)),
      // Da outra parte ou do sistema, depois da última leitura de quem está vendo.
      this.db
        .select({ conversaId: mensagens.conversaId, total: count() })
        .from(mensagens)
        .innerJoin(conversas, eq(mensagens.conversaId, conversas.id))
        .where(
          and(
            inArray(mensagens.conversaId, ids),
            or(isNull(mensagens.autorId), ne(mensagens.autorId, usuarioId)),
            sql`${mensagens.criadoEm} > coalesce(case when ${conversas.compradorId} = ${usuarioId}
              then ${conversas.lidoCompradorEm} else ${conversas.lidoVendedorEm} end, '-infinity')`,
          ),
        )
        .groupBy(mensagens.conversaId),
    ]);

    const agora = Date.now();
    const abertaPor = new Map(abertas.map((p) => [p.conversaId, p]));
    const pedidoPor = new Map(fechados.map((f) => [f.conversaId, f.pedido]));
    const ultimaPor = new Map(ultimas.map((m) => [m.conversaId, m]));
    const naoLidasPor = new Map(naoLidas.map((n) => [n.conversaId, n.total]));

    return linhas.map(({ conversa, lote, comprador: c, vendedor: v }) => {
      const papel: PapelNegociacao = conversa.compradorId === usuarioId ? 'comprador' : 'vendedor';
      const pedido = pedidoPor.get(conversa.id);
      const aberta = abertaPor.get(conversa.id);
      const ultima = ultimaPor.get(conversa.id);
      return {
        resumo: {
          id: conversa.id,
          papel,
          lote,
          outraParte: paraParte(papel === 'comprador' ? v : c, Boolean(pedido)),
          ultimaMensagem: ultima
            ? {
                texto:
                  ultima.preco !== null && ultima.unidadePreco !== null
                    ? resumoProposta({ preco: ultima.preco, unidadePreco: ultima.unidadePreco })
                    : (ultima.texto ?? ''),
                criadoEm: ultima.criadoEm.toISOString(),
              }
            : null,
          naoLidas: naoLidasPor.get(conversa.id) ?? 0,
          propostaAberta: aberta && !vencida(aberta, agora) ? paraProposta(aberta, lote.pesoMedioKg, agora) : null,
          negocioFechado: Boolean(pedido),
          atualizadoEm: conversa.atualizadoEm.toISOString(),
        },
        pedido: pedido ? paraPedido(pedido) : null,
      };
    });
  }
}

async function travarConversa(tx: Tx, conversaId: string, usuarioId: string) {
  const [c] = await tx
    .select({ id: conversas.id })
    .from(conversas)
    .where(and(eq(conversas.id, conversaId), participante(usuarioId)))
    .for('no key update');
  if (!c) throw new NotFoundException({ mensagem: CONVERSA_NAO_ENCONTRADA });
}

async function travarPropostaAberta(tx: Tx, propostaId: string, acao: 'aceita' | 'recusada') {
  const [p] = await tx.select().from(propostas).where(eq(propostas.id, propostaId)).for('update');
  if (p.status !== 'enviada' || vencida(p, Date.now())) {
    throw new ConflictException({ mensagem: `Esta proposta não pode mais ser ${acao}.` });
  }
  return p;
}

async function negocioFechado(tx: Tx, conversaId: string): Promise<boolean> {
  const [pedido] = await tx
    .select({ id: pedidos.id })
    .from(pedidos)
    .innerJoin(propostas, eq(pedidos.propostaId, propostas.id))
    .where(eq(propostas.conversaId, conversaId))
    .limit(1);
  return Boolean(pedido);
}

/** Marca atividade nas conversas (sobem na lista). */
async function tocar(tx: Tx, conversaIds: string[]) {
  await tx.update(conversas).set({ atualizadoEm: sql`now()` }).where(inArray(conversas.id, conversaIds));
}

async function avisar(tx: Tx, conversaIds: string[], texto: string) {
  if (conversaIds.length === 0) return;
  await tx.insert(mensagens).values(conversaIds.map((conversaId) => ({ conversaId, tipo: 'sistema' as const, texto })));
  await tocar(tx, conversaIds);
}

/** Quantidade, peso, valor total e data que dependem do lote; os outros campos o schema já validou. */
function validarNoLote(dados: PropostaCriar, lote: { quantidade: number; pesoMedioKg: number | null }) {
  const erros: { campo: string; mensagem: string }[] = [];
  if (dados.quantidade > lote.quantidade) {
    const cabecas = `${lote.quantidade} ${lote.quantidade === 1 ? 'cabeça' : 'cabeças'}`;
    erros.push({ campo: 'quantidade', mensagem: `A quantidade passa do lote, que tem ${cabecas}.` });
  }
  if (dados.unidadePreco !== 'cabeca' && !lote.pesoMedioKg) {
    erros.push({ campo: 'unidadePreco', mensagem: 'Este lote não tem peso médio. Faça a proposta por cabeça.' });
  } else if (valorTotal(entradaValor(dados, lote.pesoMedioKg)) > VALOR_TOTAL_MAX) {
    erros.push({ campo: 'preco', mensagem: 'Valor total alto demais. Confira o preço.' });
  }
  if (!dataEmbarqueValida(dados.dataEmbarque)) {
    erros.push({ campo: 'dataEmbarque', mensagem: 'A data de embarque não pode ser antes de hoje.' });
  }
  if (erros.length > 0) throw new BadRequestException({ mensagem: 'Dados inválidos', erros });
}

/** Proposta "enviada" que passou do prazo: aparece como expirada e não pode mais ser aceita. */
function vencida(p: Pick<PropostaLinha, 'status' | 'expiraEm'>, agora: number): boolean {
  return p.status === 'enviada' && p.expiraEm.getTime() <= agora;
}

function entradaValor(
  p: Pick<PropostaLinha, 'unidadePreco' | 'preco' | 'quantidade' | 'quebraPercentual'>,
  pesoMedioKg: number | null,
): EntradaValorTotal {
  return {
    unidade: p.unidadePreco,
    preco: p.preco,
    quantidade: p.quantidade,
    pesoMedioKg: pesoMedioKg ?? undefined,
    quebraPercentual: p.quebraPercentual,
  };
}

function paraProposta(p: PropostaLinha, pesoMedioKg: number | null, agora: number): PropostaNegociacao {
  return {
    id: p.id,
    conversaId: p.conversaId,
    autorId: p.autorId,
    preco: p.preco,
    unidadePreco: p.unidadePreco,
    quantidade: p.quantidade,
    quebraPercentual: p.quebraPercentual,
    fretePorConta: p.fretePorConta,
    dataEmbarque: p.dataEmbarque,
    mensagem: p.mensagem,
    status: vencida(p, agora) ? 'expirada' : p.status,
    expiraEm: p.expiraEm.toISOString(),
    criadoEm: p.criadoEm.toISOString(),
    // Sem peso médio só existe proposta por cabeça; o 0 só protege a lista de um lote alterado.
    valorEstimado: p.unidadePreco === 'cabeca' || pesoMedioKg ? valorTotal(entradaValor(p, pesoMedioKg)) : 0,
  };
}

function paraMensagem(m: MensagemLinha, proposta?: PropostaNegociacao): Mensagem {
  return {
    id: m.id,
    conversaId: m.conversaId,
    autorId: m.autorId,
    tipo: m.tipo,
    texto: m.texto,
    ...(proposta ? { proposta } : {}),
    criadoEm: m.criadoEm.toISOString(),
  };
}

function paraPedido(p: PedidoLinha): PedidoResumo {
  return {
    id: p.id,
    propostaId: p.propostaId,
    valorTotal: p.valorTotal,
    valorComissao: p.valorComissao,
    status: p.status,
    criadoEm: p.criadoEm.toISOString(),
  };
}

/** O telefone só aparece com o negócio fechado. */
function paraParte(
  u: Pick<typeof usuarios.$inferSelect, 'id' | 'nome' | 'verificado' | 'municipio' | 'uf' | 'telefone'>,
  comContato: boolean,
): ParteNegociacao {
  return {
    id: u.id,
    nome: u.nome ?? '',
    verificado: u.verificado,
    municipio: u.municipio ?? '',
    uf: u.uf ?? '',
    ...(comContato ? { telefone: u.telefone } : {}),
  };
}
