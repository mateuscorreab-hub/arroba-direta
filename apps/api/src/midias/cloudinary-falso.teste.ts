import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { TIPO_DO_FORMATO, detectarFormato, dimensoesImagem, duracaoVideo, lerDeBuffer } from './arquivo-midia.js';
import { assinarParametros, assinaturaResposta } from './cloudinary.js';
import type { ConfigCloudinary } from './config-midia.js';

interface Guardado {
  recurso: 'image' | 'video';
  versao: number;
  bytes: number;
  formato: string;
  largura: number | null;
  altura: number | null;
  duracao: number | null;
}

/**
 * Cloudinary de mentira para os testes (api.cloudinary.com é bloqueado aqui). Confere as
 * assinaturas como o de verdade e lê duração e dimensões dos cabeçalhos do arquivo.
 */
export class CloudinaryFalso {
  readonly arquivos = new Map<string, Guardado>();
  readonly apagados: { recurso: string; publicId: string }[] = [];
  falharBusca = false;
  falharApagar = false;
  private servidor?: Server;
  private ultimaVersao = 0;
  base = '';

  constructor(private readonly cfg: Omit<ConfigCloudinary, 'apiBase'>) {}

  /** Sobe numa porta livre entre 3400 e 3499. */
  async subir(): Promise<this> {
    const servidor = createServer((req, res) => {
      this.atender(req, res).catch((e: Error) => responder(res, 500, { error: { message: e.message } }));
    });
    const inicio = Math.floor(Math.random() * 100);
    for (let i = 0; i < 100; i++) {
      const porta = 3400 + ((inicio + i) % 100);
      const subiu = await new Promise<boolean>((ok) => {
        servidor.once('error', () => ok(false));
        servidor.listen(porta, '127.0.0.1', () => ok(true));
      });
      if (subiu) {
        this.servidor = servidor;
        this.base = `http://127.0.0.1:${porta}`;
        return this;
      }
    }
    throw new Error('Nenhuma porta livre entre 3400 e 3499');
  }

  async fechar() {
    await new Promise((ok) => this.servidor?.close(ok));
  }

  private async atender(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.base);
    const prefixo = `/v1_1/${this.cfg.cloudName}/`;
    if (!url.pathname.startsWith(prefixo)) return responder(res, 404, { error: { message: 'Cloud desconhecida' } });
    const partes = url.pathname.slice(prefixo.length).split('/');

    if (req.method === 'GET' && partes[0] === 'resources' && partes[2] === 'upload') {
      const esperado = `Basic ${Buffer.from(`${this.cfg.apiKey}:${this.cfg.apiSecret}`).toString('base64')}`;
      if (req.headers.authorization !== esperado) return responder(res, 401, { error: { message: 'Credenciais' } });
      if (this.falharBusca) return responder(res, 500, { error: { message: 'Falha simulada' } });
      const publicId = decodeURIComponent(partes.slice(3).join('/'));
      const a = this.arquivos.get(publicId);
      if (!a || a.recurso !== partes[1]) return responder(res, 404, { error: { message: `Resource not found - ${publicId}` } });
      return responder(res, 200, this.detalhes(publicId, a));
    }

    if (req.method === 'POST' && partes.length === 2 && ['image', 'video'].includes(partes[0])) {
      const recurso = partes[0] as Guardado['recurso'];
      const cabecalhos = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') cabecalhos.set(k, v);
      const form = await new Request(url, {
        method: 'POST',
        headers: cabecalhos,
        body: Readable.toWeb(req) as ReadableStream,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }).formData();
      const campos: Record<string, string> = {};
      for (const [k, v] of form) if (typeof v === 'string') campos[k] = v;
      const { signature, api_key, ...assinados } = campos;
      if (api_key !== this.cfg.apiKey || signature !== assinarParametros(assinados, this.cfg.apiSecret)) {
        return responder(res, 401, { error: { message: 'Invalid Signature' } });
      }
      if (Math.abs(Date.now() / 1000 - Number(campos.timestamp)) > 3600) {
        return responder(res, 400, { error: { message: 'Stale request' } });
      }
      const publicId = campos.public_id;
      if (partes[1] === 'destroy') {
        if (this.falharApagar) return responder(res, 500, { error: { message: 'Falha simulada' } });
        this.apagados.push({ recurso, publicId });
        const existia = this.arquivos.get(publicId)?.recurso === recurso && this.arquivos.delete(publicId);
        return responder(res, 200, { result: existia ? 'ok' : 'not found' });
      }
      if (partes[1] !== 'upload') return responder(res, 404, { error: { message: 'Rota desconhecida' } });

      const existente = this.arquivos.get(publicId);
      if (existente && campos.overwrite === 'false') return responder(res, 200, { ...this.detalhes(publicId, existente), existing: true });
      const arquivo = form.get('file');
      if (!(arquivo instanceof Blob)) return responder(res, 400, { error: { message: 'Missing required parameter - file' } });
      const buf = Buffer.from(await arquivo.arrayBuffer());
      const formato = detectarFormato(buf);
      if (!formato || (TIPO_DO_FORMATO[formato] === 'foto') !== (recurso === 'image')) {
        return responder(res, 400, { error: { message: `Invalid ${recurso} file` } });
      }
      const dims = recurso === 'image' ? dimensoesImagem(formato, buf) : { largura: 1280, altura: 720 };
      this.ultimaVersao = Math.max(Math.floor(Date.now() / 1000), this.ultimaVersao + 1);
      const guardado: Guardado = {
        recurso,
        versao: this.ultimaVersao,
        bytes: buf.length,
        formato,
        ...dims,
        duracao: recurso === 'video' ? await duracaoVideo(lerDeBuffer(buf), buf.length) : null,
      };
      this.arquivos.set(publicId, guardado);
      return responder(res, 200, this.detalhes(publicId, guardado));
    }

    responder(res, 404, { error: { message: 'Rota desconhecida' } });
  }

  private detalhes(publicId: string, a: Guardado) {
    return {
      public_id: publicId,
      version: a.versao,
      signature: assinaturaResposta(publicId, a.versao, this.cfg.apiSecret),
      resource_type: a.recurso,
      type: 'upload',
      format: a.formato,
      bytes: a.bytes,
      width: a.largura,
      height: a.altura,
      ...(a.duracao === null ? {} : { duration: a.duracao }),
      secure_url: `https://res.cloudinary.com/${this.cfg.cloudName}/${a.recurso}/upload/v${a.versao}/${publicId}.${a.formato}`,
    };
  }
}

function responder(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(corpo));
}
