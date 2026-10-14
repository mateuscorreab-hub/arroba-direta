import type { EnvioMidia, TipoMidia } from '@arroba/shared';

/** O que o armazenamento diz do arquivo depois do envio. Nada disso vem do app. */
export interface DadosArquivo {
  bytes: number;
  largura: number | null;
  altura: number | null;
  duracaoSeg: number | null;
  /** jpg, png, webp, heic, mp4, mov... ou null se não deu para saber. */
  formato: string | null;
  /** Endereço original do arquivo (fica na coluna url). */
  url: string;
}

export interface PedidoEnvio {
  loteId: string;
  tipo: TipoMidia;
  mime: string;
  publicId: string;
  expiraEm: Date;
}

/** A parte de uma mídia guardada que basta para montar os endereços. */
export interface MidiaGuardada {
  tipo: TipoMidia;
  publicId: string;
  versao: number | null;
  url: string;
}

export interface UrlsMidia {
  url: string;
  miniatura: string;
}

/** Cloudinary em produção; a própria API (pasta local) em desenvolvimento e testes. */
export interface Armazenamento {
  readonly nome: 'cloudinary' | 'local';
  /** Campos para o app enviar o arquivo direto ao armazenamento, sem passar o segredo. */
  prepararEnvio(p: PedidoEnvio): EnvioMidia;
  /** Confere a assinatura que o armazenamento pôs na resposta do envio. */
  assinaturaValida(publicId: string, versao: number, assinatura: string): boolean;
  /** Dados reais do arquivo, ou null se ele não existe. */
  buscarDados(tipo: TipoMidia, publicId: string): Promise<DadosArquivo | null>;
  apagar(tipo: TipoMidia, publicId: string): Promise<void>;
  urls(m: MidiaGuardada): UrlsMidia;
}

/** null quando MIDIA_ARMAZENAMENTO=desligado. */
export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO');
