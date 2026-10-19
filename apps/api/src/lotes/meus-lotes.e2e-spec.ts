import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { hojeEmBrasilia, type ConversaDetalhe, type Lote } from '@arroba/shared';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { lotes } from '../db/schema.js';
import { ApoioE2e, adicionarLocal } from '../midias/apoio-e2e.teste.js';

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

/** O anúncio inteiro, como o app manda no PUT. */
const corpo = (extra: Record<string, unknown> = {}) => ({
  titulo: '25 garrotes para testar as fotos',
  categoria: 'garrote',
  raca: 'Nelore',
  sexo: 'macho',
  quantidade: 25,
  unidadePreco: 'cabeca',
  preco: 3100,
  municipio: 'Dourados',
  uf: 'MS',
  lat: -22.22,
  lng: -54.8,
  ...extra,
});

function embarqueDaqui(dias: number): string {
  const d = new Date(`${hojeEmBrasilia()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const NEGOCIO_FECHADO = 'Este lote tem negócio fechado pelo app. Quando o gado for entregue, marque como vendido.';
const JA_VENDIDO = 'Este lote já foi vendido.';
const NAO_PUBLICADO = 'Este anúncio ainda não foi publicado.';
const ALTERADO = 'O vendedor alterou os dados do lote. Confira o anúncio antes de fazer uma proposta.';
const PAUSADO = 'O vendedor pausou o anúncio. Por enquanto não dá para fazer propostas por este lote.';
const DE_VOLTA = 'O anúncio voltou ao ar. Vocês já podem negociar de novo.';
const VENDIDO = 'O vendedor marcou este lote como vendido.';

// Requer Postgres com migrations e seed aplicados. O app principal aprova sozinho e tem o envio local ligado
// (reativar exige foto); o outro usa a revisão manual, sem envio.
describe('Meus anúncios: editar, pausar, reativar e vender (e2e)', () => {
  let app: INestApplication;
  let manual: INestApplication;
  let db: Db;
  let pasta: string;
  const apoio = new ApoioE2e(() => app);

  beforeAll(async () => {
    pasta = await mkdtemp(path.join(os.tmpdir(), 'arroba-meus-lotes-'));
    app = await subir({
      APROVACAO_LOTES: 'automatica',
      MIDIA_ARMAZENAMENTO: 'local',
      MIDIA_PASTA_LOCAL: pasta,
      API_URL_PUBLICA: 'http://api.teste:3333',
      MIDIA_SEGREDO_LOCAL: 'segredo-dos-testes-de-meus-lotes-0123456789',
    });
    manual = await subir({ MIDIA_ARMAZENAMENTO: 'desligado' });
    db = app.get(DB);
  });

  afterAll(async () => {
    await apoio.limpar(db);
    await app.close();
    await manual.close();
    await rm(pasta, { recursive: true, force: true });
  });

  const api = (servidor = app) => request(servidor.getHttpServer());
  const meus = (auth: string) => api().get('/eu/lotes').set('Authorization', auth);
  const editar = (auth: string, id: string, dados: Record<string, unknown>, servidor = app) =>
    api(servidor).put(`/lotes/${id}`).set('Authorization', auth).send(dados);
  const acao = (auth: string, id: string, nome: 'pausar' | 'reativar' | 'vendido', servidor = app) =>
    api(servidor).post(`/lotes/${id}/${nome}`).set('Authorization', auth);
  const statusDe = async (id: string) => (await api().get(`/lotes/${id}`).expect(200)).body.status;
  const naBusca = async (id: string, raca: string) =>
    (await api().get('/lotes').query({ raca }).expect(200)).body.itens.some((l: Lote) => l.id === id);

  async function conversaCom(comprador: string, loteId: string): Promise<string> {
    return (await api().post(`/lotes/${loteId}/conversas`).set('Authorization', comprador).expect(200)).body.id;
  }
  function propor(auth: string, conversaId: string, extra: Record<string, unknown> = {}) {
    return api()
      .post(`/conversas/${conversaId}/propostas`)
      .set('Authorization', auth)
      .send({
        preco: 2900,
        unidadePreco: 'cabeca',
        quantidade: 20,
        quebraPercentual: 0,
        fretePorConta: 'comprador',
        dataEmbarque: embarqueDaqui(7),
        ...extra,
      });
  }
  async function ver(auth: string, conversaId: string): Promise<ConversaDetalhe> {
    return (await api().get(`/conversas/${conversaId}`).set('Authorization', auth).expect(200)).body;
  }
  const avisos = (c: ConversaDetalhe) => c.mensagens.filter((m) => m.tipo === 'sistema').map((m) => m.texto);

  it('GET /eu/lotes traz só os lotes de quem fez login, em qualquer situação, do mais novo ao mais antigo', async () => {
    const vendedor = await apoio.vendedor();
    const outro = await apoio.vendedor();
    const primeiro = await apoio.lote(vendedor);
    const rascunho = (await apoio.criarLote(vendedor, {}, { rascunho: '1' }).expect(201)).body.id;
    const terceiro = await apoio.lote(vendedor);
    await db.update(lotes).set({ status: 'vendido' }).where(eq(lotes.id, primeiro));
    await apoio.lote(outro);

    const res = await meus(vendedor).expect(200);
    expect(res.body.map((l: Lote) => l.id)).toEqual([terceiro, rascunho, primeiro]);
    expect(res.body.map((l: Lote) => l.status)).toEqual(['ativo', 'rascunho', 'vendido']);
    expect(res.body[0]).toMatchObject({ titulo: '25 garrotes para testar as fotos', capa: null });
    expect(res.body[0]).not.toHaveProperty('midias');

    expect((await meus(await apoio.vendedor()).expect(200)).body).toEqual([]);
    const semLogin = await api().get('/eu/lotes').expect(401);
    expect(semLogin.body).toEqual({ mensagem: 'Faça login para continuar.' });
  });

  it('a capa aparece na lista', async () => {
    const vendedor = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    await adicionarLocal(app, vendedor, id);
    const [lote] = (await meus(vendedor).expect(200)).body;
    expect(lote.capa).toMatch(/^http:\/\/api\.teste:3333\//);
  });

  it('PUT /lotes/:id troca os dados; o opcional que não vem fica em branco', async () => {
    const vendedor = await apoio.vendedor();
    const id = await apoio.lote(vendedor, { descricao: 'Gado manso', idadeMediaMeses: 14, pesoMedioKg: 300 });

    const res = await editar(
      vendedor,
      id,
      corpo({ titulo: '30 garrotes Nelore', quantidade: 30, unidadePreco: 'arroba', preco: 320, pesoMedioKg: 330 }),
    ).expect(200);
    expect(res.body).toMatchObject({
      id,
      status: 'ativo',
      titulo: '30 garrotes Nelore',
      quantidade: 30,
      unidadePreco: 'arroba',
      preco: 320,
      pesoMedioKg: 330,
      midias: [],
    });
    expect(res.body.descricao).toBeUndefined();
    expect(res.body.idadeMediaMeses).toBeUndefined();
    expect((await api().get(`/lotes/${id}`).expect(200)).body).toMatchObject({ titulo: '30 garrotes Nelore' });
  });

  it('PUT valida como na criação e não muda nada quando os dados estão errados', async () => {
    const vendedor = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    const res = await editar(vendedor, id, corpo({ titulo: 'abc', unidadePreco: 'kg' })).expect(400);
    expect(res.body.mensagem).toBe('Dados inválidos');
    expect(res.body.erros.map((e: { campo: string }) => e.campo).sort()).toEqual(['pesoMedioKg', 'titulo']);
    expect((await api().get(`/lotes/${id}`).expect(200)).body.titulo).toBe('25 garrotes para testar as fotos');
  });

  it('só o vendedor mexe no lote; lote que não existe é 404; sem login é 401', async () => {
    const vendedor = await apoio.vendedor();
    const outro = await apoio.vendedor();
    const id = await apoio.lote(vendedor);

    const put = await editar(outro, id, corpo({ titulo: 'Lote de outra pessoa' })).expect(403);
    expect(put.body).toEqual({ mensagem: 'Só o vendedor do lote pode alterar o anúncio.' });
    const mensagens = {
      pausar: 'Só o vendedor do lote pode pausar o anúncio.',
      reativar: 'Só o vendedor do lote pode reativar o anúncio.',
      vendido: 'Só o vendedor do lote pode marcar o lote como vendido.',
    } as const;
    for (const [nome, mensagem] of Object.entries(mensagens)) {
      const res = await acao(outro, id, nome as keyof typeof mensagens).expect(403);
      expect(res.body).toEqual({ mensagem });
    }
    expect(await statusDe(id)).toBe('ativo');

    for (const idRuim of ['00000000-0000-4000-8000-000000000000', 'nao-e-um-id']) {
      expect((await editar(vendedor, idRuim, corpo()).expect(404)).body).toEqual({ mensagem: 'Lote não encontrado' });
      expect((await acao(vendedor, idRuim, 'pausar').expect(404)).body).toEqual({ mensagem: 'Lote não encontrado' });
    }
    await api().put(`/lotes/${id}`).send(corpo()).expect(401);
    await api().post(`/lotes/${id}/vendido`).expect(401);
  });

  it('mudar o gado encerra a proposta em aberto e avisa as conversas; mudar título e preço não', async () => {
    const vendedor = await apoio.vendedor();
    const comprador = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    const conversa = await conversaCom(comprador, id);
    const proposta = (await propor(comprador, conversa).expect(201)).body.id;

    await editar(vendedor, id, corpo({ titulo: 'Garrotes Nelore de primeira', preco: 3300 })).expect(200);
    let c = await ver(comprador, conversa);
    expect(c.propostaAberta?.id).toBe(proposta);
    expect(avisos(c)).toEqual([]);

    await editar(vendedor, id, corpo({ quantidade: 18 })).expect(200);
    c = await ver(comprador, conversa);
    expect(c.propostaAberta).toBeNull();
    expect(c.mensagens.find((m) => m.proposta?.id === proposta)?.proposta?.status).toBe('expirada');
    expect(avisos(c)).toEqual([ALTERADO]);
    // A proposta vencida não pode mais ser aceita; uma nova segue a quantidade nova.
    await api().post(`/propostas/${proposta}/aceitar`).set('Authorization', vendedor).expect(409);
    await propor(comprador, conversa).expect(400);
    await propor(comprador, conversa, { quantidade: 18 }).expect(201);
  });

  it('com revisão manual, o lote no ar que é alterado volta para a revisão', async () => {
    const vendedor = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    await db.update(lotes).set({ status: 'ativo' }).where(eq(lotes.id, id));
    const res = await editar(vendedor, id, corpo({ titulo: 'Garrotes alterados' }), manual).expect(200);
    expect(res.body.status).toBe('em_analise');

    // Rascunho e pausado continuam como estão.
    for (const status of ['rascunho', 'encerrado', 'em_analise'] as const) {
      await db.update(lotes).set({ status }).where(eq(lotes.id, id));
      expect((await editar(vendedor, id, corpo(), manual).expect(200)).body.status).toBe(status);
    }
  });

  it('lote com negócio fechado ou vendido não pode ser alterado', async () => {
    const vendedor = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    for (const [status, mensagem] of [
      ['negociando', 'Este lote tem negócio fechado pelo app e não pode mais ser alterado.'],
      ['vendido', 'Este lote já foi vendido e não pode mais ser alterado.'],
    ] as const) {
      await db.update(lotes).set({ status }).where(eq(lotes.id, id));
      expect((await editar(vendedor, id, corpo({ titulo: 'Tentando mudar' })).expect(409)).body).toEqual({ mensagem });
    }
    expect((await api().get(`/lotes/${id}`).expect(200)).body.titulo).toBe('25 garrotes para testar as fotos');
  });

  it('pausar tira da busca e encerra a proposta; reativar exige foto e volta o lote ao ar', async () => {
    const vendedor = await apoio.vendedor();
    const comprador = await apoio.vendedor();
    const raca = `Nelore Pausa ${Date.now()}`;
    const id = await apoio.lote(vendedor, { raca });
    const conversa = await conversaCom(comprador, id);
    await propor(comprador, conversa).expect(201);
    expect(await naBusca(id, raca)).toBe(true);

    const pausado = await acao(vendedor, id, 'pausar').expect(200);
    expect(pausado.body).toMatchObject({ id, status: 'encerrado' });
    expect(await naBusca(id, raca)).toBe(false);
    // Repetir não faz mal (o app repete quando perde a conexão) e não avisa de novo.
    await acao(vendedor, id, 'pausar').expect(200);
    let c = await ver(comprador, conversa);
    expect(c.propostaAberta).toBeNull();
    expect(avisos(c)).toEqual([PAUSADO]);
    await propor(comprador, conversa).expect(409);
    await api().get(`/lotes/${id}/contato`).set('Authorization', comprador).expect(409);

    const semFoto = await acao(vendedor, id, 'reativar').expect(400);
    expect(semFoto.body).toEqual({ mensagem: 'Coloque pelo menos uma foto do lote antes de reativar o anúncio.' });
    expect(await statusDe(id)).toBe('encerrado');

    await adicionarLocal(app, vendedor, id);
    expect((await acao(vendedor, id, 'reativar').expect(200)).body.status).toBe('ativo');
    await acao(vendedor, id, 'reativar').expect(200);
    expect(await naBusca(id, raca)).toBe(true);
    c = await ver(comprador, conversa);
    expect(avisos(c)).toEqual([PAUSADO, DE_VOLTA]);
    await propor(comprador, conversa).expect(201);
  });

  it('com revisão manual, reativar manda o lote para a revisão, sem avisar que voltou ao ar', async () => {
    const vendedor = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    await db.update(lotes).set({ status: 'encerrado' }).where(eq(lotes.id, id));
    expect((await acao(vendedor, id, 'reativar', manual).expect(200)).body.status).toBe('em_analise');
    // Em análise também pode ser pausado.
    expect((await acao(vendedor, id, 'pausar', manual).expect(200)).body.status).toBe('encerrado');
  });

  it('pausar e reativar recusam rascunho, negócio fechado e vendido', async () => {
    const vendedor = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    for (const [status, mensagem] of [
      ['rascunho', NAO_PUBLICADO],
      ['negociando', NEGOCIO_FECHADO],
      ['vendido', JA_VENDIDO],
    ] as const) {
      await db.update(lotes).set({ status }).where(eq(lotes.id, id));
      expect((await acao(vendedor, id, 'pausar').expect(409)).body).toEqual({ mensagem });
      expect((await acao(vendedor, id, 'reativar').expect(409)).body).toEqual({ mensagem });
      expect(await statusDe(id)).toBe(status);
    }
  });

  it('marcar como vendido funciona no ar, pausado, em análise e com negócio fechado; rascunho não', async () => {
    const vendedor = await apoio.vendedor();
    for (const status of ['ativo', 'encerrado', 'em_analise', 'negociando'] as const) {
      const id = await apoio.lote(vendedor);
      await db.update(lotes).set({ status }).where(eq(lotes.id, id));
      expect((await acao(vendedor, id, 'vendido').expect(200)).body.status).toBe('vendido');
      await acao(vendedor, id, 'vendido').expect(200);
    }
    const rascunho = (await apoio.criarLote(vendedor, {}, { rascunho: '1' }).expect(201)).body.id;
    expect((await acao(vendedor, rascunho, 'vendido').expect(409)).body).toEqual({ mensagem: NAO_PUBLICADO });
  });

  it('vender depois do negócio fechado pelo app avisa as conversas e tira o lote da busca de vez', async () => {
    const vendedor = await apoio.vendedor();
    const comprador = await apoio.vendedor();
    const outroComprador = await apoio.vendedor();
    const raca = `Nelore Vendido ${Date.now()}`;
    const id = await apoio.lote(vendedor, { raca });
    const conversa = await conversaCom(comprador, id);
    const outra = await conversaCom(outroComprador, id);
    const proposta = (await propor(comprador, conversa).expect(201)).body.id;
    await api().post(`/propostas/${proposta}/aceitar`).set('Authorization', vendedor).expect(200);
    expect(await statusDe(id)).toBe('negociando');

    expect((await acao(vendedor, id, 'vendido').expect(200)).body.status).toBe('vendido');
    expect(await naBusca(id, raca)).toBe(false);
    expect(avisos(await ver(comprador, conversa)).at(-1)).toBe(VENDIDO);
    expect(avisos(await ver(outroComprador, outra)).at(-1)).toBe(VENDIDO);
    // O negócio fechado continua registrado na conversa.
    expect((await ver(comprador, conversa)).pedido).not.toBeNull();
  });

  it('vender encerra a proposta em aberto de quem ainda negociava', async () => {
    const vendedor = await apoio.vendedor();
    const comprador = await apoio.vendedor();
    const id = await apoio.lote(vendedor);
    const conversa = await conversaCom(comprador, id);
    const proposta = (await propor(comprador, conversa).expect(201)).body.id;

    await acao(vendedor, id, 'vendido').expect(200);
    const c = await ver(comprador, conversa);
    expect(c.propostaAberta).toBeNull();
    expect(c.mensagens.find((m) => m.proposta?.id === proposta)?.proposta?.status).toBe('expirada');
    expect(avisos(c)).toEqual([VENDIDO]);
    await api().post(`/propostas/${proposta}/aceitar`).set('Authorization', vendedor).expect(409);
  });
});
