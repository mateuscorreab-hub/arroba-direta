import { Platform } from 'react-native';
import {
  mensagemTamanho,
  type Entrar,
  type EnvioMidia,
  type Eu,
  type Lote,
  type LoteCriar,
  type Midia,
  type Pagina,
  type PedidoEnvioMidia,
  type Perfil,
  type RegistrarMidia,
  type RespostaEntrar,
  type RespostaSolicitarCodigo,
  type RespostaUpload,
  type SolicitarCodigo,
  type TipoMidia,
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

export function pedirEnvioMidia(loteId: string, dados: PedidoEnvioMidia) {
  return requisitar<EnvioMidia>(`/lotes/${loteId}/midias/envio`, enviar('POST', dados), tokenAtual);
}

export function registrarMidia(loteId: string, dados: RegistrarMidia) {
  return requisitar<Midia>(`/lotes/${loteId}/midias`, enviar('POST', dados), tokenAtual);
}

export function apagarMidia(loteId: string, midiaId: string) {
  return requisitar<void>(`/lotes/${loteId}/midias/${midiaId}`, enviar('DELETE'), tokenAtual);
}

export function ordenarMidias(loteId: string, ids: string[]) {
  return requisitar<Midia[]>(`/lotes/${loteId}/midias/ordem`, enviar('PATCH', { ids }), tokenAtual);
}

export type ArquivoParaEnvio = {
  uri: string;
  nome: string;
  mime: string;
  tipo: TipoMidia;
  /** Só na web: o arquivo escolhido. Sem ele, é lido de novo pela uri. */
  arquivoWeb?: Blob;
};

// Um vídeo grande demora muitos minutos na internet da fazenda; o envio só desiste se parar de andar.
const ENVIO_PARADO_MS = 60_000;
// Depois de 100%, o celular ainda esvazia o que guardou para mandar e o armazenamento processa o arquivo.
const ESPERA_RESPOSTA_MS = 5 * 60_000;

/**
 * Erro do envio direto. A API local responde {mensagem}; o Cloudinary responde em inglês ({error: {message}}),
 * e aí a mensagem diz se adianta tentar de novo (autorização vencida) ou não (arquivo recusado).
 */
function erroDoEnvio(status: number, corpo: unknown, tipo: TipoMidia): ErroApi {
  const c = corpo as { mensagem?: unknown; error?: { message?: unknown } } | null;
  if (typeof c?.mensagem === 'string') return erroDaResposta(status, corpo);
  const doArmazenamento = typeof c?.error?.message === 'string' ? c.error.message : '';
  if (/file size too large|megapixel/i.test(doArmazenamento)) return new ErroApi(status, mensagemTamanho(tipo));
  if (status === 401 || /stale request/i.test(doArmazenamento)) {
    return new ErroApi(status, 'A autorização para enviar venceu. Tente de novo.');
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return new ErroApi(status, 'Este arquivo foi recusado (muito grande ou com defeito). Escolha outro.');
  }
  return erroDaResposta(status, corpo);
}

/**
 * Manda o arquivo direto para o armazenamento (Cloudinary, ou a própria API no modo local) com a autorização
 * de pedirEnvioMidia. Usa XMLHttpRequest porque o fetch não informa o progresso do envio.
 */
export async function enviarArquivo(
  envio: EnvioMidia,
  arquivo: ArquivoParaEnvio,
  aoProgredir?: (fracao: number) => void,
  sinal?: AbortSignal,
): Promise<RespostaUpload> {
  const formulario = new FormData();
  for (const [campo, valor] of Object.entries(envio.campos)) formulario.append(campo, valor);
  // O arquivo vai por último: assim quem recebe confere a autorização antes de receber os bytes.
  if (Platform.OS === 'web') {
    let blob = arquivo.arquivoWeb;
    if (!blob) {
      try {
        blob = await (await fetch(arquivo.uri)).blob();
      } catch {
        throw new ErroApi(0, 'Não foi possível ler o arquivo. Escolha de novo.');
      }
    }
    formulario.append(envio.campoArquivo, blob, arquivo.nome);
  } else {
    // No celular o FormData aceita {uri, name, type} e lê o arquivo direto do disco.
    formulario.append(envio.campoArquivo, { uri: arquivo.uri, name: arquivo.nome, type: arquivo.mime } as unknown as Blob);
  }

  return new Promise((resolve, reject) => {
    if (sinal?.aborted) {
      reject(new ErroApi(0, 'Envio cancelado.'));
      return;
    }
    const xhr = new XMLHttpRequest();
    let parado: ReturnType<typeof setTimeout> | undefined;
    let motivo: 'parado' | 'cancelado' = 'cancelado';
    let subiuTudo = false;
    const vigiar = (prazo = ENVIO_PARADO_MS) => {
      clearTimeout(parado);
      parado = setTimeout(() => {
        motivo = 'parado';
        xhr.abort();
      }, prazo);
    };
    const cancelar = () => xhr.abort();
    const terminar = () => {
      clearTimeout(parado);
      sinal?.removeEventListener('abort', cancelar);
    };

    xhr.upload.onprogress = (e) => {
      // No celular não existe upload.onload: o fim do envio é o progresso chegar a 100%.
      subiuTudo = e.lengthComputable && e.total > 0 && e.loaded >= e.total;
      vigiar(subiuTudo ? ESPERA_RESPOSTA_MS : ENVIO_PARADO_MS);
      if (e.lengthComputable && e.total > 0) aoProgredir?.(Math.min(e.loaded / e.total, 1));
    };
    xhr.onload = () => {
      terminar();
      let corpo: unknown = null;
      try {
        corpo = JSON.parse(xhr.responseText);
      } catch {
        // Corpo vazio ou que não é JSON.
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(erroDoEnvio(xhr.status, corpo, arquivo.tipo));
        return;
      }
      const r = (corpo ?? {}) as Partial<Record<keyof RespostaUpload, unknown>>;
      const versao = Number(r.version);
      if (typeof r.public_id !== 'string' || typeof r.signature !== 'string' || !Number.isInteger(versao)) {
        reject(new ErroApi(xhr.status, 'O envio terminou com uma resposta inesperada. Tente de novo.'));
        return;
      }
      resolve({ public_id: r.public_id, version: versao, signature: r.signature });
    };
    xhr.onerror = () => {
      terminar();
      reject(new ErroApi(0, 'Sem conexão para enviar o arquivo. Confira sua internet e tente de novo.'));
    };
    xhr.onabort = () => {
      terminar();
      reject(
        new ErroApi(
          0,
          motivo !== 'parado'
            ? 'Envio cancelado.'
            : subiuTudo
              ? 'O arquivo subiu, mas a confirmação não chegou. Tente de novo quando o sinal melhorar.'
              : 'O envio parou: a internet caiu ou está muito fraca. Tente de novo quando o sinal melhorar.',
        ),
      );
    };

    sinal?.addEventListener('abort', cancelar);
    xhr.open('POST', envio.url);
    vigiar();
    xhr.send(formulario);
  });
}
