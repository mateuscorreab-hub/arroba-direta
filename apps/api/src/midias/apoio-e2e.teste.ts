import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import type { EnvioMidia } from '@arroba/shared';
import type { Db } from '../db/db.module.js';
import { codigosLogin, lotes, usuarios } from '../db/schema.js';

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

  async lote(auth: string, extra: Record<string, unknown> = {}): Promise<string> {
    const res = await this.http()
      .post('/lotes')
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
      })
      .expect(201);
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
