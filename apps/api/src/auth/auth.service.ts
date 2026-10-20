import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, count, desc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import {
  CODIGO_DIGITOS,
  type Eu,
  type Perfil,
  type RespostaEntrar,
  type RespostaSolicitarCodigo,
} from '@arroba/shared';
import { DB, type Db } from '../db/db.module.js';
import { codigosLogin, sessoes, usuarios } from '../db/schema.js';
import { CONFIG_ENVIO, type ConfigEnvio } from './config-envio.js';
import { ENVIO_SMS, finalDoTelefone, SmsRecusado, textoDoSms, type EnvioSms } from './envio-sms.js';

export type Usuario = typeof usuarios.$inferSelect;
export interface SessaoAtual {
  id: string;
  usuario: Usuario;
}

const PEDIDOS_POR_HORA = 5;
/** Com SMS: por número em 24 horas, para ninguém usar o app para encher de SMS o celular de outra pessoa. */
const PEDIDOS_POR_DIA = 10;
/** Por conexão (IPv6: por bloco /64) em 24 horas, só com SMS. Folgado para várias pessoas atrás do mesmo IP da operadora. */
const PEDIDOS_POR_IP_DIA = 20;
const TENTATIVAS_POR_CODIGO = 5;
const VALIDADE = sql`now() + interval '10 minutes'`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Login');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG_ENVIO) private readonly envio: ConfigEnvio,
    @Inject(ENVIO_SMS) private readonly sms: EnvioSms | null,
  ) {}

  async solicitarCodigo(telefone: string, ip: string | null): Promise<RespostaSolicitarCodigo> {
    const codigo = randomInt(10 ** CODIGO_DIGITOS).toString().padStart(CODIGO_DIGITOS, '0');
    const porSms = this.envio.modo === 'sms';
    const ultimaHora = sql`now() - interval '1 hour'`;
    const ultimoDia = sql`now() - interval '1 day'`;
    const resultado = await this.db.transaction(async (tx) => {
      // Uma fila só para os pedidos de código: com pedidos simultâneos os limites não furam.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('codigos_login'))`);
      const contar = async (...filtros: SQL[]) =>
        (await tx.select({ n: count() }).from(codigosLogin).where(and(...filtros)))[0].n;

      if ((await contar(eq(codigosLogin.telefone, telefone), gt(codigosLogin.criadoEm, ultimaHora))) >= PEDIDOS_POR_HORA) {
        return 'telefone' as const;
      }
      // Cada SMS custa: os limites por conexão e por dia seguram quem dispara códigos para números
      // aleatórios (fraude de SMS) ou um erro no app que peça sem parar.
      if (porSms) {
        if ((await contar(eq(codigosLogin.telefone, telefone), gt(codigosLogin.criadoEm, ultimoDia))) >= PEDIDOS_POR_DIA) {
          return 'telefone' as const;
        }
        if (ip && (await contar(eq(codigosLogin.ip, ip), gt(codigosLogin.criadoEm, ultimoDia))) >= PEDIDOS_POR_IP_DIA) {
          return 'conexao' as const;
        }
        const noDia = await contar(eq(codigosLogin.porSms, true), gt(codigosLogin.criadoEm, ultimoDia));
        if (noDia >= this.envio.limiteDiario) return 'dia' as const;
      }
      const [novo] = await tx
        .insert(codigosLogin)
        .values({
          telefone,
          codigoHash: this.hashCodigo(telefone, codigo),
          // Com SMS, o código só passa a valer depois que a Comtele aceita mandar (abaixo). Data bem no
          // passado, e não now(): now() é a hora em que a transação começou, e um "entrar" que começou
          // antes veria este código como válido.
          expiraEm: porSms ? sql`'epoch'::timestamptz` : VALIDADE,
          ip,
          porSms,
        })
        .returning({ id: codigosLogin.id, expiraEm: codigosLogin.expiraEm });
      return novo;
    });

    if (resultado === 'telefone' || resultado === 'conexao') {
      throw new HttpException(
        { mensagem: 'Você pediu muitos códigos. Espere um pouco e tente de novo.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (resultado === 'dia') {
      this.logger.error(
        `Limite de ${this.envio.limiteDiario} SMS em 24 horas atingido: os pedidos de código estão recusados. ` +
          'Se o movimento for de verdade, aumente CODIGO_SMS_POR_DIA no Render (arroba-api > Environment).',
      );
      throw new ServiceUnavailableException({
        mensagem: 'O envio de códigos está pausado por um tempo. Tente de novo mais tarde.',
      });
    }

    let expiraEm = resultado.expiraEm;
    if (porSms && this.sms) {
      try {
        await this.sms.enviar(telefone, textoDoSms(codigo));
      } catch (e) {
        const motivo = `${finalDoTelefone(telefone)}: ${(e as Error).message}`;
        // Recusa certa: o código não chegou e nunca vale, mas o pedido conta nos limites. O código
        // anterior, se ainda valer, continua valendo.
        if (e instanceof SmsRecusado) {
          this.logger.error(`A Comtele recusou o SMS para ${motivo}`);
          throw new ServiceUnavailableException({
            mensagem: 'Não conseguimos enviar o SMS agora. Tente de novo em alguns minutos.',
          });
        }
        // Sem resposta clara (demora, rede, falha do lado da Comtele): o SMS pode ter saído, então o
        // código vale como se tivesse chegado.
        this.logger.warn(`Sem confirmação do SMS para ${motivo}`);
      }
      const [ativo] = await this.db
        .update(codigosLogin)
        .set({ expiraEm: VALIDADE })
        .where(eq(codigosLogin.id, resultado.id))
        .returning({ expiraEm: codigosLogin.expiraEm });
      expiraEm = ativo.expiraEm;
    }
    return {
      expiraEm: expiraEm.toISOString(),
      codigoTeste: porSms ? undefined : codigo,
    };
  }

  async entrar(telefone: string, codigo: string): Promise<RespostaEntrar> {
    const resultado = await this.db.transaction(async (tx) => {
      // Só vale o código mais recente entre os que chegaram (com SMS, um código recusado pela
      // Comtele nunca passa a valer). A linha fica travada até o fim, então tentativas
      // simultâneas são contadas uma a uma e o mesmo código não entra duas vezes.
      const [atual] = await tx
        .select({
          id: codigosLogin.id,
          codigoHash: codigosLogin.codigoHash,
          tentativas: codigosLogin.tentativas,
          porSms: codigosLogin.porSms,
          valido: sql<boolean>`${codigosLogin.usadoEm} is null`,
        })
        .from(codigosLogin)
        .where(
          and(
            eq(codigosLogin.telefone, telefone),
            gt(codigosLogin.expiraEm, sql`now()`),
            // Com SMS ligado, um código pedido na versão de teste (apareceu na tela) não vale mais.
            this.envio.modo === 'sms' ? eq(codigosLogin.porSms, true) : undefined,
          ),
        )
        .orderBy(desc(codigosLogin.criadoEm))
        .limit(1)
        .for('update');
      if (!atual?.valido) return 'expirado' as const;
      if (atual.tentativas >= TENTATIVAS_POR_CODIGO) return 'bloqueado' as const;
      if (!mesmoHash(atual.codigoHash, this.hashCodigo(telefone, codigo))) {
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
        porSms: atual.porSms,
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
          // Com SMS ligado, quem entrou na versão de teste (o código aparecia na tela, então qualquer um
          // entrava em qualquer número) precisa entrar de novo, agora com o código que chega no celular.
          this.envio.modo === 'sms' ? eq(sessoes.porSms, true) : undefined,
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

  /** Com a chave do servidor: quem lê o banco não descobre o código testando os 1 milhão possíveis. */
  private hashCodigo(telefone: string, codigo: string): string {
    return createHmac('sha256', this.envio.segredo).update(`${telefone}:${codigo}`).digest('hex');
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

function mesmoHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
