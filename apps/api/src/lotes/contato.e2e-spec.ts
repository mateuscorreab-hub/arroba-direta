import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { ContatoVendedor } from '@arroba/shared';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { lotes } from '../db/schema.js';
import { ApoioE2e } from '../midias/apoio-e2e.teste.js';

// Requer Postgres com migrations aplicadas. Os lotes de teste saem ativos (APROVACAO_LOTES=automatica).
describe('Telefone do vendedor (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  const apoio = new ApoioE2e(() => app);

  beforeAll(async () => {
    vi.stubEnv('APROVACAO_LOTES', 'automatica');
    vi.stubEnv('MIDIA_ARMAZENAMENTO', 'desligado');
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
  });

  const contato = (auth: string | null, loteId: string) => {
    const req = request(app.getHttpServer()).get(`/lotes/${loteId}/contato`);
    return auth ? req.set('Authorization', auth) : req;
  };
  const telefoneDe = async (auth: string): Promise<string> =>
    (await request(app.getHttpServer()).get('/eu').set('Authorization', auth).expect(200)).body.telefone;

  it('quem fez login vê o telefone do vendedor; o GET público do lote não mostra', async () => {
    const vendedor = await apoio.vendedor();
    const comprador = await apoio.vendedor();
    const loteId = await apoio.lote(vendedor);

    const res = await contato(comprador, loteId).expect(200);
    expect(res.body).toEqual({ nome: 'Vendedor de Fotos', telefone: await telefoneDe(vendedor) } satisfies ContatoVendedor);

    const publico = await request(app.getHttpServer()).get(`/lotes/${loteId}`).expect(200);
    expect(publico.body.status).toBe('ativo');
    expect(JSON.stringify(publico.body)).not.toContain(res.body.telefone.slice(3));
  });

  it('exige login', async () => {
    const loteId = await apoio.lote(await apoio.vendedor());
    const res = await contato(null, loteId).expect(401);
    expect(res.body).toEqual({ mensagem: 'Faça login para continuar.' });
  });

  it('lote fora da busca não mostra o telefone, a não ser para o próprio vendedor', async () => {
    const vendedor = await apoio.vendedor();
    const comprador = await apoio.vendedor();
    const loteId = await apoio.lote(vendedor);
    for (const status of ['rascunho', 'em_analise', 'negociando', 'vendido'] as const) {
      await db.update(lotes).set({ status }).where(eq(lotes.id, loteId));
      const res = await contato(comprador, loteId).expect(409);
      expect(res.body).toEqual({ mensagem: 'Este lote não está mais disponível.' });
      expect((await contato(vendedor, loteId).expect(200)).body.telefone).toBe(await telefoneDe(vendedor));
    }
  });

  it('lote que não existe ou id estranho responde 404', async () => {
    const auth = await apoio.vendedor();
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nao-e-um-id']) {
      expect((await contato(auth, id).expect(404)).body).toEqual({ mensagem: 'Lote não encontrado' });
    }
  });
});
