import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CATEGORIAS,
  SEXOS,
  STATUS_LOTE,
  STATUS_PEDIDO,
  UNIDADES_PRECO,
  type Sanidade,
} from '@arroba/shared';

export const categoriaEnum = pgEnum('categoria', CATEGORIAS);
export const sexoEnum = pgEnum('sexo', SEXOS);
export const unidadePrecoEnum = pgEnum('unidade_preco', UNIDADES_PRECO);
export const statusLoteEnum = pgEnum('status_lote', STATUS_LOTE);
export const statusPedidoEnum = pgEnum('status_pedido', STATUS_PEDIDO);
export const statusPropostaEnum = pgEnum('status_proposta', [
  'enviada',
  'contraproposta',
  'aceita',
  'recusada',
  'expirada',
]);

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  telefone: text('telefone').notNull().unique(),
  nome: text('nome').notNull(),
  documento: text('documento'), // CPF ou CNPJ
  inscricaoEstadual: text('inscricao_estadual'),
  verificado: boolean('verificado').notNull().default(false),
  municipio: text('municipio').notNull(),
  uf: text('uf').notNull(),
  criadoEm: criadoEm(),
});

export const lotes = pgTable(
  'lotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendedorId: uuid('vendedor_id')
      .notNull()
      .references(() => usuarios.id),
    titulo: text('titulo').notNull(),
    categoria: categoriaEnum('categoria').notNull(),
    raca: text('raca').notNull(),
    sexo: sexoEnum('sexo').notNull(),
    quantidade: integer('quantidade').notNull(),
    idadeMediaMeses: integer('idade_media_meses'),
    pesoMedioKg: doublePrecision('peso_medio_kg'),
    unidadePreco: unidadePrecoEnum('unidade_preco').notNull(),
    preco: numeric('preco', { precision: 12, scale: 2, mode: 'number' }),
    municipio: text('municipio').notNull(),
    uf: text('uf').notNull(),
    // Coordenada aproximada da fazenda. Migrar para PostGIS (geography) quando a busca crescer.
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    disponivelEm: timestamp('disponivel_em', { withTimezone: true }),
    sanidade: jsonb('sanidade').$type<Sanidade>().notNull(),
    descricao: text('descricao'),
    status: statusLoteEnum('status').notNull().default('em_analise'),
    criadoEm: criadoEm(),
  },
  (t) => [index('lotes_busca_idx').on(t.status, t.categoria, t.uf)],
);

export const midias = pgTable('midias', {
  id: uuid('id').primaryKey().defaultRandom(),
  loteId: uuid('lote_id')
    .notNull()
    .references(() => lotes.id, { onDelete: 'cascade' }),
  tipo: text('tipo', { enum: ['foto', 'video'] }).notNull(),
  url: text('url').notNull(),
  ordem: integer('ordem').notNull().default(0),
});

export const propostas = pgTable('propostas', {
  id: uuid('id').primaryKey().defaultRandom(),
  loteId: uuid('lote_id')
    .notNull()
    .references(() => lotes.id),
  compradorId: uuid('comprador_id')
    .notNull()
    .references(() => usuarios.id),
  preco: numeric('preco', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  unidadePreco: unidadePrecoEnum('unidade_preco').notNull(),
  quantidade: integer('quantidade').notNull(),
  quebraPercentual: doublePrecision('quebra_percentual').notNull().default(0),
  fretePorConta: text('frete_por_conta', { enum: ['comprador', 'vendedor'] }).notNull(),
  dataEmbarque: timestamp('data_embarque', { withTimezone: true }).notNull(),
  mensagem: text('mensagem'),
  status: statusPropostaEnum('status').notNull().default('enviada'),
  criadoEm: criadoEm(),
});

export const pedidos = pgTable('pedidos', {
  id: uuid('id').primaryKey().defaultRandom(),
  propostaId: uuid('proposta_id')
    .notNull()
    .unique()
    .references(() => propostas.id),
  valorTotal: numeric('valor_total', { precision: 14, scale: 2, mode: 'number' }).notNull(),
  valorComissao: numeric('valor_comissao', { precision: 14, scale: 2, mode: 'number' }).notNull(),
  status: statusPedidoEnum('status').notNull().default('aguardando_pagamento'),
  pagamentoExternoId: text('pagamento_externo_id'), // id no provedor de pagamento
  criadoEm: criadoEm(),
});

export const documentos = pgTable('documentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  pedidoId: uuid('pedido_id')
    .notNull()
    .references(() => pedidos.id, { onDelete: 'cascade' }),
  tipo: text('tipo', { enum: ['gta', 'nota_fiscal', 'atestado', 'ticket_balanca'] }).notNull(),
  url: text('url').notNull(),
  criadoEm: criadoEm(),
});

export const avaliacoes = pgTable('avaliacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  pedidoId: uuid('pedido_id')
    .notNull()
    .references(() => pedidos.id),
  autorId: uuid('autor_id')
    .notNull()
    .references(() => usuarios.id),
  avaliadoId: uuid('avaliado_id')
    .notNull()
    .references(() => usuarios.id),
  nota: integer('nota').notNull(),
  comentario: text('comentario'),
  criadoEm: criadoEm(),
});
