import { createHmac, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BadRequestException, HttpException, InternalServerErrorException, Logger } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import {
  FOTO_MAX_BYTES,
  LIMITES_MIDIA,
  TIPOS_MIDIA,
  VIDEO_MAX_BYTES,
  mensagemTamanho,
  type EnvioMidia,
  type TipoMidia,
} from '@arroba/shared';
import {
  pastaDoLote,
  type Armazenamento,
  type DadosArquivo,
  type MidiaGuardada,
  type PedidoEnvio,
  type UrlsMidia,
} from './armazenamento.js';
import { TIPO_DO_FORMATO, detectarFormato, lerDadosArquivo, mensagemFormato, type Formato } from './arquivo-midia.js';
import { mesmaAssinatura } from './cloudinary.js';
import type { ConfigLocal } from './config-midia.js';

/** Campos do ticket de envio local, já em ordem alfabética (é a ordem da assinatura). */
const CAMPOS_TICKET = ['expira', 'lote', 'max_bytes', 'mime', 'public_id', 'tipo'] as const;
export type TicketLocal = Record<(typeof CAMPOS_TICKET)[number], string>;

export interface TicketConferido {
  tipo: TipoMidia;
  maxBytes: number;
  publicId: string;
}

/** O que POST /midias/local guarda em req.file depois de gravar. */
export interface ArquivoRecebido {
  tipo: TipoMidia;
  publicId: string;
  formato: Formato;
  bytes: number;
  versao: number;
  /** Só quando o arquivo é novo: o multer apaga este caminho se a requisição falhar depois. */
  path?: string;
}

interface ArquivoMulter {
  fieldname: string;
  stream: Readable;
}

const hmac = (segredo: string, texto: string) => createHmac('sha256', segredo).update(texto).digest('hex');

export function assinarTicket(t: TicketLocal, segredo: string): string {
  return hmac(segredo, CAMPOS_TICKET.map((k) => `${k}=${t[k]}`).join('&'));
}

const envioInvalido = () => new BadRequestException({ mensagem: 'Envio inválido. Tente de novo.' });

/** Confere o ticket que veio nos campos do formulário. A validade é conferida no começo do envio. */
export function conferirTicket(campos: Record<string, unknown>, segredo: string, agora = Date.now()): TicketConferido {
  const t = {} as TicketLocal;
  for (const k of CAMPOS_TICKET) {
    const v = campos[k];
    if (typeof v !== 'string') throw envioInvalido();
    t[k] = v;
  }
  const assinatura = campos.signature;
  if (typeof assinatura !== 'string' || !mesmaAssinatura(assinarTicket(t, segredo), assinatura)) throw envioInvalido();
  if (!(Number(t.expira) > agora)) {
    throw new BadRequestException({ mensagem: 'O tempo para enviar este arquivo acabou. Tente de novo.' });
  }
  const tipo = TIPOS_MIDIA.find((x) => x === t.tipo);
  if (!tipo || !t.public_id.startsWith(`${pastaDoLote(t.lote)}/`)) throw envioInvalido();
  return { tipo, maxBytes: Number(t.max_bytes), publicId: t.public_id };
}

const SEGMENTO = /^[\w-]+(\.[a-z0-9]{2,5})?$/i;

/** Caminho dentro da pasta, ou null se algum pedaço for estranho ("..", ".oculto", barras) ou sair dela. */
export function caminhoNaPasta(pasta: string, partes: string[]): string | null {
  if (partes.length === 0 || partes.some((p) => !SEGMENTO.test(p))) return null;
  const caminho = path.resolve(pasta, ...partes);
  const relativo = path.relative(pasta, caminho);
  return relativo && !relativo.startsWith('..') && !path.isAbsolute(relativo) ? caminho : null;
}

class ArquivoGrande extends Error {}

/** Armazenamento na própria API, para desenvolvimento e testes. Imita o fluxo do Cloudinary. */
export class ArmazenamentoLocal implements Armazenamento {
  readonly nome = 'local';
  private readonly logger = new Logger('Midias');
  private readonly tickets = new WeakMap<object, TicketConferido>();

  constructor(private readonly cfg: ConfigLocal) {}

  prepararEnvio({ loteId, tipo, mime, publicId, expiraEm }: PedidoEnvio): EnvioMidia {
    const ticket: TicketLocal = {
      expira: String(expiraEm.getTime()),
      lote: loteId,
      max_bytes: String(LIMITES_MIDIA[tipo].maxBytes),
      mime,
      public_id: publicId,
      tipo,
    };
    return {
      url: `${this.cfg.urlPublica}/midias/local`,
      campos: { ...ticket, signature: assinarTicket(ticket, this.cfg.segredo) },
      campoArquivo: 'file',
      expiraEm: expiraEm.toISOString(),
    };
  }

  private assinarResposta(publicId: string, versao: number) {
    return hmac(this.cfg.segredo, `public_id=${publicId}&version=${versao}`);
  }

  assinaturaValida(publicId: string, versao: number, assinatura: string): boolean {
    return mesmaAssinatura(this.assinarResposta(publicId, versao), assinatura);
  }

  /** O arquivo gravado para o publicId (o nome leva a extensão do formato). */
  private async acharArquivo(publicId: string): Promise<{ caminho: string; formato: Formato } | null> {
    const base = caminhoNaPasta(this.cfg.pasta, publicId.split('/'));
    if (!base) return null;
    let nomes: string[];
    try {
      nomes = await readdir(path.dirname(base));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    const prefixo = `${path.basename(base)}.`;
    const nome = nomes.find((n) => n.startsWith(prefixo) && Object.hasOwn(TIPO_DO_FORMATO, n.slice(prefixo.length)));
    return nome ? { caminho: path.join(path.dirname(base), nome), formato: nome.slice(prefixo.length) as Formato } : null;
  }

  async buscarDados(tipo: TipoMidia, publicId: string): Promise<DadosArquivo | null> {
    const achado = await this.acharArquivo(publicId);
    if (!achado || TIPO_DO_FORMATO[achado.formato] !== tipo) return null;
    const dados = await lerDadosArquivo(achado.caminho, achado.formato);
    return { ...dados, formato: achado.formato, url: this.urlArquivo(publicId, achado.formato) };
  }

  async apagar(_tipo: TipoMidia, publicId: string): Promise<void> {
    const achado = await this.acharArquivo(publicId);
    if (achado) await rm(achado.caminho, { force: true });
  }

  private urlArquivo(publicId: string, formato: string) {
    return `${this.cfg.urlPublica}/arquivos/${publicId}.${formato}`;
  }

  /** Monta com a API_URL_PUBLICA atual; da url gravada só se aproveita a extensão. */
  urls(m: MidiaGuardada): UrlsMidia {
    const url = this.urlArquivo(m.publicId, /\.(\w+)$/.exec(m.url)?.[1] ?? '');
    return { url, miniatura: m.tipo === 'foto' ? url : `${this.cfg.urlPublica}/midias/local/capa-video.png` };
  }

  /** Arquivo pedido em GET /arquivos/..., ou null se o caminho sairia da pasta. */
  caminhoPublico(partes: string[]): string | null {
    return caminhoNaPasta(this.cfg.pasta, partes);
  }

  /** Resposta de POST /midias/local, com os mesmos campos da do Cloudinary. */
  respostaEnvio(a: ArquivoRecebido) {
    return {
      public_id: a.publicId,
      version: a.versao,
      signature: this.assinarResposta(a.publicId, a.versao),
      secure_url: this.urlArquivo(a.publicId, a.formato),
      bytes: a.bytes,
      resource_type: a.tipo === 'foto' ? 'image' : 'video',
      format: a.formato,
    };
  }

  /** Multer de POST /midias/local: confere o ticket quando o arquivo começa e corta no tamanho máximo. */
  opcoesMulter(): MulterModuleOptions {
    return {
      limits: {
        fileSize: Math.max(FOTO_MAX_BYTES, VIDEO_MAX_BYTES),
        files: 1,
        fields: 10,
        fieldSize: 1024,
        fieldNameSize: 50,
        parts: 12,
      },
      fileFilter: (req: { body?: Record<string, unknown> }, file, cb) => {
        if (file.fieldname !== 'file') return cb(new BadRequestException({ mensagem: 'Envie o arquivo no campo "file".' }), false);
        try {
          this.tickets.set(file, conferirTicket(req.body ?? {}, this.cfg.segredo));
          cb(null, true);
        } catch (e) {
          cb(e as Error, false);
        }
      },
      storage: {
        _handleFile: (_req: unknown, file: ArquivoMulter, cb: (e: Error | null, info?: ArquivoRecebido) => void) => {
          this.gravar(file).then((info) => cb(null, info), cb);
        },
        _removeFile: (_req: unknown, file: { path?: string }, cb: (e: Error | null) => void) => {
          if (!file.path) return cb(null);
          rm(file.path, { force: true }).then(() => cb(null), cb);
        },
      },
    };
  }

  private async gravar(file: ArquivoMulter): Promise<ArquivoRecebido> {
    const ticket = this.tickets.get(file);
    if (!ticket) throw envioInvalido();
    const temporarios = path.join(this.cfg.pasta, '.envios');
    const temporario = path.join(temporarios, randomUUID());
    let bytes = 0;
    let inicio = Buffer.alloc(0);
    const contador = new Transform({
      transform(pedaco: Buffer, _codificacao, seguir) {
        bytes += pedaco.length;
        if (bytes > ticket.maxBytes) return seguir(new ArquivoGrande());
        if (inicio.length < 64) inicio = Buffer.concat([inicio, pedaco.subarray(0, 64 - inicio.length)]);
        seguir(null, pedaco);
      },
    });
    try {
      await mkdir(temporarios, { recursive: true });
      await pipeline(file.stream, contador, createWriteStream(temporario));
      const formato = detectarFormato(inicio);
      if (!formato || TIPO_DO_FORMATO[formato] !== ticket.tipo) {
        throw new BadRequestException({ mensagem: mensagemFormato(ticket.tipo) });
      }
      // Como o overwrite=false do Cloudinary: repetir o envio devolve o arquivo que já existe.
      const existente = await this.acharArquivo(ticket.publicId);
      let caminho = existente?.caminho ?? null;
      if (!caminho) {
        caminho = caminhoNaPasta(this.cfg.pasta, `${ticket.publicId}.${formato}`.split('/'));
        if (!caminho) throw envioInvalido();
        await mkdir(path.dirname(caminho), { recursive: true });
        await rename(temporario, caminho);
      }
      const info = await stat(caminho);
      return {
        tipo: ticket.tipo,
        publicId: ticket.publicId,
        formato: existente?.formato ?? formato,
        bytes: info.size,
        versao: Math.floor(info.mtimeMs / 1000),
        path: existente ? undefined : caminho,
      };
    } catch (e) {
      if (e instanceof ArquivoGrande) throw new BadRequestException({ mensagem: mensagemTamanho(ticket.tipo, ticket.maxBytes) });
      if (e instanceof HttpException) throw e;
      this.logger.warn(`Envio local interrompido (${ticket.publicId}): ${(e as Error).message}`);
      throw new InternalServerErrorException({ mensagem: 'Não foi possível guardar o arquivo. Tente de novo.' });
    } finally {
      await rm(temporario, { force: true });
    }
  }
}
