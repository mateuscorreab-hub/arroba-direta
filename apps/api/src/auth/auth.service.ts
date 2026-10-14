import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  CODIGO_DIGITOS,
  type Eu,
  type Perfil,
  type RespostaEntrar,
  type RespostaSolicitarCodigo,
} from '@arroba/shared';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, sessoes, usuarios } from '../db/schema.js';
import { MODO_ENVIO, type ModoEnvio } from './modo-envio.js';

export type Usuario = typeof usuarios.$inferSelect;
export interface SessaoAtual {
  id: string;
  usuario: Usuario;
}

const PEDIDOS_POR_HORA = 5;
const TENTATIVAS_POR_CODIGO = 5;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MODO_ENVIO) private readonly modo: ModoEnvio,
  ) {}

  async solicitarCodigo(telefone: string): Promise<RespostaSolicitarCodigo> {
    const codigo = randomInt(10 ** CODIGO_DIGITOS).toString().padStart(CODIGO_DIGITOS, '0');
    const expiraEm = await this.db.transaction(async (tx) => {
      // Trava por telefone para pedidos simultâneos não furarem o limite.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${telefone}))`);
      const [{ pedidos }] = await tx
        .select({ pedidos: count() })
        .from(codigosLogin)
        .where(
          and(
            eq(codigosLogin.telefone, telefone),
            gt(codigosLogin.criadoEm, sql`now() - interval '1 hour'`),
          ),
        );
      if (pedidos >= PEDIDOS_POR_HORA) return null;
      const [novo] = await tx
        .insert(codigosLogin)
        .values({
          telefone,
          codigoHash: hashCodigo(telefone, codigo),
          expiraEm: sql`now() + interval '10 minutes'`,
        })
        .returning({ expiraEm: codigosLogin.expiraEm });
      return novo.expiraEm;
    });
    if (!expiraEm) {
      throw new HttpException(
        { mensagem: 'Você pediu muitos códigos. Espere um pouco e tente de novo.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return {
      expiraEm: expiraEm.toISOString(),
      codigoTeste: this.modo === 'teste' ? codigo : undefined,
    };
  }

  async entrar(telefone: string, codigo: string): Promise<RespostaEntrar> {
    const resultado = await this.db.transaction(async (tx) => {
      // Só vale o código mais recente. A linha fica travada até o fim, então tentativas
      // simultâneas são contadas uma a uma e o mesmo código não entra duas vezes.
      const [atual] = await tx
        .select({
          id: codigosLogin.id,
          codigoHash: codigosLogin.codigoHash,
          tentativas: codigosLogin.tentativas,
          valido: sql<boolean>`${codigosLogin.usadoEm} is null and ${codigosLogin.expiraEm} > now()`,
        })
        .from(codigosLogin)
        .where(eq(codigosLogin.telefone, telefone))
        .orderBy(desc(codigosLogin.criadoEm))
        .limit(1)
        .for('update');
      if (!atual?.valido) return 'expirado' as const;
      if (atual.tentativas >= TENTATIVAS_POR_CODIGO) return 'bloqueado' as const;
      if (!mesmoHash(atual.codigoHash, hashCodigo(telefone, codigo))) {
        await tx
          .update(codigosLogin)
          .set({ tentativas: sql`${codigosLogin.tentativas} + 1` })
          .where(eq(codigosLogin.id, atual.id));
        return 'incorreto' as const;
      }
      const usado = await tx
        .update(codigosLogin)
        .set({ usadoEm: sql`now()` })
        .where(and(eq(codigosLogin.id, atual.id), isNull(codigosLogin.usadoEm)))
        .returning({ id: codigosLogin.id });
      if (usado.length === 0) return 'expirado' as const;

      await tx.insert(usuarios).values({ telefone }).onConflictDoNothing({ target: usuarios.telefone });
      const [usuario] = await tx.select().from(usuarios).where(eq(usuarios.telefone, telefone));
      const token = randomBytes(32).toString('base64url');
      await tx.insert(sessoes).values({
        usuarioId: usuario.id,
        tokenHash: sha256(token),
        expiraEm: sql`now() + interval '90 days'`,
      });
      return { token, usuario: paraEu(usuario) };
    });

    if (resultado === 'expirado') {
      throw new UnauthorizedException({ mensagem: 'Código expirado. Peça um novo código.' });
    }
    if (resultado === 'bloqueado') {
      throw new UnauthorizedException({ mensagem: 'Muitas tentativas erradas. Peça um novo código.' });
    }
    if (resultado === 'incorreto') throw new UnauthorizedException({ mensagem: 'Código incorreto.' });
    return resultado;
  }

  async sessaoPorToken(token: string): Promise<SessaoAtual | null> {
    const [sessao] = await this.db
      .select({ id: sessoes.id, usuario: usuarios })
      .from(sessoes)
      .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
      .where(
        and(
          eq(sessoes.tokenHash, sha256(token)),
          isNull(sessoes.revogadaEm),
          gt(sessoes.expiraEm, sql`now()`),
        ),
      );
    return sessao ?? null;
  }

  async sair(sessaoId: string): Promise<void> {
    await this.db
      .update(sessoes)
      .set({ revogadaEm: sql`now()` })
      .where(and(eq(sessoes.id, sessaoId), isNull(sessoes.revogadaEm)));
  }

  async atualizarPerfil(usuarioId: string, perfil: Perfil): Promise<Eu> {
    const [usuario] = await this.db
      .update(usuarios)
      .set(perfil)
      .where(eq(usuarios.id, usuarioId))
      .returning();
    return paraEu(usuario);
  }
}

export function perfilCompleto(u: Pick<Usuario, 'nome' | 'municipio' | 'uf'>): boolean {
  return Boolean(u.nome && u.municipio && u.uf);
}

export function paraEu(u: Usuario): Eu {
  return {
    id: u.id,
    telefone: u.telefone,
    nome: u.nome,
    municipio: u.municipio,
    uf: u.uf,
    verificado: u.verificado,
    perfilCompleto: perfilCompleto(u),
  };
}

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function hashCodigo(telefone: string, codigo: string): string {
  return sha256(`${telefone}:${codigo}`);
}

function mesmoHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
