import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module.js';

// Requer Postgres com migrations e seed aplicados (pnpm db:migrate && pnpm db:seed).
describe('Lotes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
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
    const res = await request(app.getHttpServer())
      .post('/lotes')
      .set('x-usuario-id', '00000000-0000-0000-0000-000000000000')
      .send({ titulo: 'x' })
      .expect(400);
    expect(res.body.mensagem).toBe('Dados inválidos');
  });
});
