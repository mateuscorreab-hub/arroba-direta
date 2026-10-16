import { z } from 'zod';

/** Fotos e vídeo dos anúncios: limites e contratos usados pela API, pelo app e pelo site. */

export const TIPOS_MIDIA = ['foto', 'video'] as const;
export type TipoMidia = (typeof TIPOS_MIDIA)[number];

export const MAX_FOTOS_LOTE = 10;
export const MAX_VIDEOS_LOTE = 1;

const MB = 1024 * 1024;
/** 10 MB é o máximo de imagem que o plano grátis do Cloudinary aceita. */
export const FOTO_MAX_BYTES = 10 * MB;
export const VIDEO_MAX_BYTES = 100 * MB;

export const VIDEO_MAX_SEGUNDOS = 60;
/** A duração medida depois do envio pode passar um pouco do que o celular gravou. */
export const VIDEO_MAX_SEGUNDOS_ACEITOS = VIDEO_MAX_SEGUNDOS + 2;

export const MIMES_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const MIMES_VIDEO = ['video/mp4', 'video/quicktime'] as const;

/**
 * Prazo para começar o envio com a autorização de POST /lotes/:id/midias/envio. Envio que começou a tempo
 * pode terminar depois (o Cloudinary aceita a assinatura por até 1 hora): o registro só confere a resposta.
 */
export const ENVIO_MIDIA_VALIDADE_MS = 15 * 60 * 1000;

export interface LimiteMidia {
  /** Quantas o lote pode ter. */
  maximo: number;
  maxBytes: number;
  mimes: readonly string[];
}

export const LIMITES_MIDIA: Record<TipoMidia, LimiteMidia> = {
  foto: { maximo: MAX_FOTOS_LOTE, maxBytes: FOTO_MAX_BYTES, mimes: MIMES_FOTO },
  video: { maximo: MAX_VIDEOS_LOTE, maxBytes: VIDEO_MAX_BYTES, mimes: MIMES_VIDEO },
};

const EXTENSOES = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['mp4', 'video/mp4'],
  ['mov', 'video/quicktime'],
]);

/** Para quando o celular não informa o tipo do arquivo: deduz pelo nome ou caminho. */
export function mimePelaExtensao(nomeOuCaminho: string): string | null {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(nomeOuCaminho)?.[1]?.toLowerCase();
  return (ext && EXTENSOES.get(ext)) || null;
}

/** Alguns Android informam "image/jpg", que não existe. */
export function normalizarMime(mime: string): string {
  const m = mime.trim().toLowerCase();
  return m === 'image/jpg' ? 'image/jpeg' : m;
}

/** Mensagem para arquivo acima do limite do tipo (o app, a API e o envio local usam a mesma). */
export function mensagemTamanho(tipo: TipoMidia, maxBytes = LIMITES_MIDIA[tipo].maxBytes): string {
  const mb = Math.round(maxBytes / MB);
  return tipo === 'foto'
    ? `A foto passa de ${mb} MB. Escolha outra foto.`
    : `Este vídeo é pesado demais (o limite é ${mb} MB). Grave um vídeo mais curto, de uns 30 segundos, ou mude a câmera para HD (720p).`;
}

export function duracaoVideoAceita(segundos: number): boolean {
  return segundos <= VIDEO_MAX_SEGUNDOS_ACEITOS;
}

export const envioMidiaSchema = z
  .object({
    tipo: z.enum(TIPOS_MIDIA, { message: 'Escolha foto ou vídeo' }),
    mime: z.string().max(100).transform(normalizarMime),
    tamanho: z.number().int().positive('O arquivo está vazio'),
  })
  .superRefine((e, ctx) => {
    const foto = e.tipo === 'foto';
    const limite = LIMITES_MIDIA[e.tipo];
    if (!limite.mimes.includes(e.mime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mime'],
        message: foto ? 'A foto precisa ser JPG, PNG, WEBP ou HEIC' : 'O vídeo precisa ser MP4 ou MOV',
      });
    }
    if (e.tamanho > limite.maxBytes) {
      ctx.addIssue({ code: 'custom', path: ['tamanho'], message: mensagemTamanho(e.tipo) });
    }
  });
export type PedidoEnvioMidia = z.infer<typeof envioMidiaSchema>;

export const registrarMidiaSchema = z.object({
  tipo: z.enum(TIPOS_MIDIA, { message: 'Escolha foto ou vídeo' }),
  // Sem ponto: o modo local usa o publicId como caminho de arquivo.
  publicId: z.string().max(255).regex(/^[\w-]+(\/[\w-]+)*$/, 'Envio inválido'),
  versao: z.number().int().positive(),
  assinatura: z.string().regex(/^[0-9a-f]{40,64}$/i, 'Envio inválido'),
});
export type RegistrarMidia = z.infer<typeof registrarMidiaSchema>;

export const ordemMidiasSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(MAX_FOTOS_LOTE + MAX_VIDEOS_LOTE)
    .refine((ids) => new Set(ids).size === ids.length, 'A mesma foto aparece duas vezes na ordem'),
});
export type OrdemMidias = z.infer<typeof ordemMidiasSchema>;

/** Foto ou vídeo de um lote, como a API devolve. */
export interface Midia {
  id: string;
  tipo: TipoMidia;
  /** Foto em tamanho de tela, ou o vídeo em MP4. */
  url: string;
  /** Imagem 600x450 para grade e cartões; no vídeo, um quadro do início (serve de pôster). */
  miniatura: string;
  largura: number | null;
  altura: number | null;
  duracaoSeg: number | null;
  ordem: number;
}

/** Autorização para enviar um arquivo direto ao armazenamento (Cloudinary, ou a própria API no modo local). */
export interface EnvioMidia {
  url: string;
  /** Vão no formulário multipart junto com o arquivo, sem mudar nada. */
  campos: Record<string, string>;
  campoArquivo: 'file';
  /** ISO 8601. */
  expiraEm: string;
}

/** O mínimo que a resposta do envio traz e que o app repassa para POST /lotes/:id/midias. */
export interface RespostaUpload {
  public_id: string;
  version: number;
  signature: string;
}
