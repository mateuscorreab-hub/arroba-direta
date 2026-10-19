import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CATEGORIAS,
  FRETES,
  SEXOS,
  STATUS_LOTE,
  STATUS_PEDIDO,
  STATUS_PROPOSTA,
  TIPOS_MENSAGEM,
  TIPOS_MIDIA,
  UNIDADES_PRECO,
  type Sanidade,
  type UnidadeProposta,
} from '@arroba/shared';

export const categoriaEnum = pgEnum('categoria', CATEGORIAS);
export const sexoEnum = pgEnum('sexo', SEXOS);
export const unidadePrecoEnum = pgEnum('unidade_preco', UNIDADES_PRECO);
export const statusLoteEnum = pgEnum('status_lote', STATUS_LOTE);
export const statusPedidoEnum = pgEnum('status_pedido', STATUS_PEDIDO);
export const statusPropostaEnum = pgEnum('status_proposta', STATUS_PROPOSTA);
export const tipoMensagemEnum = pgEnum('tipo_mensagem', TIPOS_MENSAGEM);

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  telefone: text('telefone').notNull().unique(), // E.164: +55DD9XXXXXXXX
  // Nome, município e UF ficam vazios até o usuário completar o perfil após o primeiro login.
  nome: text('nome'),
  documento: text('documento'), // CPF ou CNPJ
  inscricaoEstadual: text('inscricao_estadual'),
  verificado: boolean('verificado').notNull().default(false),
  municipio: text('municipio'),
  uf: text('uf'),
  criadoEm: criadoEm(),
});

/** Códigos de login enviados por SMS/WhatsApp. Guardamos só o hash. */
export const codigosLogin = pgTable(
  'codigos_login',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    telefone: text('telefone').notNull(),
    codigoHash: text('codigo_hash').notNull(),
    tentativas: integer('tentativas').notNull().default(0),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    usadoEm: timestamp('usado_em', { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [index('codigos_login_telefone_idx').on(t.telefone, t.criadoEm)],
);

/** Sessões abertas. O token só existe no aparelho; aqui fica o hash. */
export const sessoes = pgTable('sessoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  revogadaEm: timestamp('revogada_em', { withTimezone: true }),
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

/** Fotos e vídeo do lote. A capa é a primeira foto pela ordem (ou o vídeo, se não houver foto). */
export const midias = pgTable(
  'midias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loteId: uuid('lote_id')
      .notNull()
      .references(() => lotes.id, { onDelete: 'cascade' }),
    tipo: text('tipo', { enum: TIPOS_MIDIA }).notNull(),
    url: text('url').notNull(),
    ordem: integer('ordem').notNull().default(0),
    // Único: registrar o mesmo envio duas vezes não duplica a mídia.
    publicId: text('public_id').notNull().unique(),
    // No Cloudinary é um timestamp em segundos; bigint para não estourar em 2038.
    versao: bigint('versao', { mode: 'number' }),
    armazenamento: text('armazenamento', { enum: ['cloudinary', 'local'] }).notNull(),
    largura: integer('largura'),
    altura: integer('altura'),
    duracaoSeg: doublePrecision('duracao_seg'),
    bytes: integer('bytes').notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index('midias_lote_ordem_idx').on(t.loteId, t.ordem)],
);

/** Uma conversa por comprador e lote. O vendedor é copiado do lote. */
export const conversas = pgTable(
  'conversas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loteId: uuid('lote_id')
      .notNull()
      .references(() => lotes.id),
    compradorId: uuid('comprador_id')
      .notNull()
      .references(() => usuarios.id),
    vendedorId: uuid('vendedor_id')
      .notNull()
      .references(() => usuarios.id),
    lidoCompradorEm: timestamp('lido_comprador_em', { withTimezone: true }),
    lidoVendedorEm: timestamp('lido_vendedor_em', { withTimezone: true }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
    criadoEm: criadoEm(),
  },
  (t) => [
    unique('conversas_lote_comprador_unique').on(t.loteId, t.compradorId),
    index('conversas_comprador_idx').on(t.compradorId, t.atualizadoEm),
    index('conversas_vendedor_idx').on(t.vendedorId, t.atualizadoEm),
  ],
);

export const propostas = pgTable(
  'propostas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loteId: uuid('lote_id')
      .notNull()
      .references(() => lotes.id),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversas.id),
    compradorId: uuid('comprador_id')
      .notNull()
      .references(() => usuarios.id),
    // Quem fez a proposta: o comprador ou o vendedor.
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    preco: numeric('preco', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    unidadePreco: unidadePrecoEnum('unidade_preco').$type<UnidadeProposta>().notNull(),
    quantidade: integer('quantidade').notNull(),
    quebraPercentual: doublePrecision('quebra_percentual').notNull().default(0),
    fretePorConta: text('frete_por_conta', { enum: FRETES }).notNull(),
    dataEmbarque: date('data_embarque', { mode: 'string' }).notNull(),
    mensagem: text('mensagem'),
    status: statusPropostaEnum('status').notNull().default('enviada'),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    respondidaEm: timestamp('respondida_em', { withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [
    // No máximo uma proposta aberta por conversa: a anterior muda de status antes de entrar a nova.
    uniqueIndex('propostas_aberta_por_conversa_idx')
      .on(t.conversaId)
      .where(sql`${t.status} = 'enviada'`),
    index('propostas_lote_status_idx').on(t.loteId, t.status),
  ],
);

export const mensagens = pgTable(
  'mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversaId: uuid('conversa_id')
      .notNull()
      .references(() => conversas.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id').references(() => usuarios.id), // null = mensagem do sistema
    tipo: tipoMensagemEnum('tipo').notNull(),
    texto: text('texto'), // null em mensagem de proposta
    propostaId: uuid('proposta_id').references(() => propostas.id),
    criadoEm: criadoEm(),
  },
  (t) => [index('mensagens_conversa_idx').on(t.conversaId, t.criadoEm)],
);

export const pedidos = pgTable('pedidos', {
  id: uuid('id').primaryKey().defaultRandom(),
  propostaId: uuid('proposta_id')
    .notNull()
    .unique()
    .references(() => propostas.id),
  valorTotal: numeric('valor_total', { precision: 14, scale: 2, mode: 'number' }).notNull(),
  status: statusPedidoEnum('status').notNull().default('aguardando_pagamento'),
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
