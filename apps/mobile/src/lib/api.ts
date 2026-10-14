import type {
  ConversaDetalhe,
  Entrar,
  Eu,
  ListaConversas,
  Lote,
  LoteCriar,
  Mensagem,
  Pagina,
  Perfil,
  PropostaCriar,
  PropostaNegociacao,
  RespostaEntrar,
  RespostaSolicitarCodigo,
  SolicitarCodigo,
} from '@arroba/shared';

// No Render, a variável chega só com o host (ex.: arroba-api.onrender.com).
const API_URL = comEsquema(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333');

function comEsquema(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

/** Erro devolvido pela API (corpo {mensagem, erros?}). Status 0 é falta de conexão. */
export class ErroApi extends Error {
  readonly status: number;
  /** Mensagem de cada campo inválido, pelo nome do campo. */
  readonly erros: Record<string, string>;

  constructor(status: number, mensagem: string, erros: Record<string, string> = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.erros = erros;
  }
}

/** Texto para mostrar na tela a partir de qualquer erro. */
export function textoDoErro(e: unknown): string {
  return e instanceof Error ? e.message : 'Algo deu errado. Tente de novo.';
}

// Token da sessão atual, definido pelo provedor de sessão (src/lib/sessao.tsx).
let tokenAtual: string | null = null;
let aoPerderSessao: (() => void) | null = null;

export function definirToken(token: string | null) {
  tokenAtual = token;
}

export function tokenDaSessao() {
  return tokenAtual;
}

/** Chamado quando uma chamada autenticada volta 401 (sessão expirada ou revogada). */
export function quandoPerderSessao(funcao: (() => void) | null) {
  aoPerderSessao = funcao;
}

// Sem prazo, o fetch do Android espera para sempre numa conexão travada. Folga para a API do Render acordar (~1 min).
const TEMPO_LIMITE_MS = 90_000;

async function requisitar<T>(caminho: string, init?: RequestInit, token?: string | null): Promise<T> {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  let res: Response;
  let corpo: unknown;
  try {
    res = await fetch(`${API_URL}${caminho}`, {
      ...init,
      signal: controle.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    // Corpo vazio ou que não é JSON vira null; o prazo estourado no meio da leitura segue como erro.
    corpo = await res.json().catch((e: unknown) => {
      if (controle.signal.aborted) throw e;
      return null;
    });
  } catch {
    throw new ErroApi(
      0,
      controle.signal.aborted
        ? 'O servidor demorou para responder. Confira sua internet e tente de novo.'
        : 'Sem conexão com o servidor. Confira sua internet e tente de novo.',
    );
  } finally {
    clearTimeout(limite);
  }
  if (!res.ok) {
    // Só derruba a sessão se o token recusado ainda for o atual (o usuário pode ter saído e entrado de novo).
    if (res.status === 401 && token && token === tokenAtual) aoPerderSessao?.();
    throw erroDaResposta(res.status, corpo);
  }
  return corpo as T;
}

function erroDaResposta(status: number, corpo: unknown): ErroApi {
  const c = (corpo ?? {}) as { mensagem?: unknown; erros?: unknown };
  // Erros padrão do Nest vêm em inglês ({message}); nesse caso mostramos uma mensagem genérica.
  const mensagem = typeof c.mensagem === 'string' ? c.mensagem : `Algo deu errado (erro ${status}). Tente de novo.`;
  const erros: Record<string, string> = {};
  if (Array.isArray(c.erros)) {
    for (const e of c.erros as { campo?: unknown; mensagem?: unknown }[]) {
      if (typeof e?.campo === 'string' && typeof e.mensagem === 'string' && !(e.campo in erros)) {
        erros[e.campo] = e.mensagem;
      }
    }
  }
  return new ErroApi(status, mensagem, erros);
}

function enviar(metodo: string, dados?: unknown): RequestInit {
  return { method: metodo, body: dados === undefined ? undefined : JSON.stringify(dados) };
}

export function buscarLotes(filtro: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtro)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return requisitar<Pagina<Lote>>(`/lotes?${qs}`);
}

export function obterLote(id: string) {
  return requisitar<Lote>(`/lotes/${id}`);
}

export function criarLote(dados: LoteCriar) {
  return requisitar<Lote>('/lotes', enviar('POST', dados), tokenAtual);
}

export function solicitarCodigo(dados: SolicitarCodigo) {
  return requisitar<RespostaSolicitarCodigo>('/auth/codigo', enviar('POST', dados));
}

export function entrar(dados: Entrar) {
  return requisitar<RespostaEntrar>('/auth/entrar', enviar('POST', dados));
}

/** Recebe o token explicitamente: a sessão local já foi limpa quando isso roda. */
export function sair(token: string) {
  return requisitar<void>('/auth/sair', enviar('POST'), token);
}

export function obterEu() {
  return requisitar<Eu>('/eu', undefined, tokenAtual);
}

export function atualizarPerfil(dados: Perfil) {
  return requisitar<Eu>('/eu', enviar('PATCH', dados), tokenAtual);
}

/** Abre a conversa do usuário sobre o lote, ou devolve a que já existe. */
export function abrirConversa(loteId: string) {
  return requisitar<ConversaDetalhe>(`/lotes/${loteId}/conversas`, enviar('POST'), tokenAtual);
}

export function listarConversas() {
  return requisitar<ListaConversas>('/conversas', undefined, tokenAtual);
}

/** Também marca a conversa como lida. */
export function obterConversa(id: string) {
  return requisitar<ConversaDetalhe>(`/conversas/${id}`, undefined, tokenAtual);
}

export function enviarMensagem(conversaId: string, texto: string) {
  return requisitar<Mensagem>(`/conversas/${conversaId}/mensagens`, enviar('POST', { texto }), tokenAtual);
}

export function enviarProposta(conversaId: string, dados: PropostaCriar) {
  return requisitar<PropostaNegociacao>(`/conversas/${conversaId}/propostas`, enviar('POST', dados), tokenAtual);
}

export function aceitarProposta(id: string) {
  return requisitar<ConversaDetalhe>(`/propostas/${id}/aceitar`, enviar('POST'), tokenAtual);
}

export function recusarProposta(id: string) {
  return requisitar<ConversaDetalhe>(`/propostas/${id}/recusar`, enviar('POST'), tokenAtual);
}
