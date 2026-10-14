import { createHash, randomInt } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import request from 'supertest';
import { formatarTelefone } from '@arroba/shared';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, lotes, sessoes, usuarios } from '../db/schema.js';

const loteValido = {
  titulo: '30 garrotes Nelore de teste',
  categoria: 'garrote',
  raca: 'Nelore',
  sexo: 'macho',
  quantidade: 30,
  unidadePreco: 'cabeca',
  preco: 3000,
  municipio: 'Dourados',
  uf: 'MS',
  lat: -22.22,
  lng: -54.8,
};

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

// Requer Postgres com migrations aplicadas (pnpm db:migrate). Usa CODIGO_MODO=teste (padrão fora de produção).
describe('Login por código (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  const telefones: string[] = [];

  /** Celular novo a cada teste, para o limite de pedidos por hora não travar outra execução. */
  function novoTelefone() {
    const telefone = `+55119${String(randomInt(1e8)).padStart(8, '0')}`;
    telefones.push(telefone);
    return telefone;
  }

  async function pedirCodigo(telefone: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/auth/codigo').send({ telefone }).expect(201);
    return res.body.codigoTeste;
  }

  function entrar(telefone: string, codigo: string) {
    return request(app.getHttpServer()).post('/auth/entrar').send({ telefone, codigo });
  }

  async function login(telefone = novoTelefone()): Promise<string> {
    const res = await entrar(telefone, await pedirCodigo(telefone)).expect(200);
    return res.body.token;
  }

  function errado(codigo: string) {
    return String((Number(codigo) + 1) % 1_000_000).padStart(6, '0');
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    db = app.get(DB);
  });

  afterAll(async () => {
    const ids = db.select({ id: usuarios.id }).from(usuarios).where(inArray(usuarios.telefone, telefones));
    await db.delete(lotes).where(inArray(lotes.vendedorId, ids));
    await db.delete(usuarios).where(inArray(usuarios.telefone, telefones));
    await db.delete(codigosLogin).where(inArray(codigosLogin.telefone, telefones));
    await app.close();
  });

  it('fluxo completo: código, entrar, perfil e anúncio', async () => {
    const telefone = novoTelefone();
    const pedido = await request(app.getHttpServer())
      .post('/auth/codigo')
      .send({ telefone: formatarTelefone(telefone) })
      .expect(201);
    const { codigoTeste, expiraEm } = pedido.body;
    expect(codigoTeste).toMatch(/^\d{6}$/);
    const minutos = (Date.parse(expiraEm) - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(9);
    expect(minutos).toBeLessThan(10.5);

    const [salvo] = await db.select().from(codigosLogin).where(eq(codigosLogin.telefone, telefone));
    expect(salvo.codigoHash).toBe(sha256(`${telefone}:${codigoTeste}`));

    const res = await entrar(telefone, codigoTeste).expect(200);
    expect(res.body.token).toMatch(/^[\w-]{43}$/);
    const [sessao] = await db.select().from(sessoes).where(eq(sessoes.usuarioId, res.body.usuario.id));
    expect(sessao.tokenHash).toBe(sha256(res.body.token));
    const dias = (sessao.expiraEm.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(89.9);
    expect(dias).toBeLessThan(90.1);
    expect(res.body.usuario).toEqual({
      id: expect.any(String),
      telefone,
      nome: null,
      municipio: null,
      uf: null,
      verificado: false,
      perfilCompleto: false,
    });
    const auth = `Bearer ${res.body.token}`;

    const eu = await request(app.getHttpServer()).get('/eu').set('Authorization', auth).expect(200);
    expect(eu.body).toEqual(res.body.usuario);

    const perfil = await request(app.getHttpServer())
      .patch('/eu')
      .set('Authorization', auth)
      .send({ nome: '  Maria Aparecida  ', municipio: 'Dourados', uf: 'MS' })
      .expect(200);
    expect(perfil.body).toMatchObject({ nome: 'Maria Aparecida', municipio: 'Dourados', uf: 'MS', perfilCompleto: true });

    const lote = await request(app.getHttpServer())
      .post('/lotes')
      .set('Authorization', auth)
      .send(loteValido)
      .expect(201);
    expect(lote.body.status).toBe('em_analise');
    expect(lote.body.vendedor).toMatchObject({ id: eu.body.id, nome: 'Maria Aparecida', uf: 'MS' });
  });

  it('entra na conta que já existe para o telefone', async () => {
    const telefone = novoTelefone();
    const primeiro = await entrar(telefone, await pedirCodigo(telefone)).expect(200);
    const segundo = await entrar(telefone, await pedirCodigo(telefone)).expect(200);
    expect(segundo.body.usuario.id).toBe(primeiro.body.usuario.id);
    expect(segundo.body.token).not.toBe(primeiro.body.token);
  });

  it('recusa telefone inválido', async () => {
    const res = await request(app.getHttpServer()).post('/auth/codigo').send({ telefone: '1234' }).expect(400);
    expect(res.body.mensagem).toBe('Dados inválidos');
    expect(res.body.erros[0].campo).toBe('telefone');
  });

  it('recusa código errado', async () => {
    const telefone = novoTelefone();
    const codigo = await pedirCodigo(telefone);
    const res = await entrar(telefone, errado(codigo)).expect(401);
    expect(res.body).toEqual({ mensagem: 'Código incorreto.' });
  });

  it('só vale o código mais recente', async () => {
    const telefone = novoTelefone();
    const antigo = await pedirCodigo(telefone);
    const novo = await pedirCodigo(telefone);
    if (antigo !== novo) await entrar(telefone, antigo).expect(401);
    await entrar(telefone, novo).expect(200);
  });

  it('5 tentativas erradas bloqueiam até o código certo', async () => {
    const telefone = novoTelefone();
    const codigo = await pedirCodigo(telefone);
    for (let i = 0; i < 5; i++) {
      const res = await entrar(telefone, errado(codigo)).expect(401);
      expect(res.body.mensagem).toBe('Código incorreto.');
    }
    const res = await entrar(telefone, codigo).expect(401);
    expect(res.body).toEqual({ mensagem: 'Muitas tentativas erradas. Peça um novo código.' });

    await entrar(telefone, await pedirCodigo(telefone)).expect(200);
  });

  it('tentativas simultâneas não furam o limite', async () => {
    const telefone = novoTelefone();
    const codigo = await pedirCodigo(telefone);
    const respostas = await Promise.all(Array.from({ length: 8 }, () => entrar(telefone, errado(codigo))));
    const mensagens = respostas.map((r) => r.body.mensagem);
    expect(mensagens.filter((m) => m === 'Código incorreto.')).toHaveLength(5);
    expect(mensagens.filter((m) => m === 'Muitas tentativas erradas. Peça um novo código.')).toHaveLength(3);
    await entrar(telefone, codigo).expect(401);
  });

  it('limita a 5 pedidos de código por hora', async () => {
    const telefone = novoTelefone();
    for (let i = 0; i < 5; i++) await pedirCodigo(telefone);
    const res = await request(app.getHttpServer()).post('/auth/codigo').send({ telefone }).expect(429);
    expect(res.body).toEqual({ mensagem: 'Você pediu muitos códigos. Espere um pouco e tente de novo.' });
  });

  it('recusa código expirado', async () => {
    const telefone = novoTelefone();
    const codigo = await pedirCodigo(telefone);
    await db
      .update(codigosLogin)
      .set({ expiraEm: sql`now() - interval '1 minute'` })
      .where(eq(codigosLogin.telefone, telefone));
    const res = await entrar(telefone, codigo).expect(401);
    expect(res.body).toEqual({ mensagem: 'Código expirado. Peça um novo código.' });
  });

  it('não aceita o mesmo código duas vezes', async () => {
    const telefone = novoTelefone();
    const codigo = await pedirCodigo(telefone);
    await entrar(telefone, codigo).expect(200);
    const res = await entrar(telefone, codigo).expect(401);
    expect(res.body.mensagem).toBe('Código expirado. Peça um novo código.');
  });

  it('não aceita o mesmo código duas vezes em corrida', async () => {
    const telefone = novoTelefone();
    const codigo = await pedirCodigo(telefone);
    const respostas = await Promise.all([entrar(telefone, codigo), entrar(telefone, codigo), entrar(telefone, codigo)]);
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 401, 401]);
  });

  it('exige login em GET /eu, PATCH /eu e POST /lotes', async () => {
    const eu = await request(app.getHttpServer()).get('/eu').expect(401);
    expect(eu.body).toEqual({ mensagem: 'Faça login para continuar.' });
    const perfil = await request(app.getHttpServer())
      .patch('/eu')
      .send({ nome: 'Fulano de Tal', municipio: 'Dourados', uf: 'MS' })
      .expect(401);
    expect(perfil.body).toEqual({ mensagem: 'Faça login para continuar.' });
    const lote = await request(app.getHttpServer()).post('/lotes').send(loteValido).expect(401);
    expect(lote.body).toEqual({ mensagem: 'Faça login para continuar.' });
  });

  it('recusa token inválido', async () => {
    for (const valor of ['Bearer token-que-nao-existe', 'Token abc', 'Bearer']) {
      const res = await request(app.getHttpServer()).get('/eu').set('Authorization', valor).expect(401);
      expect(res.body).toEqual({ mensagem: 'Faça login para continuar.' });
    }
  });

  it('recusa sessão expirada', async () => {
    const telefone = novoTelefone();
    const token = await login(telefone);
    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.telefone, telefone));
    await db
      .update(sessoes)
      .set({ expiraEm: sql`now() - interval '1 minute'` })
      .where(eq(sessoes.usuarioId, usuario.id));
    await request(app.getHttpServer()).get('/eu').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('não deixa anunciar sem perfil completo', async () => {
    const token = await login();
    const res = await request(app.getHttpServer())
      .post('/lotes')
      .set('Authorization', `Bearer ${token}`)
      .send(loteValido)
      .expect(403);
    expect(res.body).toEqual({ mensagem: 'Complete seu perfil (nome, município e estado) antes de anunciar.' });
  });

  it('recusa perfil inválido', async () => {
    const token = await login();
    const res = await request(app.getHttpServer())
      .patch('/eu')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'A', municipio: '', uf: 'XX' })
      .expect(400);
    expect(res.body.mensagem).toBe('Dados inválidos');
    expect(res.body.erros.map((e: { campo: string }) => e.campo).sort()).toEqual(['municipio', 'nome', 'uf']);
  });

  it('sair encerra a sessão', async () => {
    const auth = `Bearer ${await login()}`;
    await request(app.getHttpServer()).get('/eu').set('Authorization', auth).expect(200);
    await request(app.getHttpServer()).post('/auth/sair').set('Authorization', auth).expect(204);
    await request(app.getHttpServer()).get('/eu').set('Authorization', auth).expect(401);
    await request(app.getHttpServer())
      .patch('/eu')
      .set('Authorization', auth)
      .send({ nome: 'Fulano de Tal', municipio: 'Dourados', uf: 'MS' })
      .expect(401);
    await request(app.getHttpServer()).post('/auth/sair').set('Authorization', auth).expect(401);
  });

  it('a API não sobe com CODIGO_MODO inválido', async () => {
    vi.stubEnv('CODIGO_MODO', 'sms');
    try {
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
        /SMS ainda não foi implementado/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
