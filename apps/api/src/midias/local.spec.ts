import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BadRequestException, NotFoundException, PayloadTooLargeException, type ArgumentsHost } from '@nestjs/common';
import { FOTO_MAX_BYTES } from '@arroba/shared';
import {
  capaVideoPng,
  detectarFormato,
  dimensoesImagem,
  duracaoVideo,
  lerDeBuffer,
} from './arquivo-midia.js';
import { jpg, mp4, png } from './arquivos-falsos.teste.js';
import { ArmazenamentoLocal, assinarTicket, caminhoNaPasta, conferirTicket, type TicketLocal } from './local.js';
import { ErroEnvioLocalFilter } from './midias-local.controller.js';
import { problemaNoArquivo } from './midias.service.js';

const SEGREDO = 'segredo-dos-testes-unitarios';

describe('ticket do envio local', () => {
  const agora = Date.now();
  const ticket: TicketLocal = {
    expira: String(agora + 60_000),
    lote: 'l1',
    max_bytes: String(FOTO_MAX_BYTES),
    mime: 'image/jpeg',
    public_id: 'arroba/lotes/l1/foto_abc',
    tipo: 'foto',
  };
  const campos = { ...ticket, signature: assinarTicket(ticket, SEGREDO) };

  it('aceita o ticket assinado e dentro da validade', () => {
    expect(conferirTicket(campos, SEGREDO, agora)).toEqual({
      tipo: 'foto',
      maxBytes: FOTO_MAX_BYTES,
      publicId: 'arroba/lotes/l1/foto_abc',
    });
  });

  it('recusa campo alterado, faltando ou assinado com outro segredo', () => {
    const invalido = { mensagem: 'Envio inválido. Tente de novo.' };
    for (const alterado of [
      { ...campos, max_bytes: String(FOTO_MAX_BYTES * 10) },
      { ...campos, public_id: 'arroba/lotes/l2/foto_abc' },
      { ...campos, tipo: 'video' },
      { ...campos, signature: undefined },
      { ...campos, mime: undefined },
      { ...ticket, signature: assinarTicket(ticket, 'outro-segredo-qualquer') },
    ]) {
      expect(() => conferirTicket(alterado, SEGREDO, agora)).toThrow(
        expect.objectContaining({ response: invalido }),
      );
    }
  });

  it('recusa ticket vencido', () => {
    expect(() => conferirTicket(campos, SEGREDO, agora + 60_001)).toThrow(
      expect.objectContaining({ response: { mensagem: 'O tempo para enviar este arquivo acabou. Tente de novo.' } }),
    );
  });

  it('recusa public_id fora da pasta do lote, mesmo assinado', () => {
    const fora = { ...ticket, public_id: 'arroba/lotes/l2/foto_abc' };
    expect(() => conferirTicket({ ...fora, signature: assinarTicket(fora, SEGREDO) }, SEGREDO, agora)).toThrow();
  });
});

describe('caminhoNaPasta', () => {
  const pasta = path.resolve('/srv/uploads');

  it('aceita caminhos dentro da pasta', () => {
    expect(caminhoNaPasta(pasta, ['arroba', 'lotes', 'l1', 'foto_1.jpg'])).toBe(
      path.join(pasta, 'arroba', 'lotes', 'l1', 'foto_1.jpg'),
    );
  });

  it('não sai da pasta nem mostra arquivos ocultos', () => {
    for (const partes of [
      ['..', 'segredo.txt'],
      ['arroba', '..', '..', 'segredo.txt'],
      ['../segredo.txt'],
      ['a/../../segredo.txt'],
      ['..\\segredo.txt'],
      ['.envios', 'x'],
      ['.env'],
      ['/etc/passwd'],
      ['%2e%2e'],
      [''],
      [],
    ]) {
      expect(caminhoNaPasta(pasta, partes)).toBeNull();
    }
  });
});

describe('leitura dos arquivos', () => {
  it('descobre o formato pelo conteúdo', () => {
    expect(detectarFormato(png(1, 1))).toBe('png');
    expect(detectarFormato(jpg(1, 1))).toBe('jpg');
    expect(detectarFormato(mp4(1))).toBe('mp4');
    expect(detectarFormato(mp4(1, { mov: true }))).toBe('mov');
    expect(detectarFormato(Buffer.from('RIFF\0\0\0\0WEBPVP8X'))).toBe('webp');
    expect(detectarFormato(Buffer.from('\0\0\0\x18ftypheic\0\0\0\0'))).toBe('heic');
    expect(detectarFormato(Buffer.from('\0\0\0\x18ftypavif\0\0\0\0'))).toBeNull();
    expect(detectarFormato(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectarFormato(Buffer.from('curto'))).toBeNull();
  });

  it('lê largura e altura de PNG, JPG e WEBP', () => {
    expect(dimensoesImagem('png', png(1280, 960))).toEqual({ largura: 1280, altura: 960 });
    expect(dimensoesImagem('jpg', jpg(4032, 3024))).toEqual({ largura: 4032, altura: 3024 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'latin1');
    webp.write('WEBPVP8X', 8, 'latin1');
    webp.writeUIntLE(799, 24, 3);
    webp.writeUIntLE(599, 27, 3);
    expect(dimensoesImagem('webp', webp)).toEqual({ largura: 800, altura: 600 });
    expect(dimensoesImagem('jpg', jpg(10, 10).subarray(0, 12))).toEqual({ largura: null, altura: null });
    expect(dimensoesImagem('heic', Buffer.alloc(40))).toEqual({ largura: null, altura: null });
  });

  it('lê a duração do vídeo, inclusive com o índice no fim e mvhd versão 1', async () => {
    for (const [arquivo, segundos] of [
      [mp4(30), 30],
      [mp4(61.5, { moovNoFim: true }), 61.5],
      [mp4(90, { versao1: true, mov: true }), 90],
    ] as const) {
      expect(await duracaoVideo(lerDeBuffer(arquivo), arquivo.length)).toBe(segundos);
    }
    const semIndice = mp4(30).subarray(0, 20);
    expect(await duracaoVideo(lerDeBuffer(semIndice), semIndice.length)).toBeNull();
  });

  it('gera a capa de vídeo do modo local como PNG 600x450', () => {
    const capa = capaVideoPng();
    expect(detectarFormato(capa)).toBe('png');
    expect(dimensoesImagem('png', capa)).toEqual({ largura: 600, altura: 450 });
  });
});

describe('problemaNoArquivo', () => {
  const dados = { bytes: 1000, largura: 10, altura: 10, duracaoSeg: null, formato: 'jpg', url: '' };

  it('aplica formato, tamanho e duração', () => {
    expect(problemaNoArquivo('foto', dados)).toBeNull();
    expect(problemaNoArquivo('foto', { ...dados, bytes: FOTO_MAX_BYTES + 1 })).toBe(
      'A foto passa de 15 MB. Escolha outra foto.',
    );
    expect(problemaNoArquivo('foto', { ...dados, formato: 'gif' })).toMatch(/não é uma foto/);
    const video = { ...dados, formato: 'mp4', duracaoSeg: 62 };
    expect(problemaNoArquivo('video', video)).toBeNull();
    expect(problemaNoArquivo('video', { ...video, duracaoSeg: 62.4 })).toBe(
      'O vídeo passa de 1 minuto. Grave um vídeo mais curto, de até 1 minuto.',
    );
    expect(problemaNoArquivo('video', { ...video, formato: 'png' })).toMatch(/não é um vídeo/);
  });
});

describe('ArmazenamentoLocal', () => {
  let pasta: string;
  let local: ArmazenamentoLocal;

  beforeAll(async () => {
    pasta = await mkdtemp(path.join(os.tmpdir(), 'arroba-local-'));
    local = new ArmazenamentoLocal({ pasta, urlPublica: 'http://api.teste', segredo: SEGREDO });
  });

  afterAll(() => rm(pasta, { recursive: true, force: true }));

  it('prepara o envio para POST /midias/local com o ticket assinado', () => {
    const expiraEm = new Date(Date.now() + 60_000);
    const envio = local.prepararEnvio({
      loteId: 'l1',
      tipo: 'video',
      mime: 'video/mp4',
      publicId: 'arroba/lotes/l1/video_abc',
      expiraEm,
    });
    expect(envio).toMatchObject({ url: 'http://api.teste/midias/local', campoArquivo: 'file', expiraEm: expiraEm.toISOString() });
    expect(conferirTicket(envio.campos, SEGREDO)).toMatchObject({ tipo: 'video', publicId: 'arroba/lotes/l1/video_abc' });
  });

  it('assina a resposta do envio como o Cloudinary', () => {
    const resposta = local.respostaEnvio({
      tipo: 'foto',
      publicId: 'arroba/lotes/l1/foto_abc',
      formato: 'jpg',
      bytes: 10,
      versao: 1712345678,
    });
    expect(resposta).toMatchObject({
      public_id: 'arroba/lotes/l1/foto_abc',
      version: 1712345678,
      secure_url: 'http://api.teste/arquivos/arroba/lotes/l1/foto_abc.jpg',
      resource_type: 'image',
    });
    expect(local.assinaturaValida(resposta.public_id, resposta.version, resposta.signature)).toBe(true);
    expect(local.assinaturaValida(resposta.public_id, resposta.version + 1, resposta.signature)).toBe(false);
  });

  it('monta as URLs com o endereço público atual', () => {
    const guardada = { publicId: 'arroba/lotes/l1/foto_abc', versao: 1, url: 'http://antigo:3333/arquivos/arroba/lotes/l1/foto_abc.png' };
    expect(local.urls({ ...guardada, tipo: 'foto' })).toEqual({
      url: 'http://api.teste/arquivos/arroba/lotes/l1/foto_abc.png',
      miniatura: 'http://api.teste/arquivos/arroba/lotes/l1/foto_abc.png',
    });
    expect(local.urls({ ...guardada, tipo: 'video', url: 'x/video.mp4' }).miniatura).toBe(
      'http://api.teste/midias/local/capa-video.png',
    );
  });

  it('não acha arquivo que não existe', async () => {
    expect(await local.buscarDados('foto', 'arroba/lotes/l1/foto_nada')).toBeNull();
    await expect(local.apagar('foto', 'arroba/lotes/l1/foto_nada')).resolves.toBeUndefined();
  });
});

describe('ErroEnvioLocalFilter', () => {
  function responder(erro: unknown) {
    const res = {
      headersSent: false,
      codigo: 0,
      corpo: undefined as unknown,
      status(c: number) {
        this.codigo = c;
        return this;
      },
      json(b: unknown) {
        this.corpo = b;
        return this;
      },
    };
    const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
    new ErroEnvioLocalFilter().catch(erro, host);
    return { status: res.codigo, corpo: res.corpo };
  }

  it('responde os erros do multer em português, sempre com {mensagem}', () => {
    expect(responder(new PayloadTooLargeException('File too large'))).toEqual({
      status: 400,
      corpo: { mensagem: 'O arquivo passa do tamanho permitido.' },
    });
    expect(responder(new BadRequestException('Unexpected field - foto'))).toEqual({
      status: 400,
      corpo: { mensagem: 'Envio inválido. Tente de novo.' },
    });
    expect(responder(new Error('Request aborted'))).toEqual({
      status: 400,
      corpo: { mensagem: 'Envio inválido. Tente de novo.' },
    });
    expect(responder(new NotFoundException({ mensagem: 'Não encontrado.' }))).toEqual({
      status: 404,
      corpo: { mensagem: 'Não encontrado.' },
    });
  });
});
