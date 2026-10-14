import { randomInt, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import request from 'supertest';
import {
  hojeEmBrasilia,
  resumoProposta,
  type ConversaDetalhe,
  type ConversaResumo,
  type Mensagem,
} from '@arroba/shared';
import { AppModule } from '../app.module.js';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, conversas, lotes, mensagens, pedidos, propostas, usuarios } from '../db/schema.js';

const PERFIL_INCOMPLETO = 'Complete seu perfil (nome, município e estado) antes de negociar.';
const LOTE_INDISPONIVEL = 'Este lote não está mais disponível para negociação.';
const NEGOCIO_FECHADO = 'Negócio fechado! O próximo passo é o pagamento protegido, que chega em breve.';
const OUTRO_COMPRADOR = 'O vendedor fechou negócio com outro comprador. Este lote não está mais disponível.';

const loteBase = {
  titulo: '30 garrotes Nelore para negociar',
  categoria: 'garrote',
  raca: 'Nelore',
  sexo: 'macho',
  quantidade: 30,
  pesoMedioKg: 390 as number | undefined,
  unidadePreco: 'cabeca',
  preco: 3000,
  municipio: 'Dourados',
  uf: 'MS',
  lat: -22.22,
  lng: -54.8,
};

/** Data YYYY-MM-DD a tantos dias de hoje (horário de Brasília). */
function dia(deslocamento: number): string {
  const d = new Date(`${hojeEmBrasilia()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deslocamento);
  return d.toISOString().slice(0, 10);
}

const propostaBase = () => ({
  preco: 2500,
  unidadePreco: 'cabeca',
  quantidade: 30,
  quebraPercentual: 0,
  fretePorConta: 'comprador',
  dataEmbarque: dia(10),
});

interface Pessoa {
  id: string;
  telefone: string;
  auth: string;
}

const campos = (res: { body: { erros: { campo: string }[] } }) => res.body.erros.map((e) => e.campo);
const propostaNa = (c: ConversaDetalhe, id: string) => c.mensagens.find((m) => m.proposta?.id === id)?.proposta;

// Requer Postgres com migrations aplicadas (pnpm db:migrate). Os lotes de teste saem ativos (APROVACAO_LOTES=automatica).
describe('Negociação (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  const telefones: string[] = [];

  const api = () => request(app.getHttpServer());
  const abrir = (p: Pessoa, loteId: string) => api().post(`/lotes/${loteId}/conversas`).set('Authorization', p.auth);
  const listar = (p: Pessoa) => api().get('/conversas').set('Authorization', p.auth);
  const ver = (p: Pessoa, id: string) => api().get(`/conversas/${id}`).set('Authorization', p.auth);
  const escrever = (p: Pessoa, id: string, texto: string) =>
    api().post(`/conversas/${id}/mensagens`).set('Authorization', p.auth).send({ texto });
  const propor = (p: Pessoa, id: string, dados: Record<string, unknown> = {}) =>
    api()
      .post(`/conversas/${id}/propostas`)
      .set('Authorization', p.auth)
      .send({ ...propostaBase(), ...dados });
  const aceitar = (p: Pessoa, id: string) => api().post(`/propostas/${id}/aceitar`).set('Authorization', p.auth);
  const recusar = (p: Pessoa, id: string) => api().post(`/propostas/${id}/recusar`).set('Authorization', p.auth);

  /** Conta nova pelo login de teste; com nome, já com o perfil completo. */
  async function pessoa(nome: string | null = 'Pessoa de Teste'): Promise<Pessoa> {
    const telefone = `+55119${String(randomInt(1e8)).padStart(8, '0')}`;
    telefones.push(telefone);
    const pedido = await api().post('/auth/codigo').send({ telefone }).expect(201);
    const { body } = await api()
      .post('/auth/entrar')
      .send({ telefone, codigo: pedido.body.codigoTeste })
      .expect(200);
    const auth = `Bearer ${body.token}`;
    if (nome) {
      await api().patch('/eu').set('Authorization', auth).send({ nome, municipio: 'Dourados', uf: 'MS' }).expect(200);
    }
    return { id: body.usuario.id, telefone, auth };
  }

  async function anunciar(vendedor: Pessoa, dados: Partial<typeof loteBase> = {}): Promise<string> {
    const res = await api()
      .post('/lotes')
      .set('Authorization', vendedor.auth)
      .send({ ...loteBase, ...dados })
      .expect(201);
    expect(res.body.status).toBe('ativo');
    return res.body.id;
  }

  /** Vendedor com um lote ativo e um comprador com a conversa aberta. */
  async function negociacao(dados: Partial<typeof loteBase> = {}) {
    const vendedor = await pessoa('Vendedor de Teste');
    const comprador = await pessoa('Comprador de Teste');
    const loteId = await anunciar(vendedor, dados);
    const res = await abrir(comprador, loteId).expect(200);
    return { vendedor, comprador, loteId, conversaId: res.body.id as string };
  }

  beforeAll(async () => {
    vi.stubEnv('APROVACAO_LOTES', 'automatica');
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
    const ids = db.select({ id: usuarios.id }).from(usuarios).where(inArray(usuarios.telefone, telefones));
    const lotesIds = db.select({ id: lotes.id }).from(lotes).where(inArray(lotes.vendedorId, ids));
    const conversasIds = db
      .select({ id: conversas.id })
      .from(conversas)
      .where(or(inArray(conversas.loteId, lotesIds), inArray(conversas.compradorId, ids)));
    const propostasIds = db.select({ id: propostas.id }).from(propostas).where(inArray(propostas.conversaId, conversasIds));
    await db.delete(mensagens).where(inArray(mensagens.conversaId, conversasIds));
    await db.delete(pedidos).where(inArray(pedidos.propostaId, propostasIds));
    await db.delete(propostas).where(inArray(propostas.conversaId, conversasIds));
    await db.delete(conversas).where(inArray(conversas.id, conversasIds));
    await db.delete(lotes).where(inArray(lotes.vendedorId, ids));
    await db.delete(usuarios).where(inArray(usuarios.telefone, telefones));
    await db.delete(codigosLogin).where(inArray(codigosLogin.telefone, telefones));
    await app.close();
  });

  it('fluxo completo: conversa, contraproposta, aceite e pedido por cabeça', async () => {
    const { vendedor, comprador, loteId, conversaId } = await negociacao();

    const inicio = await ver(comprador, conversaId).expect(200);
    expect(inicio.body).toEqual({
      id: conversaId,
      papel: 'comprador',
      lote: {
        id: loteId,
        titulo: loteBase.titulo,
        categoria: 'garrote',
        quantidade: 30,
        unidadePreco: 'cabeca',
        preco: 3000,
        pesoMedioKg: 390,
        municipio: 'Dourados',
        uf: 'MS',
        status: 'ativo',
      },
      outraParte: { id: vendedor.id, nome: 'Vendedor de Teste', verificado: false, municipio: 'Dourados', uf: 'MS' },
      ultimaMensagem: null,
      naoLidas: 0,
      propostaAberta: null,
      negocioFechado: false,
      atualizadoEm: expect.any(String),
      mensagens: [],
      pedido: null,
    });

    const msg = await escrever(
      comprador,
      conversaId,
      '  Me liga no (67) 99812-3456 ou joao.silva@fazenda.com.br. Pago R$ 2.600,00 nas 30 cabeças.  ',
    ).expect(201);
    expect(msg.body).toEqual({
      id: expect.any(String),
      conversaId,
      autorId: comprador.id,
      tipo: 'texto',
      texto: 'Me liga no [contato oculto] ou [contato oculto]. Pago R$ 2.600,00 nas 30 cabeças.',
      criadoEm: expect.any(String),
    });

    const p1 = await propor(comprador, conversaId, { preco: 2500, mensagem: 'Fecho hoje. Zap 67 99812 3456' }).expect(201);
    expect(p1.body).toEqual({
      id: expect.any(String),
      conversaId,
      autorId: comprador.id,
      preco: 2500,
      unidadePreco: 'cabeca',
      quantidade: 30,
      quebraPercentual: 0,
      fretePorConta: 'comprador',
      dataEmbarque: dia(10),
      mensagem: 'Fecho hoje. Zap [contato oculto]',
      status: 'enviada',
      expiraEm: expect.any(String),
      criadoEm: expect.any(String),
      valorEstimado: 75000,
    });
    const horas = (Date.parse(p1.body.expiraEm) - Date.parse(p1.body.criadoEm)) / 3_600_000;
    expect(horas).toBe(72);

    const lista = await listar(vendedor).expect(200);
    expect(lista.body.naoLidas).toBe(2);
    expect(lista.body.itens).toHaveLength(1);
    expect(lista.body.itens[0]).toMatchObject({
      id: conversaId,
      papel: 'vendedor',
      outraParte: { id: comprador.id, nome: 'Comprador de Teste' },
      naoLidas: 2,
      propostaAberta: { id: p1.body.id, status: 'enviada' },
      ultimaMensagem: { texto: resumoProposta({ preco: 2500, unidadePreco: 'cabeca' }) },
      negocioFechado: false,
    });
    expect(lista.body.itens[0].outraParte).not.toHaveProperty('telefone');

    const p2 = await propor(vendedor, conversaId, { preco: 2800, fretePorConta: 'vendedor' }).expect(201);
    expect(p2.body).toMatchObject({ autorId: vendedor.id, status: 'enviada', valorEstimado: 84000 });

    const vista = await ver(comprador, conversaId).expect(200);
    const detalhe = vista.body as ConversaDetalhe;
    expect(detalhe.mensagens.map((m) => m.tipo)).toEqual(['texto', 'proposta', 'proposta']);
    expect(propostaNa(detalhe, p1.body.id)?.status).toBe('contraproposta');
    expect(propostaNa(detalhe, p2.body.id)?.status).toBe('enviada');
    expect(detalhe.propostaAberta?.id).toBe(p2.body.id);
    expect(detalhe.naoLidas).toBe(0);
    expect(detalhe.outraParte).not.toHaveProperty('telefone');
    const [respondida] = await db.select().from(propostas).where(eq(propostas.id, p1.body.id));
    expect(respondida.respondidaEm).not.toBeNull();

    const respondidaAntes = await aceitar(vendedor, p1.body.id).expect(409);
    expect(respondidaAntes.body).toEqual({ mensagem: 'Esta proposta não pode mais ser aceita.' });
    const propria = await aceitar(vendedor, p2.body.id).expect(403);
    expect(propria.body).toEqual({ mensagem: 'Você não pode aceitar a própria proposta.' });
    const recusaPropria = await recusar(vendedor, p2.body.id).expect(403);
    expect(recusaPropria.body).toEqual({ mensagem: 'Você não pode recusar a própria proposta.' });

    const fechado = await aceitar(comprador, p2.body.id).expect(200);
    const final = fechado.body as ConversaDetalhe;
    expect(final).toMatchObject({
      negocioFechado: true,
      propostaAberta: null,
      lote: { status: 'negociando' },
      outraParte: { id: vendedor.id, telefone: vendedor.telefone },
      pedido: {
        id: expect.any(String),
        propostaId: p2.body.id,
        valorTotal: 84000,
        valorComissao: 1260,
        status: 'aguardando_pagamento',
      },
      naoLidas: 0,
    });
    expect(propostaNa(final, p2.body.id)?.status).toBe('aceita');
    expect(final.mensagens.at(-1)).toMatchObject({ tipo: 'sistema', autorId: null, texto: NEGOCIO_FECHADO });

    const lote = await api().get(`/lotes/${loteId}`).expect(200);
    expect(lote.body.status).toBe('negociando');

    const doVendedor = await ver(vendedor, conversaId).expect(200);
    expect(doVendedor.body.outraParte.telefone).toBe(comprador.telefone);
    expect(doVendedor.body.pedido.id).toBe(final.pedido?.id);

    // Com o negócio fechado o contato pode circular.
    const livre = await escrever(vendedor, conversaId, 'Meu número é (67) 99812-3456').expect(201);
    expect(livre.body.texto).toBe('Meu número é (67) 99812-3456');

    const deNovo = await aceitar(comprador, p2.body.id).expect(409);
    expect(deNovo.body).toEqual({ mensagem: 'Esta proposta não pode mais ser aceita.' });
    const recusaTarde = await recusar(comprador, p2.body.id).expect(409);
    expect(recusaTarde.body).toEqual({ mensagem: 'Esta proposta não pode mais ser recusada.' });
    const outra = await propor(comprador, conversaId).expect(409);
    expect(outra.body).toEqual({ mensagem: LOTE_INDISPONIVEL });

    const salvos = await db.select().from(pedidos).where(eq(pedidos.propostaId, p2.body.id));
    expect(salvos).toHaveLength(1);
  });

  it('pedido por arroba aplica a quebra; o vendedor também pode aceitar', async () => {
    const { vendedor, comprador, conversaId } = await negociacao({ quantidade: 45, unidadePreco: 'arroba', preco: 320 });
    const p = await propor(comprador, conversaId, {
      preco: 310,
      unidadePreco: 'arroba',
      quantidade: 20,
      quebraPercentual: 3,
      fretePorConta: 'vendedor',
    }).expect(201);
    // 390 kg x 20 cabeças x 97% = 7.566 kg = 504,4 arrobas x R$ 310
    expect(p.body.valorEstimado).toBe(156364);

    const res = await aceitar(vendedor, p.body.id).expect(200);
    expect(res.body.pedido).toMatchObject({ valorTotal: 156364, valorComissao: 2345.46 });
    expect(res.body.outraParte.telefone).toBe(comprador.telefone);
    const [pedido] = await db.select().from(pedidos).where(eq(pedidos.propostaId, p.body.id));
    expect(pedido).toMatchObject({ valorTotal: 156364, valorComissao: 2345.46, status: 'aguardando_pagamento' });
  });

  it('proposta por kg vivo', async () => {
    const { vendedor, comprador, conversaId } = await negociacao();
    const p = await propor(vendedor, conversaId, { preco: 12.5, unidadePreco: 'kg', quantidade: 10, quebraPercentual: 2 });
    expect(p.status).toBe(201);
    // 390 kg x 10 x 98% = 3.822 kg x R$ 12,50
    expect(p.body.valorEstimado).toBe(47775);
    const res = await aceitar(comprador, p.body.id).expect(200);
    expect(res.body.pedido).toMatchObject({ valorTotal: 47775, valorComissao: 716.63 });
  });

  it('abrir a conversa de novo devolve a mesma, mesmo com o lote fora da busca', async () => {
    const { comprador, loteId, conversaId } = await negociacao();
    const outra = await abrir(comprador, loteId).expect(200);
    expect(outra.body.id).toBe(conversaId);

    const novo = await pessoa('Outro Comprador');
    const juntas = await Promise.all([abrir(novo, loteId), abrir(novo, loteId), abrir(novo, loteId)]);
    expect(juntas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(new Set(juntas.map((r) => r.body.id)).size).toBe(1);

    await db.update(lotes).set({ status: 'encerrado' }).where(eq(lotes.id, loteId));
    const depois = await abrir(comprador, loteId).expect(200);
    expect(depois.body).toMatchObject({ id: conversaId, lote: { status: 'encerrado' } });

    const atrasado = await pessoa('Comprador Atrasado');
    const res = await abrir(atrasado, loteId).expect(409);
    expect(res.body).toEqual({ mensagem: LOTE_INDISPONIVEL });
    const doLote = await db.select().from(conversas).where(eq(conversas.loteId, loteId));
    expect(doLote).toHaveLength(2);
  });

  it('não deixa negociar o próprio lote nem lote que não existe', async () => {
    const vendedor = await pessoa('Vendedor de Teste');
    const loteId = await anunciar(vendedor);
    const res = await abrir(vendedor, loteId).expect(403);
    expect(res.body).toEqual({ mensagem: 'Você não pode negociar o próprio lote.' });

    for (const id of [randomUUID(), 'nao-e-um-id']) {
      const naoExiste = await abrir(vendedor, id).expect(404);
      expect(naoExiste.body).toEqual({ mensagem: 'Lote não encontrado' });
    }
  });

  it('quem não participa recebe 404 em tudo', async () => {
    const { comprador, conversaId } = await negociacao();
    const p = await propor(comprador, conversaId).expect(201);
    const intruso = await pessoa('Intruso de Teste');

    for (const res of [
      await ver(intruso, conversaId),
      await escrever(intruso, conversaId, 'Oi'),
      await propor(intruso, conversaId),
      await ver(intruso, randomUUID()),
      await ver(intruso, 'nao-e-um-id'),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ mensagem: 'Conversa não encontrada.' });
    }
    for (const res of [
      await aceitar(intruso, p.body.id),
      await recusar(intruso, p.body.id),
      await aceitar(intruso, randomUUID()),
      await recusar(intruso, 'nao-e-um-id'),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ mensagem: 'Proposta não encontrada.' });
    }
    const lista = await listar(intruso).expect(200);
    expect(lista.body).toEqual({ itens: [], naoLidas: 0 });
    const [salva] = await db.select().from(propostas).where(eq(propostas.id, p.body.id));
    expect(salva.status).toBe('enviada');
  });

  it('proposta vencida aparece expirada e não pode ser aceita nem recusada', async () => {
    const { vendedor, comprador, conversaId } = await negociacao();
    const p = await propor(comprador, conversaId).expect(201);
    await db
      .update(propostas)
      .set({ expiraEm: sql`now() - interval '1 minute'` })
      .where(eq(propostas.id, p.body.id));

    const vista = await ver(vendedor, conversaId).expect(200);
    expect(vista.body.propostaAberta).toBeNull();
    expect(propostaNa(vista.body, p.body.id)?.status).toBe('expirada');
    const lista = await listar(vendedor).expect(200);
    expect(lista.body.itens[0].propostaAberta).toBeNull();

    const aceite = await aceitar(vendedor, p.body.id).expect(409);
    expect(aceite.body).toEqual({ mensagem: 'Esta proposta não pode mais ser aceita.' });
    const recusa = await recusar(vendedor, p.body.id).expect(409);
    expect(recusa.body).toEqual({ mensagem: 'Esta proposta não pode mais ser recusada.' });

    // A resposta entra normalmente; a vencida fica expirada, não contraproposta.
    const nova = await propor(vendedor, conversaId, { preco: 2900 }).expect(201);
    const [antiga] = await db.select().from(propostas).where(eq(propostas.id, p.body.id));
    expect(antiga.status).toBe('expirada');
    const depois = await ver(comprador, conversaId).expect(200);
    expect(depois.body.propostaAberta.id).toBe(nova.body.id);
  });

  it('nova proposta do mesmo autor substitui a anterior, que vira expirada', async () => {
    const { vendedor, comprador, conversaId } = await negociacao();
    const p1 = await propor(comprador, conversaId, { preco: 2500 }).expect(201);
    const p2 = await propor(comprador, conversaId, { preco: 2600 }).expect(201);
    const vista = await ver(vendedor, conversaId).expect(200);
    expect(propostaNa(vista.body, p1.body.id)?.status).toBe('expirada');
    expect(propostaNa(vista.body, p2.body.id)?.status).toBe('enviada');
    expect(vista.body.propostaAberta.id).toBe(p2.body.id);
    await aceitar(vendedor, p1.body.id).expect(409);
    const [antiga] = await db.select().from(propostas).where(eq(propostas.id, p1.body.id));
    expect(antiga).toMatchObject({ status: 'expirada', respondidaEm: null });
  });

  it('propostas ao mesmo tempo na mesma conversa deixam só uma aberta', async () => {
    const { vendedor, comprador, conversaId } = await negociacao();
    const respostas = await Promise.all([
      propor(comprador, conversaId, { preco: 2500 }),
      propor(vendedor, conversaId, { preco: 2900 }),
      propor(comprador, conversaId, { preco: 2550 }),
    ]);
    expect(respostas.map((r) => r.status)).toEqual([201, 201, 201]);
    const abertas = await db
      .select()
      .from(propostas)
      .where(and(eq(propostas.conversaId, conversaId), eq(propostas.status, 'enviada')));
    expect(abertas).toHaveLength(1);
  });

  it('aceites simultâneos no mesmo lote fecham só um negócio', async () => {
    const vendedor = await pessoa('Vendedor de Teste');
    const loteId = await anunciar(vendedor);
    const compradores: Pessoa[] = [];
    const conversaIds: string[] = [];
    const propostaIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const comprador = await pessoa(`Comprador ${i + 1}`);
      const conversa = await abrir(comprador, loteId).expect(200);
      const p = await propor(comprador, conversa.body.id, { preco: 2500 + i * 10 }).expect(201);
      compradores.push(comprador);
      conversaIds.push(conversa.body.id);
      propostaIds.push(p.body.id);
    }
    // Quem só conversou, sem proposta aberta, não recebe o aviso.
    const curioso = await pessoa('Comprador Curioso');
    const soConversa = await abrir(curioso, loteId).expect(200);

    const respostas = await Promise.all(propostaIds.map((id) => aceitar(vendedor, id)));
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const vencedora = respostas.findIndex((r) => r.status === 200);
    for (const r of respostas.filter((r) => r.status === 409)) {
      expect(r.body).toEqual({ mensagem: 'Esta proposta não pode mais ser aceita.' });
    }

    const fechados = await db.select().from(pedidos).where(inArray(pedidos.propostaId, propostaIds));
    expect(fechados).toHaveLength(1);
    expect(fechados[0].propostaId).toBe(propostaIds[vencedora]);
    const [lote] = await db.select().from(lotes).where(eq(lotes.id, loteId));
    expect(lote.status).toBe('negociando');

    for (let i = 0; i < 3; i++) {
      if (i === vencedora) continue;
      const vista = await ver(compradores[i], conversaIds[i]).expect(200);
      expect(propostaNa(vista.body, propostaIds[i])?.status).toBe('expirada');
      expect(vista.body.mensagens.at(-1)).toMatchObject({ tipo: 'sistema', autorId: null, texto: OUTRO_COMPRADOR });
      expect(vista.body.negocioFechado).toBe(false);
      expect(vista.body.outraParte).not.toHaveProperty('telefone');
    }
    const curiosa = await ver(curioso, soConversa.body.id).expect(200);
    expect(curiosa.body.mensagens).toEqual([]);
  });

  it('ações simultâneas no mesmo lote não travam nem dão erro', async () => {
    const vendedor = await pessoa('Vendedor de Teste');
    const loteId = await anunciar(vendedor);
    const c: { comprador: Pessoa; conversaId: string; propostaId: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const comprador = await pessoa(`Comprador ${i + 1}`);
      const conversaId = (await abrir(comprador, loteId).expect(200)).body.id;
      const propostaId = (await propor(comprador, conversaId, { preco: 2500 + i }).expect(201)).body.id;
      c.push({ comprador, conversaId, propostaId });
    }
    const respostas = await Promise.all([
      aceitar(vendedor, c[0].propostaId),
      recusar(vendedor, c[1].propostaId),
      propor(c[1].comprador, c[1].conversaId, { preco: 2600 }),
      propor(vendedor, c[2].conversaId, { preco: 2900 }),
      escrever(c[2].comprador, c[2].conversaId, 'Fechamos?'),
      escrever(c[0].comprador, c[0].conversaId, 'Aguardo'),
      ver(vendedor, c[1].conversaId),
      listar(vendedor),
      abrir(await pessoa('Comprador Atrasado'), loteId),
    ]);
    for (const r of respostas) expect([200, 201, 409]).toContain(r.status);

    const doLote = await db.select().from(propostas).where(eq(propostas.loteId, loteId));
    expect(doLote.filter((p) => p.status === 'aceita').length).toBeLessThanOrEqual(1);
    for (const { conversaId } of c) {
      expect(doLote.filter((p) => p.conversaId === conversaId && p.status === 'enviada').length).toBeLessThanOrEqual(1);
    }
    const fechados = await db
      .select()
      .from(pedidos)
      .where(inArray(pedidos.propostaId, doLote.map((p) => p.id)));
    expect(fechados.length).toBe(doLote.filter((p) => p.status === 'aceita').length);
  });

  it('valida a proposta contra o lote', async () => {
    const { comprador, conversaId } = await negociacao({ quantidade: 30 });

    const muitas = await propor(comprador, conversaId, { quantidade: 31 }).expect(400);
    expect(muitas.body).toEqual({
      mensagem: 'Dados inválidos',
      erros: [{ campo: 'quantidade', mensagem: 'A quantidade passa do lote, que tem 30 cabeças.' }],
    });
    const passado = await propor(comprador, conversaId, { dataEmbarque: dia(-1) }).expect(400);
    expect(campos(passado)).toEqual(['dataEmbarque']);
    const inexistente = await propor(comprador, conversaId, { dataEmbarque: '2027-02-30' }).expect(400);
    expect(campos(inexistente)).toEqual(['dataEmbarque']);
    const invalida = await propor(comprador, conversaId, { preco: 0, unidadePreco: 'a_combinar', fretePorConta: 'x' }).expect(400);
    expect(campos(invalida).sort()).toEqual(['fretePorConta', 'preco', 'unidadePreco']);

    const hoje = await propor(comprador, conversaId, { dataEmbarque: dia(0), mensagem: '   ' }).expect(201);
    expect(hoje.body).toMatchObject({ dataEmbarque: dia(0), mensagem: null, quebraPercentual: 0 });
  });

  it('lote sem peso médio só aceita proposta por cabeça', async () => {
    const { comprador, conversaId } = await negociacao({ pesoMedioKg: undefined });
    for (const unidadePreco of ['kg', 'arroba']) {
      const res = await propor(comprador, conversaId, { unidadePreco, preco: 300 }).expect(400);
      expect(res.body.erros).toEqual([
        { campo: 'unidadePreco', mensagem: 'Este lote não tem peso médio. Faça a proposta por cabeça.' },
      ]);
    }
    const porCabeca = await propor(comprador, conversaId).expect(201);
    expect(porCabeca.body.valorEstimado).toBe(75000);
  });

  it('lote fora da busca não recebe proposta nem aceite, mas a conversa continua', async () => {
    const { vendedor, comprador, loteId, conversaId } = await negociacao();
    const p = await propor(comprador, conversaId).expect(201);
    await db.update(lotes).set({ status: 'encerrado' }).where(eq(lotes.id, loteId));

    const nova = await propor(vendedor, conversaId).expect(409);
    expect(nova.body).toEqual({ mensagem: LOTE_INDISPONIVEL });
    const aceite = await aceitar(vendedor, p.body.id).expect(409);
    expect(aceite.body).toEqual({ mensagem: LOTE_INDISPONIVEL });
    await escrever(comprador, conversaId, 'Ainda tem o lote?').expect(201);
    const [salva] = await db.select().from(propostas).where(eq(propostas.id, p.body.id));
    expect(salva.status).toBe('enviada');
  });

  it('negociar exige perfil completo; ler, só login', async () => {
    const semPerfil = await pessoa(null);
    const { vendedor, comprador, loteId, conversaId } = await negociacao();
    const abertura = await abrir(semPerfil, loteId).expect(403);
    expect(abertura.body).toEqual({ mensagem: PERFIL_INCOMPLETO });

    const p = await propor(vendedor, conversaId).expect(201);
    // O app não deixa apagar o perfil; aqui só pelo banco, para cobrir as rotas de quem já conversa.
    await db.update(usuarios).set({ municipio: null }).where(eq(usuarios.id, comprador.id));
    await ver(comprador, conversaId).expect(200);
    await listar(comprador).expect(200);
    for (const res of [
      await abrir(comprador, loteId),
      await escrever(comprador, conversaId, 'Oi'),
      await propor(comprador, conversaId),
      await aceitar(comprador, p.body.id),
      await recusar(comprador, p.body.id),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ mensagem: PERFIL_INCOMPLETO });
    }
  });

  it('exige login em todas as rotas', async () => {
    const id = randomUUID();
    for (const res of [
      await api().post(`/lotes/${id}/conversas`),
      await api().get('/conversas'),
      await api().get(`/conversas/${id}`),
      await api().post(`/conversas/${id}/mensagens`).send({ texto: 'Oi' }),
      await api().post(`/conversas/${id}/propostas`).send(propostaBase()),
      await api().post(`/propostas/${id}/aceitar`),
      await api().post(`/propostas/${id}/recusar`),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ mensagem: 'Faça login para continuar.' });
    }
  });

  it('recusa mensagem vazia ou longa demais', async () => {
    const { comprador, conversaId } = await negociacao();
    const vazia = await escrever(comprador, conversaId, '   ').expect(400);
    expect(campos(vazia)).toEqual(['texto']);
    const longa = await escrever(comprador, conversaId, 'a'.repeat(2001)).expect(400);
    expect(campos(longa)).toEqual(['texto']);
    await escrever(comprador, conversaId, 'a'.repeat(2000)).expect(201);
  });

  it('conta não lidas, marca como lido e ordena pela última atividade', async () => {
    const { vendedor, comprador, loteId, conversaId } = await negociacao();
    await escrever(comprador, conversaId, 'Bom dia').expect(201);
    await escrever(comprador, conversaId, 'Ainda tem o lote?').expect(201);

    let doVendedor = (await listar(vendedor).expect(200)).body;
    expect(doVendedor.naoLidas).toBe(2);
    expect(doVendedor.itens[0]).toMatchObject({
      id: conversaId,
      naoLidas: 2,
      ultimaMensagem: { texto: 'Ainda tem o lote?' },
    });
    const doComprador = (await listar(comprador).expect(200)).body;
    expect(doComprador.naoLidas).toBe(0);

    await ver(vendedor, conversaId).expect(200);
    doVendedor = (await listar(vendedor).expect(200)).body;
    expect(doVendedor.naoLidas).toBe(0);

    // O vendedor manda a primeira proposta e o comprador recusa.
    const p = await propor(vendedor, conversaId, { preco: 2900 }).expect(201);
    expect((await listar(comprador).expect(200)).body.naoLidas).toBe(1);
    const recusa = await recusar(comprador, p.body.id).expect(200);
    expect(recusa.body.naoLidas).toBe(0);
    expect(propostaNa(recusa.body, p.body.id)?.status).toBe('recusada');
    expect(recusa.body.propostaAberta).toBeNull();
    expect(recusa.body.mensagens.at(-1)).toMatchObject({ tipo: 'sistema', autorId: null, texto: 'Proposta recusada.' });
    const [recusada] = await db.select().from(propostas).where(eq(propostas.id, p.body.id));
    expect(recusada.respondidaEm).not.toBeNull();

    // A mensagem do sistema conta como não lida para o vendedor.
    doVendedor = (await listar(vendedor).expect(200)).body;
    expect(doVendedor.naoLidas).toBe(1);
    expect(doVendedor.itens[0].ultimaMensagem.texto).toBe('Proposta recusada.');

    // Conversa com atividade mais recente vem primeiro.
    const segundo = await pessoa('Segundo Comprador');
    const outra = (await abrir(segundo, loteId).expect(200)).body as ConversaResumo;
    await escrever(segundo, outra.id, 'Tenho interesse').expect(201);
    doVendedor = (await listar(vendedor).expect(200)).body;
    expect(doVendedor.itens.map((c: ConversaResumo) => c.id)).toEqual([outra.id, conversaId]);
    expect(doVendedor.naoLidas).toBe(2);
    await escrever(comprador, conversaId, 'Posso melhorar a oferta').expect(201);
    doVendedor = (await listar(vendedor).expect(200)).body;
    expect(doVendedor.itens.map((c: ConversaResumo) => c.id)).toEqual([conversaId, outra.id]);

    const mensagensSalvas = await db
      .select()
      .from(mensagens)
      .where(and(eq(mensagens.conversaId, conversaId), isNull(mensagens.autorId)));
    expect(mensagensSalvas.map((m) => m.texto)).toEqual(['Proposta recusada.']);
  });

  it('detalhe traz as últimas 200 mensagens em ordem', async () => {
    const { comprador, conversaId } = await negociacao();
    await db.insert(mensagens).values(
      Array.from({ length: 205 }, (_, i) => ({
        conversaId,
        autorId: comprador.id,
        tipo: 'texto' as const,
        texto: `Mensagem ${i + 1}`,
        criadoEm: new Date(Date.now() - (205 - i) * 1000),
      })),
    );
    const res = await ver(comprador, conversaId).expect(200);
    const textos = (res.body.mensagens as Mensagem[]).map((m) => m.texto);
    expect(textos).toHaveLength(200);
    expect(textos[0]).toBe('Mensagem 6');
    expect(textos.at(-1)).toBe('Mensagem 205');
  });

  it('a API não sobe com APROVACAO_LOTES inválido', async () => {
    vi.stubEnv('APROVACAO_LOTES', 'sim');
    try {
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
        /APROVACAO_LOTES inválido/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
