import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { FOTO_MAX_BYTES, type EnvioMidia, type Midia } from '@arroba/shared';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { lotes, midias } from '../db/schema.js';
import { ApoioE2e, enviarLocal } from './apoio-e2e.teste.js';
import { jpg, mp4, png } from './arquivos-falsos.teste.js';
import { assinarTicket } from './local.js';

const SEGREDO = 'segredo-dos-testes-de-midia-0123456789';
const URL_PUBLICA = 'http://api.teste:3333';
const SEGREDO_FORA = 'CONTEUDO-QUE-NAO-PODE-SAIR';

// Requer Postgres com migrations e seed aplicados. Sobe a API em modo local com uma pasta temporária.
describe('Fotos e vídeo (e2e, armazenamento local)', () => {
  let app: INestApplication;
  let db: Db;
  let raiz: string;
  let pasta: string;
  const apoio = new ApoioE2e(() => app);
  const http_ = () => request(app.getHttpServer());

  beforeAll(async () => {
    raiz = await mkdtemp(path.join(os.tmpdir(), 'arroba-midias-'));
    pasta = path.join(raiz, 'uploads');
    await writeFile(path.join(raiz, 'segredo.txt'), SEGREDO_FORA);
    vi.stubEnv('MIDIA_ARMAZENAMENTO', 'local');
    vi.stubEnv('MIDIA_PASTA_LOCAL', pasta);
    vi.stubEnv('API_URL_PUBLICA', URL_PUBLICA);
    vi.stubEnv('MIDIA_SEGREDO_LOCAL', SEGREDO);
    try {
      const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = mod.createNestApplication();
      await app.init();
    } finally {
      vi.unstubAllEnvs();
    }
    db = app.get(DB);
  });

  afterAll(async () => {
    await apoio.limpar(db);
    await app.close();
    await rm(raiz, { recursive: true, force: true });
  });

  function pedirEnvio(auth: string, loteId: string, tipo: 'foto' | 'video', mime: string, tamanho = 1000) {
    return http_().post(`/lotes/${loteId}/midias/envio`).set('Authorization', auth).send({ tipo, mime, tamanho });
  }

  function registrar(auth: string, loteId: string, corpo: Record<string, unknown>) {
    return http_().post(`/lotes/${loteId}/midias`).set('Authorization', auth).send(corpo);
  }

  /** Ticket, envio e registro. Devolve a mídia e a resposta do envio. */
  async function adicionar(auth: string, loteId: string, arquivo = png(800, 600), tipo: 'foto' | 'video' = 'foto') {
    const mime = tipo === 'foto' ? 'image/png' : 'video/mp4';
    const envio: EnvioMidia = (await pedirEnvio(auth, loteId, tipo, mime, arquivo.length).expect(201)).body;
    const enviado = await enviarLocal(app, envio, arquivo, tipo === 'foto' ? 'foto.png' : 'video.mp4', mime).expect(200);
    const { public_id, version, signature } = enviado.body;
    const res = await registrar(auth, loteId, { tipo, publicId: public_id, versao: version, assinatura: signature }).expect(201);
    return { midia: res.body as Midia, enviado: enviado.body };
  }

  const arquivoDe = (url: string) => path.join(pasta, ...new URL(url).pathname.replace('/arquivos/', '').split('/'));

  it('fluxo completo: ticket, envio, registro, lote com capa, ordem e apagar', async () => {
    const auth = await apoio.vendedor();
    const raca = `Nelore Fotos ${Date.now()}`;
    const loteId = await apoio.lote(auth, { raca });
    await db.update(lotes).set({ status: 'ativo' }).where(eq(lotes.id, loteId));

    const ticket = await pedirEnvio(auth, loteId, 'foto', 'image/jpg', 5000).expect(201);
    const envio: EnvioMidia = ticket.body;
    expect(envio.url).toBe(`${URL_PUBLICA}/midias/local`);
    expect(envio.campoArquivo).toBe('file');
    expect(envio.campos).toMatchObject({ lote: loteId, tipo: 'foto', mime: 'image/jpeg', max_bytes: String(FOTO_MAX_BYTES) });
    expect(envio.campos.public_id).toMatch(new RegExp(`^arroba/lotes/${loteId}/foto_[0-9a-f]{32}$`));
    expect(JSON.stringify(envio)).not.toContain(SEGREDO);
    const minutos = (Date.parse(envio.expiraEm) - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(14.5);
    expect(minutos).toBeLessThanOrEqual(15);

    const arquivo1 = png(800, 600, 2000);
    const enviado = await enviarLocal(app, envio, arquivo1, 'IMG_0001.PNG', 'image/png').expect(200);
    expect(enviado.body).toEqual({
      public_id: envio.campos.public_id,
      version: expect.any(Number),
      signature: expect.stringMatching(/^[0-9a-f]{64}$/),
      secure_url: `${URL_PUBLICA}/arquivos/${envio.campos.public_id}.png`,
      bytes: arquivo1.length,
      resource_type: 'image',
      format: 'png',
    });
    expect(existsSync(arquivoDe(enviado.body.secure_url))).toBe(true);

    const r1 = await registrar(auth, loteId, {
      tipo: 'foto',
      publicId: enviado.body.public_id,
      versao: enviado.body.version,
      assinatura: enviado.body.signature,
    }).expect(201);
    const foto1: Midia = r1.body;
    expect(foto1).toEqual({
      id: expect.any(String),
      tipo: 'foto',
      url: enviado.body.secure_url,
      miniatura: enviado.body.secure_url,
      largura: 800,
      altura: 600,
      duracaoSeg: null,
      ordem: 0,
    });

    const { midia: foto2 } = await adicionar(auth, loteId, jpg(1600, 1200));
    expect(foto2).toMatchObject({ ordem: 1, largura: 1600, altura: 1200 });
    expect(foto2.url).toMatch(/\.jpg$/);
    const { midia: video } = await adicionar(auth, loteId, mp4(30), 'video');
    expect(video).toMatchObject({ tipo: 'video', ordem: 2, duracaoSeg: 30, miniatura: `${URL_PUBLICA}/midias/local/capa-video.png` });
    expect(video.url).toMatch(/\.mp4$/);

    const servido = await http_().get(new URL(foto1.url).pathname).expect(200);
    expect(servido.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(servido.body, arquivo1)).toBe(0);
    const capaVideo = await http_().get('/midias/local/capa-video.png').expect(200);
    expect(capaVideo.headers['content-type']).toBe('image/png');

    const detalhe = await http_().get(`/lotes/${loteId}`).expect(200);
    expect(detalhe.body.capa).toBe(foto1.miniatura);
    expect(detalhe.body.midias.map((m: Midia) => m.id)).toEqual([foto1.id, foto2.id, video.id]);

    const lista = await http_().get('/lotes').query({ raca }).expect(200);
    expect(lista.body.itens).toHaveLength(1);
    expect(lista.body.itens[0].capa).toBe(foto1.miniatura);
    expect(lista.body.itens[0]).not.toHaveProperty('midias');

    // O vídeo em primeiro lugar não vira capa: a capa é a primeira foto.
    const ordem = await http_()
      .patch(`/lotes/${loteId}/midias/ordem`)
      .set('Authorization', auth)
      .send({ ids: [video.id, foto2.id, foto1.id] })
      .expect(200);
    expect(ordem.body.map((m: Midia) => [m.id, m.ordem])).toEqual([
      [video.id, 0],
      [foto2.id, 1],
      [foto1.id, 2],
    ]);
    expect((await http_().get(`/lotes/${loteId}`).expect(200)).body.capa).toBe(foto2.miniatura);
    expect((await http_().get('/lotes').query({ raca }).expect(200)).body.itens[0].capa).toBe(foto2.miniatura);

    const incompleta = await http_()
      .patch(`/lotes/${loteId}/midias/ordem`)
      .set('Authorization', auth)
      .send({ ids: [video.id, foto2.id] })
      .expect(400);
    expect(incompleta.body).toEqual({ mensagem: 'A ordem precisa ter todas as fotos e o vídeo do lote, cada um uma vez.' });

    await http_().delete(`/lotes/${loteId}/midias/${foto2.id}`).set('Authorization', auth).expect(204);
    expect(existsSync(arquivoDe(foto2.url))).toBe(false);
    await http_().get(new URL(foto2.url).pathname).expect(404);
    const depois = await http_().get(`/lotes/${loteId}`).expect(200);
    expect(depois.body.capa).toBe(foto1.miniatura);
    expect(depois.body.midias.map((m: Midia) => m.id)).toEqual([video.id, foto1.id]);

    // Só o vídeo: ele vira a capa.
    await http_().delete(`/lotes/${loteId}/midias/${foto1.id}`).set('Authorization', auth).expect(204);
    expect((await http_().get('/lotes').query({ raca }).expect(200)).body.itens[0].capa).toBe(video.miniatura);
    await http_().delete(`/lotes/${loteId}/midias/${video.id}`).set('Authorization', auth).expect(204);
    const vazio = await http_().get(`/lotes/${loteId}`).expect(200);
    expect(vazio.body).toMatchObject({ capa: null, midias: [] });

    const nada = await http_().delete(`/lotes/${loteId}/midias/${video.id}`).set('Authorization', auth).expect(404);
    expect(nada.body).toEqual({ mensagem: 'Foto ou vídeo não encontrado.' });
    await http_().delete(`/lotes/${loteId}/midias/nao-e-id`).set('Authorization', auth).expect(404);
  });

  it('limite de 10 fotos e 1 vídeo, inclusive com registros simultâneos', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    for (let i = 0; i < 8; i++) await adicionar(auth, loteId, png(100 + i, 100));

    // Dois envios autorizados quando havia 8; o 10º e o 11º chegam juntos.
    const enviados = [];
    for (let i = 0; i < 3; i++) {
      const envio: EnvioMidia = (await pedirEnvio(auth, loteId, 'foto', 'image/png').expect(201)).body;
      enviados.push((await enviarLocal(app, envio, png(300 + i, 200), 'f.png', 'image/png').expect(200)).body);
    }
    await registrar(auth, loteId, {
      tipo: 'foto',
      publicId: enviados[0].public_id,
      versao: enviados[0].version,
      assinatura: enviados[0].signature,
    }).expect(201);
    // Uma transação de fora segura os INSERTs em midias até os dois registros terem contado as fotos.
    const trava = new pg.Client({
      connectionString: process.env.DATABASE_URL ?? 'postgres://arroba:arroba@localhost:5432/arroba_direta',
    });
    await trava.connect();
    let respostas: request.Response[];
    try {
      await trava.query('begin');
      await trava.query('lock table midias in share row exclusive mode');
      const pendentes = Promise.all(
        enviados.slice(1).map((e) =>
          registrar(auth, loteId, { tipo: 'foto', publicId: e.public_id, versao: e.version, assinatura: e.signature }),
        ),
      );
      await esperarBloqueados(trava, 2);
      await trava.query('commit');
      respostas = await pendentes;
    } finally {
      await trava.end();
    }
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
    const recusada = respostas.find((r) => r.status === 409)!;
    expect(recusada.body).toEqual({ mensagem: 'Este lote já tem 10 fotos.' });
    // O arquivo recusado sai do armazenamento.
    const naoEntrou = enviados[1 + respostas.indexOf(recusada)];
    expect(existsSync(arquivoDe(naoEntrou.secure_url))).toBe(false);
    expect(await db.$count(midias, eq(midias.loteId, loteId))).toBe(10);

    const decima = await pedirEnvio(auth, loteId, 'foto', 'image/png').expect(409);
    expect(decima.body).toEqual({ mensagem: 'Este lote já tem 10 fotos.' });

    await adicionar(auth, loteId, mp4(20), 'video');
    const segundoVideo = await pedirEnvio(auth, loteId, 'video', 'video/mp4').expect(409);
    expect(segundoVideo.body).toEqual({ mensagem: 'Este lote já tem um vídeo. Apague o atual para enviar outro.' });
  });

  it('registrar o mesmo envio de novo não duplica', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    const { midia, enviado } = await adicionar(auth, loteId);
    const corpo = { tipo: 'foto', publicId: enviado.public_id, versao: enviado.version, assinatura: enviado.signature };
    const repetido = await registrar(auth, loteId, corpo).expect(201);
    expect(repetido.body).toEqual(midia);
    const juntos = await Promise.all([registrar(auth, loteId, corpo), registrar(auth, loteId, corpo)]);
    expect(juntos.map((r) => r.body.id)).toEqual([midia.id, midia.id]);

    // Enviar de novo com o mesmo ticket não troca o arquivo já conferido.
    const envio: EnvioMidia = (await pedirEnvio(auth, loteId, 'foto', 'image/png').expect(201)).body;
    const primeiro = await enviarLocal(app, envio, png(10, 10), 'a.png', 'image/png').expect(200);
    const segundo = await enviarLocal(app, envio, png(20, 20, 50), 'b.png', 'image/png').expect(200);
    expect(segundo.body).toEqual(primeiro.body);
    expect(await db.$count(midias, eq(midias.loteId, loteId))).toBe(1);
  });

  it('recusa tipo de arquivo e tamanho fora do limite', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);

    const mime = await pedirEnvio(auth, loteId, 'foto', 'video/mp4').expect(400);
    expect(mime.body.mensagem).toBe('Dados inválidos');
    expect(mime.body.erros).toEqual([{ campo: 'mime', mensagem: 'A foto precisa ser JPG, PNG, WEBP ou HEIC' }]);
    const grande = await pedirEnvio(auth, loteId, 'foto', 'image/jpeg', FOTO_MAX_BYTES + 1).expect(400);
    expect(grande.body.erros).toEqual([{ campo: 'tamanho', mensagem: 'A foto passa de 10 MB. Escolha outra foto.' }]);

    // O app pode errar o tamanho; o envio corta no limite do tipo.
    const envio: EnvioMidia = (await pedirEnvio(auth, loteId, 'foto', 'image/png').expect(201)).body;
    const pesado = await enviarLocal(app, envio, png(10, 10, FOTO_MAX_BYTES), 'grande.png', 'image/png').expect(400);
    expect(pesado.body).toEqual({ mensagem: 'A foto passa de 10 MB. Escolha outra foto.' });

    // Conteúdo que não é foto, mesmo com o nome e o tipo de foto.
    const texto = await enviarLocal(app, envio, Buffer.from('<html>não é foto</html>'.repeat(5)), 'x.png', 'image/png').expect(400);
    expect(texto.body).toEqual({ mensagem: 'O arquivo não é uma foto. Envie JPG, PNG, WEBP ou HEIC.' });
    const videoComoFoto = await enviarLocal(app, envio, mp4(5), 'x.png', 'image/png').expect(400);
    expect(videoComoFoto.body.mensagem).toMatch(/não é uma foto/);

    const semArquivo = await request(app.getHttpServer()).post('/midias/local').field(envio.campos).expect(400);
    expect(semArquivo.body).toEqual({ mensagem: 'Envie o arquivo no campo "file".' });
    const doisArquivos = await enviarLocal(app, envio, png(1, 1), 'a.png', 'image/png').attach('file', png(1, 1), 'b.png').expect(400);
    expect(doisArquivos.body).toEqual({ mensagem: 'Envio inválido. Tente de novo.' });

    expect(await readdir(path.join(pasta, 'arroba', 'lotes', loteId)).catch(() => [])).toEqual([]);
    expect(await readdir(path.join(pasta, '.envios'))).toEqual([]);
  });

  it('vídeo com mais de 1 minuto é recusado e apagado', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    const envio: EnvioMidia = (await pedirEnvio(auth, loteId, 'video', 'video/quicktime').expect(201)).body;
    const enviado = await enviarLocal(app, envio, mp4(90, { mov: true }), 'IMG_0002.MOV', 'video/quicktime').expect(200);
    expect(existsSync(arquivoDe(enviado.body.secure_url))).toBe(true);
    const res = await registrar(auth, loteId, {
      tipo: 'video',
      publicId: enviado.body.public_id,
      versao: enviado.body.version,
      assinatura: enviado.body.signature,
    }).expect(400);
    expect(res.body).toEqual({ mensagem: 'O vídeo passa de 1 minuto. Grave um vídeo mais curto, de até 1 minuto.' });
    expect(existsSync(arquivoDe(enviado.body.secure_url))).toBe(false);

    // Sem índice (sem duração) ou MP4 fragmentado (duração zero): não dá para garantir o limite.
    for (const arquivo of [mp4(120, { semIndice: true }), mp4(0)]) {
      const outro: EnvioMidia = (await pedirEnvio(auth, loteId, 'video', 'video/mp4').expect(201)).body;
      const { body } = await enviarLocal(app, outro, arquivo, 'video.mp4', 'video/mp4').expect(200);
      const semDuracao = await registrar(auth, loteId, {
        tipo: 'video',
        publicId: body.public_id,
        versao: body.version,
        assinatura: body.signature,
      }).expect(400);
      expect(semDuracao.body).toEqual({
        mensagem: 'Não deu para conferir a duração do vídeo. Grave de novo com a câmera do celular, até 1 minuto.',
      });
      expect(existsSync(arquivoDe(body.secure_url))).toBe(false);
    }

    const { midia } = await adicionar(auth, loteId, mp4(61.9, { moovNoFim: true }), 'video');
    expect(midia.duracaoSeg).toBe(61.9);
  });

  it('o prazo do ticket vale para começar o envio; o registro depois dele é aceito', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    const envio: EnvioMidia = (await pedirEnvio(auth, loteId, 'foto', 'image/png').expect(201)).body;
    const { body: enviado } = await enviarLocal(app, envio, png(40, 30), 'a.png', 'image/png').expect(200);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse(envio.expiraEm) + 60_000);
      const corpo = { tipo: 'foto', publicId: enviado.public_id, versao: enviado.version, assinatura: enviado.signature };
      expect((await registrar(auth, loteId, corpo).expect(201)).body.largura).toBe(40);
      // Começar um envio com o ticket vencido não dá.
      const tarde = await enviarLocal(app, envio, png(5, 5), 'b.png', 'image/png').expect(400);
      expect(tarde.body).toEqual({ mensagem: 'O tempo para enviar este arquivo acabou. Tente de novo.' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('recusa assinatura forjada, publicId de outro lote, ticket alterado ou vencido', async () => {
    const auth = await apoio.vendedor();
    const loteA = await apoio.lote(auth);
    const loteB = await apoio.lote(auth);
    const envio: EnvioMidia = (await pedirEnvio(auth, loteA, 'foto', 'image/png').expect(201)).body;
    const { body: enviado } = await enviarLocal(app, envio, png(50, 50), 'a.png', 'image/png').expect(200);
    const corpo = { tipo: 'foto', publicId: enviado.public_id, versao: enviado.version, assinatura: enviado.signature };
    const invalido = { mensagem: 'Envio inválido. Tente de novo.' };

    expect((await registrar(auth, loteA, { ...corpo, assinatura: 'a'.repeat(64) }).expect(400)).body).toEqual(invalido);
    expect((await registrar(auth, loteA, { ...corpo, versao: corpo.versao + 1 }).expect(400)).body).toEqual(invalido);
    expect((await registrar(auth, loteA, { ...corpo, tipo: 'video' }).expect(400)).body).toEqual(invalido);
    expect((await registrar(auth, loteB, corpo).expect(400)).body).toEqual(invalido);
    const pastaB = await registrar(auth, loteB, { ...corpo, publicId: corpo.publicId.replace(loteA, loteB) }).expect(400);
    expect(pastaB.body).toEqual(invalido);
    const traversal = await registrar(auth, loteA, { ...corpo, publicId: `arroba/lotes/${loteA}/../${loteB}/foto_x` }).expect(400);
    expect(traversal.body.mensagem).toBe('Dados inválidos');

    // Assinatura certa de um arquivo que nunca chegou.
    const { createHmac } = await import('node:crypto');
    const fantasma = `arroba/lotes/${loteA}/foto_${'0'.repeat(32)}`;
    const assinatura = createHmac('sha256', SEGREDO).update(`public_id=${fantasma}&version=1`).digest('hex');
    const naoChegou = await registrar(auth, loteA, { tipo: 'foto', publicId: fantasma, versao: 1, assinatura }).expect(400);
    expect(naoChegou.body).toEqual({ mensagem: 'O arquivo não chegou. Tente de novo.' });

    await registrar(auth, loteA, corpo).expect(201);

    const outro: EnvioMidia = (await pedirEnvio(auth, loteA, 'foto', 'image/png').expect(201)).body;
    const alterado = { ...outro, campos: { ...outro.campos, max_bytes: String(FOTO_MAX_BYTES * 100) } };
    expect((await enviarLocal(app, alterado, png(5, 5), 'a.png', 'image/png').expect(400)).body).toEqual(invalido);
    const deVideo = { ...outro, campos: { ...outro.campos, tipo: 'video' } };
    expect((await enviarLocal(app, deVideo, mp4(5), 'a.mp4', 'video/mp4').expect(400)).body).toEqual(invalido);

    const { signature: _, ...campos } = outro.campos;
    const vencido = { ...campos, expira: String(Date.now() - 1000) } as Parameters<typeof assinarTicket>[0];
    const res = await enviarLocal(
      app,
      { ...outro, campos: { ...vencido, signature: assinarTicket(vencido, SEGREDO) } },
      png(5, 5),
      'a.png',
      'image/png',
    ).expect(400);
    expect(res.body).toEqual({ mensagem: 'O tempo para enviar este arquivo acabou. Tente de novo.' });

    // Campos depois do arquivo: o ticket não foi visto quando o arquivo começou.
    const foraDeOrdem = await request(app.getHttpServer())
      .post('/midias/local')
      .attach('file', png(5, 5), 'a.png')
      .field(outro.campos)
      .expect(400);
    expect(foraDeOrdem.body).toEqual(invalido);
  });

  it('só o vendedor muda as fotos e o vídeo do lote', async () => {
    const dono = await apoio.vendedor();
    const outro = await apoio.vendedor();
    const loteId = await apoio.lote(dono);
    const { midia, enviado } = await adicionar(dono, loteId);
    const proibido = { mensagem: 'Só o vendedor do lote pode mudar as fotos e o vídeo.' };

    expect((await pedirEnvio(outro, loteId, 'foto', 'image/png').expect(403)).body).toEqual(proibido);
    const corpo = { tipo: 'foto', publicId: enviado.public_id, versao: enviado.version, assinatura: enviado.signature };
    expect((await registrar(outro, loteId, corpo).expect(403)).body).toEqual(proibido);
    const ordem = await http_()
      .patch(`/lotes/${loteId}/midias/ordem`)
      .set('Authorization', outro)
      .send({ ids: [midia.id] })
      .expect(403);
    expect(ordem.body).toEqual(proibido);
    const apagar = await http_().delete(`/lotes/${loteId}/midias/${midia.id}`).set('Authorization', outro).expect(403);
    expect(apagar.body).toEqual(proibido);
    // Corpo inválido de quem não é o vendedor: 403 antes de validar.
    expect((await pedirEnvio(outro, loteId, 'foto', 'text/plain').expect(403)).body).toEqual(proibido);
    expect(await db.$count(midias, eq(midias.loteId, loteId))).toBe(1);

    const inexistente = await pedirEnvio(dono, '00000000-0000-4000-8000-000000000000', 'foto', 'image/png').expect(404);
    expect(inexistente.body).toEqual({ mensagem: 'Lote não encontrado' });
    expect((await pedirEnvio(dono, 'nao-e-um-id', 'foto', 'image/png').expect(404)).body).toEqual({
      mensagem: 'Lote não encontrado',
    });
  });

  it('exige login nas rotas de escrita', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    const id = '00000000-0000-4000-8000-000000000000';
    const login = { mensagem: 'Faça login para continuar.' };
    for (const req of [
      () => http_().post(`/lotes/${loteId}/midias/envio`).send({ tipo: 'foto', mime: 'image/png', tamanho: 10 }),
      () => http_().post(`/lotes/${loteId}/midias`).send({}),
      () => http_().patch(`/lotes/${loteId}/midias/ordem`).send({ ids: [id] }),
      () => http_().delete(`/lotes/${loteId}/midias/${id}`),
    ]) {
      expect((await req().expect(401)).body).toEqual(login);
    }
  });

  it('GET /arquivos não sai da pasta', async () => {
    const servidor = app.getHttpServer() as http.Server;
    const porta = await escutar(servidor);
    try {
      const pedidos = [
        '/arquivos/../segredo.txt',
        '/arquivos/../../segredo.txt',
        '/arquivos/arroba/../../segredo.txt',
        '/arquivos/..%2Fsegredo.txt',
        '/arquivos/%2e%2e/segredo.txt',
        '/arquivos/%2E%2E%2Fsegredo.txt',
        '/arquivos/..%5Csegredo.txt',
        '/arquivos/.envios',
        `/arquivos/${encodeURIComponent(path.join(raiz, 'segredo.txt'))}`,
      ];
      for (const caminho of pedidos) {
        const res = await getCru(porta, caminho);
        expect(res.corpo).not.toContain(SEGREDO_FORA);
        expect([400, 404]).toContain(res.status);
      }
    } finally {
      await new Promise((ok) => servidor.close(ok));
    }
  });

  describe('com o envio desligado', () => {
    let desligado: INestApplication;

    beforeAll(async () => {
      vi.stubEnv('MIDIA_ARMAZENAMENTO', 'desligado');
      try {
        const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
        desligado = mod.createNestApplication();
        await desligado.init();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    afterAll(() => desligado.close());

    it('responde 503 com a mensagem para o app, e /midias/local e /arquivos não existem', async () => {
      const auth = await apoio.vendedor();
      const loteId = await apoio.lote(auth);
      const servidor = desligado.getHttpServer();
      const aviso = { mensagem: 'O envio de fotos e vídeos ainda não está ligado nesta versão.' };
      const envio = await request(servidor)
        .post(`/lotes/${loteId}/midias/envio`)
        .set('Authorization', auth)
        .send({ tipo: 'foto', mime: 'image/jpeg', tamanho: 1000 })
        .expect(503);
      expect(envio.body).toEqual(aviso);
      const registro = await request(servidor)
        .post(`/lotes/${loteId}/midias`)
        .set('Authorization', auth)
        .send({ tipo: 'foto', publicId: `arroba/lotes/${loteId}/foto_1`, versao: 1, assinatura: 'a'.repeat(40) })
        .expect(503);
      expect(registro.body).toEqual(aviso);
      await request(servidor).post('/midias/local').attach('file', png(1, 1), 'a.png').expect(404);
      await request(servidor).get('/arquivos/arroba/x.png').expect(404);
      expect((await request(servidor).get(`/lotes/${loteId}`).expect(200)).body).toMatchObject({ capa: null, midias: [] });
    });
  });
});

/** Espera até n conexões deste banco estarem paradas esperando uma trava. */
async function esperarBloqueados(cliente: pg.Client, n: number) {
  for (let i = 0; i < 200; i++) {
    // Dentro de uma transação o pg_stat_activity fica congelado; limpa a cópia a cada volta.
    await cliente.query('select pg_stat_clear_snapshot()');
    const { rows } = await cliente.query(
      "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if (rows[0].n >= n) return;
    await new Promise((ok) => setTimeout(ok, 25));
  }
  throw new Error(`Os ${n} registros não chegaram à trava`);
}

/** Sobe o servidor numa porta livre entre 3400 e 3499 (para mandar "../" sem o cliente HTTP normalizar). */
async function escutar(servidor: http.Server): Promise<number> {
  const inicio = Math.floor(Math.random() * 100);
  for (let i = 0; i < 100; i++) {
    const porta = 3400 + ((inicio + i) % 100);
    const subiu = await new Promise<boolean>((ok) => {
      servidor.once('error', () => ok(false));
      servidor.listen(porta, '127.0.0.1', () => ok(true));
    });
    if (subiu) return porta;
  }
  throw new Error('Nenhuma porta livre entre 3400 e 3499');
}

function getCru(porta: number, caminho: string): Promise<{ status: number; corpo: string }> {
  return new Promise((ok, falhou) => {
    http
      .get({ host: '127.0.0.1', port: porta, path: caminho }, (res) => {
        let corpo = '';
        res.on('data', (p) => (corpo += p));
        res.on('end', () => ok({ status: res.statusCode ?? 0, corpo }));
      })
      .on('error', falhou);
  });
}
