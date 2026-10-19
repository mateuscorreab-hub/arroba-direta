import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import type { EnvioMidia, Midia, TipoMidia } from '@arroba/shared';
import type { Db } from '../db/db.module.js';
import { codigosLogin, lotes, usuarios } from '../db/schema.js';
import { png } from './arquivos-falsos.teste.js';

/** Cria contas e lotes de teste e apaga tudo no fim. */
export class ApoioE2e {
  private readonly telefones: string[] = [];

  constructor(private readonly app: () => INestApplication) {}

  private http() {
    return request(this.app().getHttpServer());
  }

  /** Conta nova com perfil completo. Devolve o cabeçalho Authorization. */
  async vendedor(): Promise<string> {
    const telefone = `+55119${String(randomInt(1e8)).padStart(8, '0')}`;
    this.telefones.push(telefone);
    const pedido = await this.http().post('/auth/codigo').send({ telefone }).expect(201);
    const { body } = await this.http()
      .post('/auth/entrar')
      .send({ telefone, codigo: pedido.body.codigoTeste })
      .expect(200);
    const auth = `Bearer ${body.token}`;
    await this.http()
      .patch('/eu')
      .set('Authorization', auth)
      .send({ nome: 'Vendedor de Fotos', municipio: 'Dourados', uf: 'MS' })
      .expect(200);
    return auth;
  }

  /** POST /lotes com um anúncio válido, sem conferir a resposta. */
  criarLote(auth: string, extra: Record<string, unknown> = {}, query: Record<string, string | string[]> = {}) {
    return this.http()
      .post('/lotes')
      .query(query)
      .set('Authorization', auth)
      .send({
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
  }

  async lote(auth: string, extra: Record<string, unknown> = {}): Promise<string> {
    const res = await this.criarLote(auth, extra).expect(201);
    return res.body.id;
  }

  async limpar(db: Db) {
    if (this.telefones.length === 0) return;
    const ids = db.select({ id: usuarios.id }).from(usuarios).where(inArray(usuarios.telefone, this.telefones));
    await db.delete(lotes).where(inArray(lotes.vendedorId, ids));
    await db.delete(usuarios).where(inArray(usuarios.telefone, this.telefones));
    await db.delete(codigosLogin).where(inArray(codigosLogin.telefone, this.telefones));
  }
}

/** Envio multipart para POST /midias/local, com os campos antes do arquivo (como o app faz). */
export function enviarLocal(app: INestApplication, envio: EnvioMidia, arquivo: Buffer, nome: string, mime: string) {
  let req = request(app.getHttpServer()).post(new URL(envio.url).pathname);
  for (const [k, v] of Object.entries(envio.campos)) req = req.field(k, v);
  return req.attach(envio.campoArquivo, arquivo, { filename: nome, contentType: mime });
}

/** No modo local: ticket, envio e registro, como o app faz. Devolve a mídia e a resposta do envio. */
export async function adicionarLocal(
  app: INestApplication,
  auth: string,
  loteId: string,
  arquivo = png(800, 600),
  tipo: TipoMidia = 'foto',
) {
  const mime = tipo === 'foto' ? 'image/png' : 'video/mp4';
  const ticket = await request(app.getHttpServer())
    .post(`/lotes/${loteId}/midias/envio`)
    .set('Authorization', auth)
    .send({ tipo, mime, tamanho: arquivo.length })
    .expect(201);
  const envio: EnvioMidia = ticket.body;
  const enviado = await enviarLocal(app, envio, arquivo, tipo === 'foto' ? 'foto.png' : 'video.mp4', mime).expect(200);
  const { public_id, version, signature } = enviado.body;
  const res = await request(app.getHttpServer())
    .post(`/lotes/${loteId}/midias`)
    .set('Authorization', auth)
    .send({ tipo, publicId: public_id, versao: version, assinatura: signature })
    .expect(201);
  return { midia: res.body as Midia, enviado: enviado.body };
}

/** Espera até n conexões deste banco estarem paradas esperando uma trava. */
export async function esperarBloqueados(cliente: pg.Client, n: number) {
  for (let i = 0; i < 200; i++) {
    // Dentro de uma transação o pg_stat_activity fica congelado; limpa a cópia a cada volta.
    await cliente.query('select pg_stat_clear_snapshot()');
    const { rows } = await cliente.query(
      "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if (rows[0].n >= n) return;
    await new Promise((ok) => setTimeout(ok, 25));
  }
  throw new Error(`Os ${n} pedidos não chegaram à trava`);
}
