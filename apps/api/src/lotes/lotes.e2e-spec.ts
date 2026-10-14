import { randomInt } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, usuarios } from '../db/schema.js';

// Requer Postgres com migrations e seed aplicados (pnpm db:migrate && pnpm db:seed).
describe('Lotes (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  const telefone = `+55119${String(randomInt(1e8)).padStart(8, '0')}`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    db = app.get(DB);
  });

  afterAll(async () => {
    await db.delete(usuarios).where(eq(usuarios.telefone, telefone));
    await db.delete(codigosLogin).where(eq(codigosLogin.telefone, telefone));
    await app.close();
  });

  it('lista lotes ativos ordenados por distância', async () => {
    const res = await request(app.getHttpServer())
      .get('/lotes')
      .query({ lat: -20.47, lng: -54.62, raioKm: 200 })
      .expect(200);
    expect(res.body.itens.length).toBeGreaterThan(0);
    expect(res.body.itens.every((l: { uf: string }) => l.uf === 'MS')).toBe(true);
    expect(res.body.itens[0].distanciaKm).toBe(0);
  });

  it('filtra por categoria', async () => {
    const res = await request(app.getHttpServer()).get('/lotes?categoria=boi_magro').expect(200);
    expect(res.body.itens.map((l: { categoria: string }) => l.categoria)).toEqual(['boi_magro']);
  });

  it('recusa anúncio inválido', async () => {
    const pedido = await request(app.getHttpServer()).post('/auth/codigo').send({ telefone }).expect(201);
    const { body } = await request(app.getHttpServer())
      .post('/auth/entrar')
      .send({ telefone, codigo: pedido.body.codigoTeste })
      .expect(200);
    const auth = `Bearer ${body.token}`;
    await request(app.getHttpServer())
      .patch('/eu')
      .set('Authorization', auth)
      .send({ nome: 'Vendedor de Teste', municipio: 'Campo Grande', uf: 'MS' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/lotes')
      .set('Authorization', auth)
      .send({ titulo: 'x' })
      .expect(400);
    expect(res.body.mensagem).toBe('Dados inválidos');
  });

  // Hoje só o seed cria contas verificadas; os telefones delas não podem passar no login.
  it('ninguém entra nas contas verificadas do seed', async () => {
    const verificados = await db.select().from(usuarios).where(eq(usuarios.verificado, true));
    expect(verificados.length).toBeGreaterThan(0);
    for (const { telefone } of verificados) {
      const res = await request(app.getHttpServer()).post('/auth/codigo').send({ telefone }).expect(400);
      expect(res.body.erros[0].campo).toBe('telefone');
    }
  });
});
