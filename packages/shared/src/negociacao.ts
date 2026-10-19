import { z } from 'zod';
import { formatarReais } from './calculos.js';
import {
  UNIDADE_PRECO_ROTULO,
  type Categoria,
  type StatusLote,
  type StatusPedido,
  type UnidadePreco,
} from './dominio.js';

export const STATUS_PROPOSTA = ['enviada', 'contraproposta', 'aceita', 'recusada', 'expirada'] as const;
export type StatusProposta = (typeof STATUS_PROPOSTA)[number];

export const STATUS_PROPOSTA_ROTULO: Record<StatusProposta, string> = {
  enviada: 'Aguardando resposta',
  contraproposta: 'Respondida com contraproposta',
  aceita: 'Aceita',
  recusada: 'Recusada',
  expirada: 'Expirada',
};

/** Unidades aceitas numa proposta: "a combinar" não serve para fechar negócio. */
export const UNIDADES_PROPOSTA = ['cabeca', 'kg', 'arroba'] as const;
export type UnidadeProposta = (typeof UNIDADES_PROPOSTA)[number];

export const FRETES = ['comprador', 'vendedor'] as const;
export type FretePorConta = (typeof FRETES)[number];

export const FRETE_ROTULO: Record<FretePorConta, string> = {
  comprador: 'Frete por conta do comprador',
  vendedor: 'Frete por conta do vendedor',
};

export const TIPOS_MENSAGEM = ['texto', 'proposta', 'sistema'] as const;
export type TipoMensagem = (typeof TIPOS_MENSAGEM)[number];

export type PapelNegociacao = 'comprador' | 'vendedor';

export const VALIDADE_PROPOSTA_HORAS = 72;
export const MENSAGEM_MAX = 2000;

/** Data de hoje (YYYY-MM-DD) no horário de Brasília. */
export function hojeEmBrasilia(agora = new Date()): string {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(agora);
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
    return `${parte('year')}-${parte('month')}-${parte('day')}`;
  } catch {
    // Sem fuso disponível: Brasília é UTC-3 (sem horário de verão desde 2019).
    return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
}

/** Confere se o texto é uma data YYYY-MM-DD que existe no calendário. */
function dataReal(data: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Data de embarque válida: YYYY-MM-DD real e não antes de hoje (horário de Brasília). */
export function dataEmbarqueValida(data: string, hoje: string = hojeEmBrasilia()): boolean {
  return dataReal(data) && data >= hoje;
}

export const mensagemCriarSchema = z.object({
  texto: z
    .string({ message: 'Escreva uma mensagem' })
    .trim()
    .min(1, 'Escreva uma mensagem')
    .max(MENSAGEM_MAX, `A mensagem pode ter até ${MENSAGEM_MAX} letras`),
});
export type MensagemCriar = z.infer<typeof mensagemCriarSchema>;

export const propostaCriarSchema = z.object({
  preco: z
    .number({ message: 'Informe o preço' })
    .positive('Informe um preço maior que zero')
    .max(10_000_000, 'Preço alto demais. Confira o valor.'),
  unidadePreco: z.enum(UNIDADES_PROPOSTA, { message: 'Escolha se o preço é por cabeça, kg ou arroba' }),
  quantidade: z
    .number({ message: 'Informe a quantidade de cabeças' })
    .int('Informe um número inteiro de cabeças')
    .min(1, 'Informe pelo menos 1 cabeça')
    .max(10000, 'Quantidade maior que a do lote'),
  quebraPercentual: z
    .number({ message: 'Informe a quebra em %' })
    .min(0, 'A quebra não pode ser negativa')
    .max(10, 'A quebra pode ser de no máximo 10%')
    .default(0),
  fretePorConta: z.enum(FRETES, { message: 'Escolha quem paga o frete' }),
  dataEmbarque: z
    .string({ message: 'Informe a data de embarque' })
    .refine(dataReal, 'Informe uma data de embarque válida'),
  mensagem: z.string().trim().max(1000, 'A mensagem pode ter até 1000 letras').optional(),
});
export type PropostaCriar = z.infer<typeof propostaCriarSchema>;

/** Resumo de uma proposta para prévias, como "Proposta: R$ 2.500,00 por cabeça". */
export function resumoProposta(p: { preco: number; unidadePreco: UnidadeProposta }): string {
  return `Proposta: ${formatarReais(p.preco)} ${UNIDADE_PRECO_ROTULO[p.unidadePreco]}`;
}

export interface ParteNegociacao {
  id: string;
  nome: string;
  verificado: boolean;
  municipio: string;
  uf: string;
  /** null quando a conta não tem celular de verdade (os vendedores dos lotes de exemplo). */
  telefone: string | null;
}

/** GET /lotes/:id/contato: o telefone do vendedor, para quem fez login. */
export interface ContatoVendedor {
  nome: string;
  telefone: string;
}

export interface LoteResumo {
  id: string;
  titulo: string;
  categoria: Categoria;
  quantidade: number;
  unidadePreco: UnidadePreco;
  preco: number | null;
  pesoMedioKg: number | null;
  municipio: string;
  uf: string;
  status: StatusLote;
}

export interface PropostaNegociacao {
  id: string;
  conversaId: string;
  /** Quem fez a proposta: comprador ou vendedor. */
  autorId: string;
  preco: number;
  unidadePreco: UnidadeProposta;
  quantidade: number;
  quebraPercentual: number;
  fretePorConta: FretePorConta;
  /** YYYY-MM-DD. */
  dataEmbarque: string;
  mensagem: string | null;
  /** "enviada" vencida já vem como "expirada". */
  status: StatusProposta;
  expiraEm: string;
  criadoEm: string;
  /** Valor total pelo peso médio do lote. */
  valorEstimado: number;
}

export interface Mensagem {
  id: string;
  conversaId: string;
  /** Em aviso do sistema, null ou quem causou o aviso (o vendedor que pausou o lote, por exemplo). */
  autorId: string | null;
  tipo: TipoMensagem;
  /** null em mensagem de proposta. */
  texto: string | null;
  proposta?: PropostaNegociacao;
  criadoEm: string;
}

export interface PedidoResumo {
  id: string;
  propostaId: string;
  valorTotal: number;
  status: StatusPedido;
  criadoEm: string;
}

export interface ConversaResumo {
  id: string;
  /** Papel de quem está vendo a conversa. */
  papel: PapelNegociacao;
  lote: LoteResumo;
  outraParte: ParteNegociacao;
  ultimaMensagem: { texto: string; criadoEm: string } | null;
  naoLidas: number;
  propostaAberta: PropostaNegociacao | null;
  negocioFechado: boolean;
  /** Última atividade. */
  atualizadoEm: string;
}

export interface ConversaDetalhe extends ConversaResumo {
  /** Últimas 200 mensagens, da mais antiga para a mais nova. */
  mensagens: Mensagem[];
  pedido: PedidoResumo | null;
}

export interface ListaConversas {
  itens: ConversaResumo[];
  naoLidas: number;
}
