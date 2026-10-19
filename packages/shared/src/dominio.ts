/** Vocabulário do domínio compartilhado entre app, site e API. */

export const CATEGORIAS = [
  'bezerro',
  'bezerra',
  'garrote',
  'novilha',
  'boi_magro',
  'boi_gordo',
  'vaca',
  'vaca_prenhe',
  'touro',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_ROTULO: Record<Categoria, string> = {
  bezerro: 'Bezerro',
  bezerra: 'Bezerra',
  garrote: 'Garrote',
  novilha: 'Novilha',
  boi_magro: 'Boi magro',
  boi_gordo: 'Boi gordo',
  vaca: 'Vaca',
  vaca_prenhe: 'Vaca prenhe',
  touro: 'Touro',
};

export const SEXOS = ['macho', 'femea', 'misto'] as const;
export type Sexo = (typeof SEXOS)[number];

/** Como o preço do anúncio é expresso. */
export const UNIDADES_PRECO = ['cabeca', 'kg', 'arroba', 'a_combinar'] as const;
export type UnidadePreco = (typeof UNIDADES_PRECO)[number];

export const UNIDADE_PRECO_ROTULO: Record<UnidadePreco, string> = {
  cabeca: 'por cabeça',
  kg: 'por kg vivo',
  arroba: 'por arroba',
  a_combinar: 'a combinar',
};

export const VACINAS = [
  'brucelose',
  'raiva',
  'clostridioses',
  'ibr_bvd',
  'leptospirose',
] as const;
export type Vacina = (typeof VACINAS)[number];

export const STATUS_LOTE = [
  'rascunho',
  'em_analise',
  'ativo',
  'negociando',
  'vendido',
  'encerrado',
] as const;
export type StatusLote = (typeof STATUS_LOTE)[number];

/** Como o vendedor vê a situação do lote em "Meus anúncios". */
export const STATUS_LOTE_ROTULO: Record<StatusLote, string> = {
  rascunho: 'Rascunho',
  em_analise: 'Em análise',
  ativo: 'No ar',
  negociando: 'Negócio fechado',
  vendido: 'Vendido',
  encerrado: 'Pausado',
};

export const STATUS_PEDIDO = [
  'aguardando_pagamento',
  'pago',
  'documentos_ok',
  'embarcado',
  'entregue',
  'concluido',
  'em_disputa',
  'cancelado',
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export type UF = (typeof UFS)[number];
