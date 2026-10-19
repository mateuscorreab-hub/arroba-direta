import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { MIN_FOTOS_PUBLICAR, type EstadoMidias, type Lote } from '@arroba/shared';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { lotes, usuarios } from '../db/schema.js';
import { ApoioE2e, adicionarLocal, esperarBloqueados } from '../midias/apoio-e2e.teste.js';
import { mp4, png } from '../midias/arquivos-falsos.teste.js';

const DESLIGADO = 'O envio de fotos e vídeos ainda não está ligado nesta versão.';

async function subir(env: Record<string, string>): Promise<INestApplication> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  try {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = mod.createNestApplication();
    await app.init();
    return app;
  } finally {
    vi.unstubAllEnvs();
  }
}

// Requer Postgres com migrations e seed aplicados. Sobe a API com o envio local (pasta temporária) e desligado.
describe('Rascunho e publicar o anúncio (e2e)', () => {
  let app: INestApplication;
  let desligado: INestApplication;
  let automatica: INestApplication;
  let db: Db;
  let pasta: string;
  const apoio = new ApoioE2e(() => app);

  beforeAll(async () => {
    pasta = await mkdtemp(path.join(os.tmpdir(), 'arroba-publicar-'));
    app = await subir({
      MIDIA_ARMAZENAMENTO: 'local',
      MIDIA_PASTA_LOCAL: pasta,
      API_URL_PUBLICA: 'http://api.teste:3333',
      MIDIA_SEGREDO_LOCAL: 'segredo-dos-testes-de-publicar-0123456789',
    });
    desligado = await subir({ MIDIA_ARMAZENAMENTO: 'desligado' });
    automatica = await subir({ MIDIA_ARMAZENAMENTO: 'desligado', APROVACAO_LOTES: 'automatica' });
    db = app.get(DB);
  });

  afterAll(async () => {
    await apoio.limpar(db);
    await app.close();
    await desligado.close();
    await automatica.close();
    await rm(pasta, { recursive: true, force: true });
  });

  async function rascunho(auth: string, extra: Record<string, unknown> = {}): Promise<Lote> {
    return (await apoio.criarLote(auth, extra, { rascunho: '1' }).expect(201)).body;
  }

  function publicar(auth: string | null, loteId: string, servidor = app) {
    const req = request(servidor.getHttpServer()).post(`/lotes/${loteId}/publicar`);
    return auth ? req.set('Authorization', auth) : req;
  }

  async function adicionarFotos(auth: string, loteId: string, quantas: number) {
    for (let i = 0; i < quantas; i++) await adicionarLocal(app, auth, loteId, png(40 + i, 30));
  }

  const statusDe = async (loteId: string) =>
    (await request(app.getHttpServer()).get(`/lotes/${loteId}`).expect(200)).body.status;

  it('POST /lotes?rascunho=1 cria o lote em rascunho, fora da busca; sem o parâmetro continua em análise', async () => {
    const auth = await apoio.vendedor();
    const raca = `Nelore Rascunho ${Date.now()}`;

    const lote = await rascunho(auth, { raca });
    expect(lote).toMatchObject({ status: 'rascunho', raca, capa: null, midias: [] });
    const comTrue = await apoio.criarLote(auth, { raca }, { rascunho: 'true' }).expect(201);
    expect(comTrue.body.status).toBe('rascunho');
    expect(await statusDe(lote.id)).toBe('rascunho');
    // Com a mesma raça, o lote ativo aparece na busca e o rascunho não.
    await db.update(lotes).set({ status: 'ativo' }).where(eq(lotes.id, comTrue.body.id));
    const busca = await request(app.getHttpServer()).get('/lotes').query({ raca }).expect(200);
    expect(busca.body.itens.map((l: Lote) => l.id)).toEqual([comTrue.body.id]);

    const normal = await apoio.criarLote(auth, { raca }).expect(201);
    expect(normal.body.status).toBe('em_analise');
  });

  it('recusa outro valor no parâmetro rascunho sem criar o lote', async () => {
    const auth = await apoio.vendedor();
    const eu = await request(app.getHttpServer()).get('/eu').set('Authorization', auth).expect(200);
    for (const valor of ['0', 'false', 'sim', '', ['1', '1']]) {
      const res = await apoio.criarLote(auth, {}, { rascunho: valor }).expect(400);
      expect(res.body).toEqual({
        mensagem: 'Dados inválidos',
        erros: [{ campo: 'rascunho', mensagem: 'Use rascunho=1 para criar o anúncio como rascunho' }],
      });
    }
    expect(await db.$count(lotes, eq(lotes.vendedorId, eu.body.id))).toBe(0);
  });

  it.runIf(MIN_FOTOS_PUBLICAR > 0)('com o envio ligado, não publica sem foto (o vídeo não conta)', async () => {
    const auth = await apoio.vendedor();
    const lote = await rascunho(auth);
    await adicionarFotos(auth, lote.id, MIN_FOTOS_PUBLICAR - 1);
    await adicionarLocal(app, auth, lote.id, mp4(10), 'video');

    const res = await publicar(auth, lote.id).expect(400);
    expect(res.body).toEqual({ mensagem: 'Coloque pelo menos uma foto do lote antes de publicar.' });
    expect(await statusDe(lote.id)).toBe('rascunho');
  });

  it('com a foto, publica para análise; repetir o pedido responde igual', async () => {
    const auth = await apoio.vendedor();
    const lote = await rascunho(auth);
    await adicionarFotos(auth, lote.id, MIN_FOTOS_PUBLICAR);

    const primeiro = await publicar(auth, lote.id).expect(200);
    expect(primeiro.body).toMatchObject({ id: lote.id, status: 'em_analise' });
    expect(primeiro.body.midias).toHaveLength(MIN_FOTOS_PUBLICAR);
    const repetido = await publicar(auth, lote.id).expect(200);
    expect(repetido.body).toEqual(primeiro.body);

    // Dois pedidos juntos (o app repetiu depois de perder a conexão).
    const outro = await rascunho(auth);
    await adicionarFotos(auth, outro.id, MIN_FOTOS_PUBLICAR);
    const juntos = await Promise.all([publicar(auth, outro.id), publicar(auth, outro.id)]);
    expect(juntos.map((r) => [r.status, r.body.status])).toEqual([
      [200, 'em_analise'],
      [200, 'em_analise'],
    ]);
  });

  it('lote fora do rascunho volta como está, mesmo sem foto', async () => {
    const auth = await apoio.vendedor();
    const emAnalise = await apoio.lote(auth);
    expect((await publicar(auth, emAnalise).expect(200)).body).toMatchObject({ status: 'em_analise', midias: [] });

    const ativo = await rascunho(auth);
    await db.update(lotes).set({ status: 'ativo' }).where(eq(lotes.id, ativo.id));
    expect((await publicar(auth, ativo.id).expect(200)).body.status).toBe('ativo');
  });

  it('lote que sai do rascunho no meio do pedido não volta para análise', async () => {
    const auth = await apoio.vendedor();
    const lote = await rascunho(auth);
    await adicionarFotos(auth, lote.id, MIN_FOTOS_PUBLICAR);
    // Uma transação de fora segura o lote até o pedido já ter conferido o rascunho e as fotos.
    const trava = new pg.Client({
      connectionString: process.env.DATABASE_URL ?? 'postgres://arroba:arroba@localhost:5432/arroba_direta',
    });
    await trava.connect();
    try {
      await trava.query('begin');
      await trava.query('select id from lotes where id = $1 for update', [lote.id]);
      const pedido = publicar(auth, lote.id).then((r) => r);
      await esperarBloqueados(trava, 1);
      await trava.query("update lotes set status = 'ativo' where id = $1", [lote.id]);
      await trava.query('commit');
      const res = await pedido;
      expect([res.status, res.body.status]).toEqual([200, 'ativo']);
    } finally {
      await trava.end();
    }
  });

  it('só o vendedor publica; exige login e perfil completo', async () => {
    const dono = await apoio.vendedor();
    const outro = await apoio.vendedor();
    const lote = await rascunho(dono);
    await adicionarFotos(dono, lote.id, MIN_FOTOS_PUBLICAR);

    const proibido = await publicar(outro, lote.id).expect(403);
    expect(proibido.body).toEqual({ mensagem: 'Só o vendedor do lote pode publicar o anúncio.' });
    const semLogin = await publicar(null, lote.id).expect(401);
    expect(semLogin.body).toEqual({ mensagem: 'Faça login para continuar.' });
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nao-e-um-id']) {
      expect((await publicar(dono, id).expect(404)).body).toEqual({ mensagem: 'Lote não encontrado' });
    }

    const eu = await request(app.getHttpServer()).get('/eu').set('Authorization', dono).expect(200);
    await db.update(usuarios).set({ municipio: null }).where(eq(usuarios.id, eu.body.id));
    const incompleto = await publicar(dono, lote.id).expect(403);
    expect(incompleto.body).toEqual({ mensagem: 'Complete seu perfil (nome, município e estado) antes de anunciar.' });
    expect(await statusDe(lote.id)).toBe('rascunho');
  });

  it('com o envio desligado, publica sem foto', async () => {
    const auth = await apoio.vendedor();
    const lote = await rascunho(auth);
    const res = await publicar(auth, lote.id, desligado).expect(200);
    expect(res.body).toMatchObject({ id: lote.id, status: 'em_analise', capa: null, midias: [] });
  });

  it('com APROVACAO_LOTES=automatica, o rascunho publicado já entra na busca', async () => {
    const auth = await apoio.vendedor();
    const raca = `Nelore Automatica ${Date.now()}`;
    const lote = await rascunho(auth, { raca });
    const res = await publicar(auth, lote.id, automatica).expect(200);
    expect(res.body).toMatchObject({ id: lote.id, status: 'ativo' });
    const busca = await request(automatica.getHttpServer()).get('/lotes').query({ raca }).expect(200);
    expect(busca.body.itens.map((l: Lote) => l.id)).toEqual([lote.id]);
  });

  it('GET /midias/estado diz, sem login, se o envio está ligado', async () => {
    const ligado = await request(app.getHttpServer()).get('/midias/estado').expect(200);
    expect(ligado.body).toEqual({ ligado: true, mensagem: null } satisfies EstadoMidias);

    const res = await request(desligado.getHttpServer()).get('/midias/estado').expect(200);
    expect(res.body).toEqual({ ligado: false, mensagem: DESLIGADO } satisfies EstadoMidias);
    // A mesma mensagem do 503 das rotas de envio.
    const auth = await apoio.vendedor();
    const lote = await rascunho(auth);
    const envio = await request(desligado.getHttpServer())
      .post(`/lotes/${lote.id}/midias/envio`)
      .set('Authorization', auth)
      .send({ tipo: 'foto', mime: 'image/jpeg', tamanho: 1000 })
      .expect(503);
    expect(envio.body).toEqual({ mensagem: res.body.mensagem });
  });
});
