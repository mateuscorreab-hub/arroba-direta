import { randomBytes } from 'node:crypto';

/**
 * Como o código de login chega ao usuário:
 * - "teste": o código volta na resposta para o app mostrar na tela, sem SMS. Quem sabe um número entra
 *   na conta dele, então não serve com gente de verdade.
 * - "sms": o código vai por SMS e nunca volta na resposta.
 */
export type ModoEnvio = 'teste' | 'sms';

export interface ConfigEnvio {
  modo: ModoEnvio;
  /** Chave do HMAC dos códigos guardados no banco. */
  segredo: string;
  /** Com SMS: quantos códigos podem sair em 24 horas, somando todos os números. Segura o gasto. */
  limiteDiario: number;
}

export const CONFIG_ENVIO = Symbol('CONFIG_ENVIO');

export const SMS_POR_DIA_PADRAO = 300;
const SEGREDO_MINIMO = 32;

/**
 * Lê CODIGO_MODO, CODIGO_SEGREDO e CODIGO_SMS_POR_DIA. Lança erro (e a API não sobe) com valor
 * inválido. As mensagens nunca repetem o segredo.
 */
export function lerConfigEnvio(env: Record<string, string | undefined> = process.env): ConfigEnvio {
  const modo = lerModo(env);

  const segredo = env.CODIGO_SEGREDO?.trim();
  if (segredo && segredo.length < SEGREDO_MINIMO) {
    throw new Error(`CODIGO_SEGREDO muito curto: use pelo menos ${SEGREDO_MINIMO} caracteres.`);
  }
  if (modo === 'sms' && !segredo) {
    throw new Error(
      `CODIGO_MODO=sms precisa de CODIGO_SEGREDO: uma sequência aleatória de pelo menos ${SEGREDO_MINIMO} caracteres ` +
        '(no Render, em Environment, "Add Environment Variable" com "Generate" cria uma).',
    );
  }

  const porDia = env.CODIGO_SMS_POR_DIA?.trim();
  const limiteDiario = porDia ? Number(porDia) : SMS_POR_DIA_PADRAO;
  if (!Number.isInteger(limiteDiario) || limiteDiario < 1) {
    throw new Error(`CODIGO_SMS_POR_DIA inválido: "${porDia}". Use um número inteiro maior que zero.`);
  }

  // Na versão de teste sem a variável, uma chave nova a cada vez que a API sobe: o código pedido antes
  // de reiniciar deixa de valer, e a pessoa pede outro.
  return { modo, segredo: segredo || randomBytes(32).toString('hex'), limiteDiario };
}

function lerModo(env: Record<string, string | undefined>): ModoEnvio {
  const modo = env.CODIGO_MODO?.trim();
  if (!modo) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'CODIGO_MODO não definido. Em produção ele é obrigatório: use CODIGO_MODO=sms, ou CODIGO_MODO=teste ' +
          'para a versão de teste (o código aparece na tela).',
      );
    }
    return 'teste';
  }
  if (modo === 'teste' || modo === 'sms') return modo;
  throw new Error(`CODIGO_MODO inválido: "${modo}". Use "sms" ou "teste".`);
}
