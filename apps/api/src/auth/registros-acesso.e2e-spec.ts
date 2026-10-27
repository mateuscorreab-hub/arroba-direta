import { randomInt } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, registrosAcesso, usuarios } from '../db/schema.js';
import { RegistrosAcessoService } from './registros-acesso.service.js';

// Requer Postgres com migrations aplicadas (pnpm db:migrate). Usa CODIGO_MODO=teste.
describe('Registros de acesso (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  const telefones: string[] = [];

  function novoTelefone() {
    const telefone = `+55119${String(randomInt(1e8)).padStart(8, '0')}`;
    telefones.push(telefone);
    return telefone;
  }

  async function login(telefone: string, ip: string) {
    const pedido = await request(app.getHttpServer()).post('/auth/codigo').send({ telefone }).expect(201);
    const res = await request(app.getHttpServer())
      .post('/auth/entrar')
      .set('CF-Connecting-IP', ip)
      .send({ telefone, codigo: pedido.body.codigoTeste })
      .expect(200);
    return { auth: `Bearer ${res.body.token}`, usuarioId: res.body.usuario.id as string };
  }

  const registrosDe = (telefone: string) =>
    db.select().from(registrosAcesso).where(eq(registrosAcesso.telefone, telefone)).orderBy(registrosAcesso.criadoEm);

  beforeAll(async () => {
    vi.stubEnv('CODIGO_SEGREDO', 'segredo-dos-testes-de-login-0123456789abcdef');
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
    await db.delete(usuarios).where(inArray(usuarios.telefone, telefones));
    await db.delete(codigosLogin).where(inArray(codigosLogin.telefone, telefones));
    await db.delete(registrosAcesso).where(inArray(registrosAcesso.telefone, telefones));
    await app.close();
  });

  it('guarda a entrada com o IP completo, a data e a hora', async () => {
    const telefone = novoTelefone();
    const ip = '2804:14c:5b:8001:a1b2:c3d4:e5f6:1';
    const { usuarioId } = await login(telefone, ip.toUpperCase());

    const [entrada, ...outros] = await registrosDe(telefone);
    expect(outros).toEqual([]);
    expect(entrada).toMatchObject({ usuarioId, telefone, evento: 'entrada', ip, sessaoId: expect.any(String) });
    expect(Date.now() - entrada.criadoEm.getTime()).toBeLessThan(60_000);
  });

  it('guarda o uso uma vez por hora para cada sessão e IP', async () => {
    const telefone = novoTelefone();
    const { auth } = await login(telefone, '200.10.20.30');
    const eu = (ip: string) =>
      request(app.getHttpServer()).get('/eu').set('Authorization', auth).set('CF-Connecting-IP', ip).expect(200);

    await eu('200.10.20.30');
    await eu('200.10.20.30');
    // Trocou de rede (do Wi-Fi para o 4G, por exemplo): novo registro.
    await eu('177.50.60.70');

    const registros = await registrosDe(telefone);
    expect(registros.map((r) => [r.evento, r.ip])).toEqual([
      ['entrada', '200.10.20.30'],
      ['uso', '200.10.20.30'],
      ['uso', '177.50.60.70'],
    ]);
    expect(new Set(registros.map((r) => r.sessaoId)).size).toBe(1);
  });

  it('não guarda nada quando o login falha', async () => {
    const telefone = novoTelefone();
    await request(app.getHttpServer()).get('/eu').set('Authorization', 'Bearer token-que-nao-existe').expect(401);
    await request(app.getHttpServer()).post('/auth/codigo').send({ telefone }).expect(201);
    await request(app.getHttpServer()).post('/auth/entrar').send({ telefone, codigo: '000000' });
    expect(await registrosDe(telefone)).toEqual([]);
  });

  it('o registro continua quando a conta é apagada', async () => {
    const telefone = novoTelefone();
    const { usuarioId } = await login(telefone, '200.10.20.30');
    await db.delete(usuarios).where(eq(usuarios.id, usuarioId));

    const [entrada] = await registrosDe(telefone);
    expect(entrada).toMatchObject({ usuarioId: null, sessaoId: null, telefone, ip: '200.10.20.30' });
  });

  it('apaga registros de acesso e pedidos de código com mais de 6 meses', async () => {
    const telefone = novoTelefone();
    await login(telefone, '200.10.20.30');
    const seteMeses = sql`now() - interval '7 months'`;
    const cincoMeses = sql`now() - interval '5 months'`;
    await db.insert(registrosAcesso).values([
      { telefone, evento: 'uso', ip: '1.1.1.1', criadoEm: seteMeses },
      { telefone, evento: 'uso', ip: '2.2.2.2', criadoEm: cincoMeses },
    ]);
    await db.insert(codigosLogin).values([
      { telefone, codigoHash: 'velho', expiraEm: seteMeses, criadoEm: seteMeses },
      { telefone, codigoHash: 'recente', expiraEm: cincoMeses, criadoEm: cincoMeses },
    ]);

    const apagados = await app.get(RegistrosAcessoService).limparAntigos();
    expect(apagados.acessos).toBeGreaterThanOrEqual(1);
    expect(apagados.codigos).toBeGreaterThanOrEqual(1);

    expect((await registrosDe(telefone)).map((r) => r.ip).sort()).toEqual(['2.2.2.2', '200.10.20.30']);
    const codigos = await db
      .select({ hash: codigosLogin.codigoHash })
      .from(codigosLogin)
      .where(and(eq(codigosLogin.telefone, telefone), inArray(codigosLogin.codigoHash, ['velho', 'recente'])));
    expect(codigos.map((c) => c.hash)).toEqual(['recente']);
  });
});
