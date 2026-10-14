import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { FOTO_MAX_BYTES, type EnvioMidia, type Midia, type RespostaUpload } from '@arroba/shared';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { lotes, midias } from '../db/schema.js';
import { ApoioE2e } from './apoio-e2e.teste.js';
import { mp4, png } from './arquivos-falsos.teste.js';
import { EAGER_VIDEO } from './cloudinary.js';
import { CloudinaryFalso } from './cloudinary-falso.teste.js';

const conta = { apiKey: '111222333444555', apiSecret: 'segredo-cloudinary-do-teste', cloudName: 'demo' };

// Requer Postgres com migrations e seed aplicados. O Cloudinary é um servidor falso local.
describe('Fotos e vídeo (e2e, Cloudinary falso)', () => {
  let app: INestApplication;
  let db: Db;
  let falso: CloudinaryFalso;
  const apoio = new ApoioE2e(() => app);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    falso = await new CloudinaryFalso(conta).subir();
    vi.stubEnv('MIDIA_ARMAZENAMENTO', '');
    vi.stubEnv('CLOUDINARY_URL', `cloudinary://${conta.apiKey}:${conta.apiSecret}@${conta.cloudName}`);
    vi.stubEnv('CLOUDINARY_API_BASE', falso.base);
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
    await falso.fechar();
  });

  beforeEach(() => {
    falso.falharBusca = false;
    falso.falharApagar = false;
  });

  /** Pede o ticket à API e envia direto ao Cloudinary, como o app faz. */
  async function enviar(auth: string, loteId: string, tipo: 'foto' | 'video', arquivo: Buffer) {
    const mime = tipo === 'foto' ? 'image/png' : 'video/mp4';
    const res = await http()
      .post(`/lotes/${loteId}/midias/envio`)
      .set('Authorization', auth)
      .send({ tipo, mime, tamanho: arquivo.length })
      .expect(201);
    const envio: EnvioMidia = res.body;
    const form = new FormData();
    for (const [k, v] of Object.entries(envio.campos)) form.append(k, v);
    form.append(envio.campoArquivo, new Blob([new Uint8Array(arquivo)], { type: mime }), 'arquivo');
    const enviado = await fetch(envio.url, { method: 'POST', body: form });
    expect(enviado.status).toBe(200);
    return { envio, resposta: (await enviado.json()) as RespostaUpload };
  }

  function registrar(auth: string, loteId: string, tipo: 'foto' | 'video', r: RespostaUpload) {
    return http()
      .post(`/lotes/${loteId}/midias`)
      .set('Authorization', auth)
      .send({ tipo, publicId: r.public_id, versao: r.version, assinatura: r.signature });
  }

  it('envio direto ao Cloudinary, registro com os dados de lá e URLs de entrega', async () => {
    const auth = await apoio.vendedor();
    const raca = `Nelore Cloudinary ${Date.now()}`;
    const loteId = await apoio.lote(auth, { raca });
    await db.update(lotes).set({ status: 'ativo' }).where(eq(lotes.id, loteId));

    const { envio, resposta } = await enviar(auth, loteId, 'foto', png(2000, 1500, 300));
    expect(envio.url).toBe(`${falso.base}/v1_1/demo/image/upload`);
    expect(Object.keys(envio.campos).sort()).toEqual([
      'api_key',
      'asset_folder',
      'overwrite',
      'public_id',
      'signature',
      'timestamp',
    ]);
    expect(envio.campos.public_id).toMatch(new RegExp(`^arroba/lotes/${loteId}/foto_[0-9a-f]{32}$`));
    expect(envio.campos.asset_folder).toBe(`arroba/lotes/${loteId}`);
    expect(JSON.stringify(envio)).not.toContain(conta.apiSecret);

    const foto: Midia = (await registrar(auth, loteId, 'foto', resposta).expect(201)).body;
    const v = `v${resposta.version}/${resposta.public_id}`;
    expect(foto).toEqual({
      id: expect.any(String),
      tipo: 'foto',
      url: `https://res.cloudinary.com/demo/image/upload/c_limit,w_1600,q_auto,f_auto/${v}`,
      miniatura: `https://res.cloudinary.com/demo/image/upload/c_fill,w_600,h_450,q_auto,f_auto/${v}`,
      largura: 2000,
      altura: 1500,
      duracaoSeg: null,
      ordem: 0,
    });
    const [linha] = await db.select().from(midias).where(eq(midias.id, foto.id));
    expect(linha).toMatchObject({
      armazenamento: 'cloudinary',
      versao: resposta.version,
      bytes: png(2000, 1500, 300).length,
      url: `https://res.cloudinary.com/demo/image/upload/${v}.png`,
    });

    const video = await enviar(auth, loteId, 'video', mp4(45));
    expect(video.envio.campos).toMatchObject({ eager: EAGER_VIDEO, eager_async: 'true' });
    const midiaVideo: Midia = (await registrar(auth, loteId, 'video', video.resposta).expect(201)).body;
    const vv = `v${video.resposta.version}/${video.resposta.public_id}`;
    expect(midiaVideo).toMatchObject({
      tipo: 'video',
      url: `https://res.cloudinary.com/demo/video/upload/q_auto/${vv}.mp4`,
      miniatura: `https://res.cloudinary.com/demo/video/upload/so_0,c_fill,w_600,h_450,q_auto/${vv}.jpg`,
      duracaoSeg: 45,
      ordem: 1,
    });

    const detalhe = await http().get(`/lotes/${loteId}`).expect(200);
    expect(detalhe.body.capa).toBe(foto.miniatura);
    expect(detalhe.body.midias).toEqual([foto, midiaVideo]);
    const lista = await http().get('/lotes').query({ raca }).expect(200);
    expect(lista.body.itens[0].capa).toBe(foto.miniatura);

    // Apagar chama o destroy; se o Cloudinary falhar, a mídia sai do anúncio do mesmo jeito.
    await http().delete(`/lotes/${loteId}/midias/${foto.id}`).set('Authorization', auth).expect(204);
    expect(falso.apagados).toContainEqual({ recurso: 'image', publicId: resposta.public_id });
    expect(falso.arquivos.has(resposta.public_id)).toBe(false);
    expect((await http().get('/lotes').query({ raca }).expect(200)).body.itens[0].capa).toBe(midiaVideo.miniatura);
    falso.falharApagar = true;
    await http().delete(`/lotes/${loteId}/midias/${midiaVideo.id}`).set('Authorization', auth).expect(204);
    expect(await db.$count(midias, eq(midias.loteId, loteId))).toBe(0);
  });

  it('vídeo com mais de 62 s é recusado e apagado do Cloudinary', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    const { resposta } = await enviar(auth, loteId, 'video', mp4(75));
    expect(falso.arquivos.has(resposta.public_id)).toBe(true);
    const res = await registrar(auth, loteId, 'video', resposta).expect(400);
    expect(res.body).toEqual({ mensagem: 'O vídeo passa de 1 minuto. Grave um vídeo mais curto, de até 1 minuto.' });
    expect(falso.apagados).toContainEqual({ recurso: 'video', publicId: resposta.public_id });
    expect(falso.arquivos.has(resposta.public_id)).toBe(false);
    expect(await db.$count(midias, eq(midias.loteId, loteId))).toBe(0);

    // Até 62 s passa (folga para o que o celular grava como 60 s).
    const dentro = await enviar(auth, loteId, 'video', mp4(62));
    expect((await registrar(auth, loteId, 'video', dentro.resposta).expect(201)).body.duracaoSeg).toBe(62);
  });

  it('vídeo sem duração conhecida é recusado e apagado do Cloudinary', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    // Sem índice (o Cloudinary não informa a duração) e MP4 fragmentado (duração zero no índice).
    for (const arquivo of [mp4(120, { semIndice: true }), mp4(0)]) {
      const { resposta } = await enviar(auth, loteId, 'video', arquivo);
      const res = await registrar(auth, loteId, 'video', resposta).expect(400);
      expect(res.body).toEqual({
        mensagem: 'Não deu para conferir a duração do vídeo. Grave de novo com a câmera do celular, até 1 minuto.',
      });
      expect(falso.arquivos.has(resposta.public_id)).toBe(false);
    }
    expect(await db.$count(midias, eq(midias.loteId, loteId))).toBe(0);
  });

  it('aceita o registro de um envio que terminou depois do prazo do ticket (vale a assinatura da resposta)', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    const res = await http()
      .post(`/lotes/${loteId}/midias/envio`)
      .set('Authorization', auth)
      .send({ tipo: 'video', mime: 'video/mp4', tamanho: 5000 })
      .expect(201);
    const envio: EnvioMidia = res.body;
    // Vídeo grande na internet fraca: o envio termina 40 minutos depois do ticket (o Cloudinary aceita até 1 hora).
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse(envio.expiraEm) + 25 * 60_000);
      const form = new FormData();
      for (const [k, v] of Object.entries(envio.campos)) form.append(k, v);
      form.append('file', new Blob([new Uint8Array(mp4(50))]), 'video.mp4');
      const enviado = await fetch(envio.url, { method: 'POST', body: form });
      expect(enviado.status).toBe(200);
      const resposta = (await enviado.json()) as RespostaUpload;
      expect((await registrar(auth, loteId, 'video', resposta).expect(201)).body.duracaoSeg).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('foto acima do limite, conferida pelos dados do Cloudinary, é recusada e apagada', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    // O app declarou 1000 bytes no ticket, mas o arquivo que chegou é maior que o limite.
    const res = await http()
      .post(`/lotes/${loteId}/midias/envio`)
      .set('Authorization', auth)
      .send({ tipo: 'foto', mime: 'image/png', tamanho: 1000 })
      .expect(201);
    const envio: EnvioMidia = res.body;
    const form = new FormData();
    for (const [k, v] of Object.entries(envio.campos)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(png(10, 10, FOTO_MAX_BYTES))]), 'grande.png');
    const resposta = (await (await fetch(envio.url, { method: 'POST', body: form })).json()) as RespostaUpload;
    const recusada = await registrar(auth, loteId, 'foto', resposta).expect(400);
    expect(recusada.body).toEqual({ mensagem: 'A foto passa de 10 MB. Escolha outra foto.' });
    expect(falso.apagados).toContainEqual({ recurso: 'image', publicId: resposta.public_id });
  });

  it('recusa resposta forjada e responde 503 se não der para conferir no Cloudinary', async () => {
    const auth = await apoio.vendedor();
    const loteId = await apoio.lote(auth);
    const { resposta } = await enviar(auth, loteId, 'foto', png(10, 10));
    const forjada = await registrar(auth, loteId, 'foto', { ...resposta, signature: 'f'.repeat(40) }).expect(400);
    expect(forjada.body).toEqual({ mensagem: 'Envio inválido. Tente de novo.' });

    falso.falharBusca = true;
    const fora = await registrar(auth, loteId, 'foto', resposta).expect(503);
    expect(fora.body).toEqual({ mensagem: 'Não foi possível conferir o arquivo agora. Tente de novo em instantes.' });
    expect(await db.$count(midias, eq(midias.loteId, loteId))).toBe(0);
    expect(falso.arquivos.has(resposta.public_id)).toBe(true);

    falso.falharBusca = false;
    await registrar(auth, loteId, 'foto', resposta).expect(201);
  });
});
