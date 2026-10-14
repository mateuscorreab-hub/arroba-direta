import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** Onde ficam as fotos e vídeos dos anúncios. */
export type ModoArmazenamento = 'cloudinary' | 'local' | 'desligado';

export interface ConfigCloudinary {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Base da API (sem "/" no fim). Muda só nos testes, para um servidor falso. */
  apiBase: string;
}

export interface ConfigLocal {
  /** Caminho absoluto da pasta dos arquivos. */
  pasta: string;
  /** Endereço da API visto pelo app e pelo site (sem "/" no fim). */
  urlPublica: string;
  /** Assina os tickets de envio e as respostas do envio local. */
  segredo: string;
}

export type ConfigMidia =
  | { modo: 'desligado' }
  | { modo: 'cloudinary'; cloudinary: ConfigCloudinary }
  | { modo: 'local'; local: ConfigLocal };

export const CONFIG_MIDIA = Symbol('CONFIG_MIDIA');

/** apps/api/uploads, rodando de src/ (tsx, testes) ou de dist/ (compilado). */
export const PASTA_LOCAL_PADRAO = path.join(import.meta.dirname, '../../uploads');

const FORMATO_CLOUDINARY = 'cloudinary://API_KEY:API_SECRET@CLOUD_NAME';

/** Lê CLOUDINARY_URL. A mensagem de erro nunca repete o valor, que tem o segredo. */
export function lerCloudinaryUrl(valor: string): Omit<ConfigCloudinary, 'apiBase'> {
  const m = /^cloudinary:\/\/([\w-]+):([\w-]+)@([\w-]+)\/?(?:\?.*)?$/.exec(valor.trim());
  if (!m) {
    throw new Error(
      `CLOUDINARY_URL inválida. O formato é ${FORMATO_CLOUDINARY} (copie do painel do Cloudinary, em Settings > API Keys).`,
    );
  }
  return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
}

function lerUrlBase(nome: string, valor: string): string {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${nome} inválida: "${valor}". Use um endereço completo, como http://192.168.0.10:3333.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${nome} inválida: "${valor}". O endereço precisa começar com http:// ou https://.`);
  }
  return valor.trim().replace(/\/+$/, '');
}

/**
 * Lê MIDIA_ARMAZENAMENTO e as variáveis de cada modo. Lança erro (e a API não sobe) com valor inválido.
 * Sem a variável: "cloudinary" se houver CLOUDINARY_URL; "desligado" no Render (o disco é apagado a
 * cada reinício); senão "local".
 */
export function lerConfigMidia(env: Record<string, string | undefined> = process.env): ConfigMidia {
  const cloudinaryUrl = env.CLOUDINARY_URL?.trim();
  const modo = env.MIDIA_ARMAZENAMENTO?.trim() || (cloudinaryUrl ? 'cloudinary' : env.RENDER ? 'desligado' : 'local');

  if (modo === 'desligado') return { modo };

  if (modo === 'cloudinary') {
    if (!cloudinaryUrl) {
      throw new Error(
        `MIDIA_ARMAZENAMENTO=cloudinary precisa de CLOUDINARY_URL no formato ${FORMATO_CLOUDINARY} (fica no painel do Cloudinary, em Settings > API Keys).`,
      );
    }
    const apiBase = env.CLOUDINARY_API_BASE?.trim()
      ? lerUrlBase('CLOUDINARY_API_BASE', env.CLOUDINARY_API_BASE)
      : 'https://api.cloudinary.com';
    return { modo, cloudinary: { ...lerCloudinaryUrl(cloudinaryUrl), apiBase } };
  }

  if (modo === 'local') {
    const segredo = env.MIDIA_SEGREDO_LOCAL?.trim();
    if (segredo && segredo.length < 16) {
      throw new Error('MIDIA_SEGREDO_LOCAL muito curto: use pelo menos 16 caracteres (ou apague a variável).');
    }
    const urlPublica = env.API_URL_PUBLICA?.trim()
      ? lerUrlBase('API_URL_PUBLICA', env.API_URL_PUBLICA)
      : `http://localhost:${env.PORT?.trim() || 3333}`;
    return {
      modo,
      local: {
        pasta: path.resolve(env.MIDIA_PASTA_LOCAL?.trim() || PASTA_LOCAL_PADRAO),
        urlPublica,
        segredo: segredo || randomBytes(32).toString('hex'),
      },
    };
  }

  throw new Error(`MIDIA_ARMAZENAMENTO inválido: "${modo}". Use "cloudinary", "local" ou "desligado".`);
}
