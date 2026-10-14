import { createHash, timingSafeEqual } from 'node:crypto';
import type { EnvioMidia, TipoMidia } from '@arroba/shared';
import {
  pastaDoLote,
  type Armazenamento,
  type DadosArquivo,
  type MidiaGuardada,
  type PedidoEnvio,
  type UrlsMidia,
} from './armazenamento.js';
import type { ConfigCloudinary } from './config-midia.js';

const TEMPO_LIMITE_MS = 20_000;
const FORA_DA_ASSINATURA = new Set(['file', 'api_key', 'resource_type', 'cloud_name']);

const sha1 = (texto: string) => createHash('sha1').update(texto).digest('hex');

/** Assinatura do Cloudinary: sha1 de "chave=valor&..." em ordem alfabética, seguido do api_secret. */
export function assinarParametros(params: Record<string, string | number>, apiSecret: string): string {
  const texto = Object.keys(params)
    .filter((k) => !FORA_DA_ASSINATURA.has(k) && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return sha1(texto + apiSecret);
}

/** A assinatura que o Cloudinary põe na resposta do envio. */
export function assinaturaResposta(publicId: string, versao: number, apiSecret: string): string {
  return sha1(`public_id=${publicId}&version=${versao}${apiSecret}`);
}

export function mesmaAssinatura(esperada: string, recebida: string): boolean {
  const a = Buffer.from(esperada.toLowerCase(), 'utf8');
  const b = Buffer.from(recebida.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const recursoCloudinary = (tipo: TipoMidia) => (tipo === 'foto' ? 'image' : 'video');

const VIDEO_MP4 = 'q_auto';
const CAPA_VIDEO = 'so_0,c_fill,w_600,h_450,q_auto';
/**
 * As versões do vídeo usadas nas URLs de entrega, geradas logo depois do envio: o plano grátis não
 * transforma na hora vídeo acima de ~40 MB.
 */
export const EAGER_VIDEO = `${VIDEO_MP4}/mp4|${CAPA_VIDEO}/jpg`;

/** Endereços de entrega, com as transformações (tamanho de tela, miniatura e quadro do vídeo). */
export function urlsCloudinary(cloudName: string, m: Pick<MidiaGuardada, 'tipo' | 'publicId' | 'versao'>): UrlsMidia {
  const base = `https://res.cloudinary.com/${cloudName}/${recursoCloudinary(m.tipo)}/upload`;
  const arquivo = `${m.versao ? `v${m.versao}/` : ''}${m.publicId}`;
  if (m.tipo === 'foto') {
    return {
      url: `${base}/c_limit,w_1600,q_auto,f_auto/${arquivo}`,
      miniatura: `${base}/c_fill,w_600,h_450,q_auto,f_auto/${arquivo}`,
    };
  }
  return {
    url: `${base}/${VIDEO_MP4}/${arquivo}.mp4`,
    miniatura: `${base}/${CAPA_VIDEO}/${arquivo}.jpg`,
  };
}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inteiro = (v: unknown) => (numero(v) === null ? null : Math.round(v as number));

/** Duração do vídeo: "duration" ou, se faltar, a do bloco video_metadata de media_metadata=true (texto, como "45.2"). */
function duracaoCloudinary(r: Record<string, unknown>): number | null {
  const meta = (r.video_metadata as { format?: { duration?: unknown } } | undefined)?.format?.duration;
  return numero(r.duration) ?? (typeof meta === 'string' ? numero(parseFloat(meta)) : numero(meta));
}

export class ArmazenamentoCloudinary implements Armazenamento {
  readonly nome = 'cloudinary';

  constructor(private readonly cfg: ConfigCloudinary) {}

  private endereco(caminho: string) {
    return `${this.cfg.apiBase}/v1_1/${this.cfg.cloudName}/${caminho}`;
  }

  prepararEnvio({ loteId, tipo, publicId, expiraEm }: PedidoEnvio): EnvioMidia {
    // Conta com "pastas dinâmicas": "folder" não entra no public_id. Por isso o public_id já vai com o caminho
    // inteiro (arroba/lotes/{loteId}/...) e asset_folder põe o arquivo na pasta do lote no painel.
    // overwrite=false: repetir o envio com o mesmo ticket não troca um arquivo já conferido.
    const params: Record<string, string> = {
      public_id: publicId,
      asset_folder: pastaDoLote(loteId),
      timestamp: String(Math.floor(Date.now() / 1000)),
      overwrite: 'false',
      ...(tipo === 'video' ? { eager: EAGER_VIDEO, eager_async: 'true' } : {}),
    };
    return {
      url: this.endereco(`${recursoCloudinary(tipo)}/upload`),
      campos: { api_key: this.cfg.apiKey, ...params, signature: assinarParametros(params, this.cfg.apiSecret) },
      campoArquivo: 'file',
      expiraEm: expiraEm.toISOString(),
    };
  }

  assinaturaValida(publicId: string, versao: number, assinatura: string): boolean {
    return mesmaAssinatura(assinaturaResposta(publicId, versao, this.cfg.apiSecret), assinatura);
  }

  async buscarDados(tipo: TipoMidia, publicId: string): Promise<DadosArquivo | null> {
    const chave = Buffer.from(`${this.cfg.apiKey}:${this.cfg.apiSecret}`).toString('base64');
    // media_metadata=true garante a duração do vídeo na resposta.
    const consulta = tipo === 'video' ? '?media_metadata=true' : '';
    const res = await fetch(this.endereco(`resources/${recursoCloudinary(tipo)}/upload/${publicId}${consulta}`), {
      headers: { Authorization: `Basic ${chave}` },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudinary respondeu ${res.status} ao buscar ${publicId}`);
    const r = (await res.json()) as Record<string, unknown>;
    return {
      bytes: inteiro(r.bytes) ?? 0,
      largura: inteiro(r.width),
      altura: inteiro(r.height),
      duracaoSeg: tipo === 'video' ? duracaoCloudinary(r) : null,
      formato: typeof r.format === 'string' ? r.format.toLowerCase() : null,
      url: typeof r.secure_url === 'string' ? r.secure_url : urlsCloudinary(this.cfg.cloudName, { tipo, publicId, versao: null }).url,
    };
  }

  async apagar(tipo: TipoMidia, publicId: string): Promise<void> {
    const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), invalidate: 'true' };
    const corpo = new URLSearchParams({
      ...params,
      timestamp: String(params.timestamp),
      api_key: this.cfg.apiKey,
      signature: assinarParametros(params, this.cfg.apiSecret),
    });
    const res = await fetch(this.endereco(`${recursoCloudinary(tipo)}/destroy`), {
      method: 'POST',
      body: corpo,
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!res.ok) throw new Error(`Cloudinary respondeu ${res.status} ao apagar ${publicId}`);
  }

  urls(m: MidiaGuardada): UrlsMidia {
    return urlsCloudinary(this.cfg.cloudName, m);
  }
}
