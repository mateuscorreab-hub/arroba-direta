import { randomInt } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, usuarios } from '../db/schema.js';
import { ComteleFalsa } from './comtele-falsa.teste.js';

const SEGREDO = 'segredo-dos-testes-de-sms-0123456789abcdef';
const PAUSADO = { mensagem: 'O envio de códigos está pausado por um tempo. Tente de novo mais tarde.' };
const SEM_SMS = { mensagem: 'Não conseguimos enviar o SMS agora. Tente de novo em alguns minutos.' };

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

// Requer Postgres com migrations aplicadas (pnpm db:migrate). A Comtele é um servidor falso local.
describe('Login com o código por SMS (e2e)', () => {
  let comtele: ComteleFalsa;
  let app: INestApplication;
  /** Com só 3 SMS por dia, para testar o teto. */
  let apertado: INestApplication;
  /** Versão de teste (código na tela), no mesmo banco. */
  let teste: INestApplication;
  let db: Db;
  const telefones: string[] = [];

  function novoTelefone() {
    const telefone = `+55679${String(randomInt(1e8)).padStart(8, '0')}`;
    telefones.push(telefone);
    return telefone;
  }
  /** Um IP de mentira por teste, como a Cloudflare põe no Render: o limite por conexão não vaza entre testes. */
  const novoIp = () => `200.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`;

  function pedir(telefone: string, ip: string, servidor = app) {
    return request(servidor.getHttpServer()).post('/auth/codigo').set('CF-Connecting-IP', ip).send({ telefone });
  }
  function entrar(telefone: string, codigo: string, servidor = app) {
    return request(servidor.getHttpServer()).post('/auth/entrar').send({ telefone, codigo });
  }
  function eu(token: string, servidor = app) {
    return request(servidor.getHttpServer()).get('/eu').set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    comtele = await new ComteleFalsa().subir();
    const sms = {
      CODIGO_MODO: 'sms',
      CODIGO_SEGREDO: SEGREDO,
      COMTELE_API_KEY: 'chave-dos-testes',
      COMTELE_API_BASE: comtele.base,
    };
    app = await subir(sms);
    apertado = await subir({ ...sms, CODIGO_SMS_POR_DIA: '3' });
    teste = await subir({ CODIGO_MODO: 'teste', CODIGO_SEGREDO: SEGREDO });
    db = app.get(DB);
  });

  afterAll(async () => {
    await db.delete(usuarios).where(inArray(usuarios.telefone, telefones));
    await db.delete(codigosLogin).where(inArray(codigosLogin.telefone, telefones));
    await app.close();
    await apertado.close();
    await teste.close();
    await comtele.fechar();
  });

  beforeEach(() => {
    comtele.recebidos.length = 0;
    comtele.falhas = [];
  });

  it('o código vai por SMS, não volta na resposta e serve para entrar', async () => {
    const telefone = novoTelefone();
    const ip = novoIp();
    const res = await pedir(telefone, ip).expect(201);
    expect(Object.keys(res.body)).toEqual(['expiraEm']);
    const minutos = (Date.parse(res.body.expiraEm) - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(9);
    expect(minutos).toBeLessThanOrEqual(10);

    expect(comtele.recebidos).toHaveLength(1);
    expect(comtele.recebidos[0]).toMatchObject({
      caminho: '/api/v2/send',
      chave: 'chave-dos-testes',
      corpo: { Receivers: telefone.slice(3) },
    });
    const codigo = comtele.codigoPara(telefone);
    expect(codigo).toMatch(/^\d{6}$/);
    expect(comtele.recebidos[0].corpo.Content).toBe(`Arroba Direta: seu codigo de acesso e ${codigo}. Nao passe para ninguem.`);

    const [salvo] = await db.select().from(codigosLogin).where(eq(codigosLogin.telefone, telefone));
    expect(salvo).toMatchObject({ porSms: true, ip });
    expect(salvo.codigoHash).not.toContain(codigo);

    const login = await entrar(telefone, codigo!).expect(200);
    expect(login.body.usuario.telefone).toBe(telefone);
    await eu(login.body.token).expect(200);
  });

  it('se a Comtele recusa, responde 503: o código recusado nunca vale, o anterior continua valendo e o pedido conta no limite', async () => {
    const telefone = novoTelefone();
    const ip = novoIp();
    await pedir(telefone, ip).expect(201);
    const primeiro = comtele.codigoPara(telefone)!;

    comtele.falhas = [{ status: 400, corpo: { Success: false, Message: 'é necessário ao menos 1 créditos.' } }];
    expect((await pedir(telefone, ip).expect(503)).body).toEqual(SEM_SMS);
    const recusado = comtele.codigoPara(telefone)!;
    expect(recusado).not.toBe(primeiro);
    expect(await db.select().from(codigosLogin).where(eq(codigosLogin.telefone, telefone))).toHaveLength(2);

    await entrar(telefone, recusado).expect(401);
    await entrar(telefone, primeiro).expect(200);

    // As recusas contam no limite de 5 por hora do número: quem dispara pedidos não ganha pedidos extras.
    comtele.falhas = Array.from({ length: 3 }, () => ({ status: 401, corpo: null }));
    for (let i = 0; i < 3; i++) await pedir(telefone, ip).expect(503);
    await pedir(telefone, ip).expect(429);
  });

  it('se a Comtele falha sem dizer se mandou, o código vale: o SMS pode ter chegado', async () => {
    const telefone = novoTelefone();
    comtele.falhas = [{ status: 502, corpo: null }];
    const res = await pedir(telefone, novoIp()).expect(201);
    expect(Object.keys(res.body)).toEqual(['expiraEm']);
    await entrar(telefone, comtele.codigoPara(telefone)!).expect(200);
  });

  it('com SMS ligado, quem entrou pela versão de teste precisa entrar de novo', async () => {
    const telefone = novoTelefone();
    const { codigoTeste } = (await pedir(telefone, novoIp(), teste).expect(201)).body;
    const { token } = (await entrar(telefone, codigoTeste, teste).expect(200)).body;
    await eu(token, teste).expect(200);
    await eu(token).expect(401);

    await pedir(telefone, novoIp()).expect(201);
    const login = await entrar(telefone, comtele.codigoPara(telefone)!).expect(200);
    await eu(login.body.token).expect(200);
  });

  it('limita a 10 pedidos por dia para o mesmo número, mesmo espaçados', async () => {
    const telefone = novoTelefone();
    // 6 pedidos de mais de uma hora atrás: não contam no limite da hora, mas contam no do dia.
    await db.insert(codigosLogin).values(
      Array.from({ length: 6 }, () => ({
        telefone,
        codigoHash: 'antigo',
        expiraEm: sql`now() - interval '2 hours'`,
        criadoEm: sql`now() - interval '3 hours'`,
        porSms: true,
      })),
    );
    for (let i = 0; i < 4; i++) await pedir(telefone, novoIp()).expect(201);
    await pedir(telefone, novoIp()).expect(429);
    expect(comtele.recebidos).toHaveLength(4);
  });

  it('limita a 20 pedidos por dia vindos da mesma conexão, mesmo para números diferentes', async () => {
    const ip = novoIp();
    // 15 pedidos de horas atrás, de números diferentes: contam no limite do dia.
    await db.insert(codigosLogin).values(
      Array.from({ length: 15 }, () => ({
        telefone: novoTelefone(),
        codigoHash: 'antigo',
        expiraEm: sql`now() - interval '5 hours'`,
        criadoEm: sql`now() - interval '6 hours'`,
        ip,
        porSms: true,
      })),
    );
    for (let i = 0; i < 5; i++) await pedir(novoTelefone(), ip).expect(201);
    const res = await pedir(novoTelefone(), ip).expect(429);
    expect(res.body).toEqual({ mensagem: 'Você pediu muitos códigos. Espere um pouco e tente de novo.' });
    expect(comtele.recebidos).toHaveLength(5);
    // Outra conexão continua pedindo, e trocar o X-Forwarded-For não muda a conexão.
    await pedir(novoTelefone(), novoIp()).expect(201);
    await request(app.getHttpServer())
      .post('/auth/codigo')
      .set('CF-Connecting-IP', ip)
      .set('X-Forwarded-For', novoIp())
      .send({ telefone: novoTelefone() })
      .expect(429);
  });

  it('para de mandar SMS quando chega no teto do dia, para todos os números', async () => {
    // O teto conta os SMS das últimas 24 horas; os dos outros testes não entram nesta conta.
    await db.delete(codigosLogin).where(eq(codigosLogin.porSms, true));
    for (let i = 0; i < 3; i++) await pedir(novoTelefone(), novoIp(), apertado).expect(201);
    expect((await pedir(novoTelefone(), novoIp(), apertado).expect(503)).body).toEqual(PAUSADO);
    expect(comtele.recebidos).toHaveLength(3);
  });
});
