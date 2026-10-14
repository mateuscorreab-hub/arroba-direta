import { createHash, timingSafeEqual } from 'node:crypto';
import type { EnvioMidia, TipoMidia } from '@arroba/shared';
import type { Armazenamento, DadosArquivo, MidiaGuardada, PedidoEnvio, UrlsMidia } from './armazenamento.js';
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
    url: `${base}/q_auto/${arquivo}.mp4`,
    miniatura: `${base}/so_0,c_fill,w_600,h_450,q_auto/${arquivo}.jpg`,
  };
}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inteiro = (v: unknown) => (numero(v) === null ? null : Math.round(v as number));

export class ArmazenamentoCloudinary implements Armazenamento {
  readonly nome = 'cloudinary';

  constructor(private readonly cfg: ConfigCloudinary) {}

  private endereco(caminho: string) {
    return `${this.cfg.apiBase}/v1_1/${this.cfg.cloudName}/${caminho}`;
  }

  prepararEnvio({ tipo, publicId, expiraEm }: PedidoEnvio): EnvioMidia {
    // O public_id vai com o caminho inteiro (arroba/lotes/{loteId}/...), em vez de "folder":
    // funciona igual nas contas com pastas fixas e nas com pastas dinâmicas.
    // overwrite=false: repetir o envio com o mesmo ticket não troca um arquivo já conferido.
    const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), overwrite: 'false' };
    return {
      url: this.endereco(`${recursoCloudinary(tipo)}/upload`),
      campos: {
        api_key: this.cfg.apiKey,
        public_id: params.public_id,
        timestamp: String(params.timestamp),
        overwrite: params.overwrite,
        signature: assinarParametros(params, this.cfg.apiSecret),
      },
      campoArquivo: 'file',
      expiraEm: expiraEm.toISOString(),
    };
  }

  assinaturaValida(publicId: string, versao: number, assinatura: string): boolean {
    return mesmaAssinatura(assinaturaResposta(publicId, versao, this.cfg.apiSecret), assinatura);
  }

  async buscarDados(tipo: TipoMidia, publicId: string): Promise<DadosArquivo | null> {
    const chave = Buffer.from(`${this.cfg.apiKey}:${this.cfg.apiSecret}`).toString('base64');
    const res = await fetch(this.endereco(`resources/${recursoCloudinary(tipo)}/upload/${publicId}`), {
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
      duracaoSeg: numero(r.duration),
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
