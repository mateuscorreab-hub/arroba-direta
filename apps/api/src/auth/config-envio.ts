import { randomBytes } from 'node:crypto';

/**
 * Como o código de login chega ao usuário:
 * - "teste": o código volta na resposta para o app mostrar na tela, sem SMS. Quem sabe um número entra
 *   na conta dele, então não serve com gente de verdade.
 * - "sms": o código vai por SMS e nunca volta na resposta.
 */
export type ModoEnvio = 'teste' | 'sms';

/** Conta na Comtele, que leva o SMS. */
export interface ConfigComtele {
  chave: string;
  /**
   * Id da rota na API do painel novo (portal.comtele.com.br). Sem ela, usa a API do painel antigo
   * (sms.comtele.com.br), que não pede rota.
   */
  rota: number | null;
  /** Base da API (sem "/" no fim). Muda só nos testes, para um servidor falso. */
  apiBase: string;
}

interface Comum {
  /** Chave do HMAC dos códigos guardados no banco. */
  segredo: string;
  /** Com SMS: quantos códigos podem sair em 24 horas, somando todos os números. Segura o gasto. */
  limiteDiario: number;
}

export type ConfigEnvio = (Comum & { modo: 'teste' }) | (Comum & { modo: 'sms'; comtele: ConfigComtele });

export const CONFIG_ENVIO = Symbol('CONFIG_ENVIO');

export const SMS_POR_DIA_PADRAO = 100;
const SEGREDO_MINIMO = 32;
const ONDE_FICA_A_CHAVE =
  'fica no painel da Comtele: no antigo, em API > Chave de API; no novo, em Configurações > Chaves de API';

/**
 * Lê CODIGO_MODO, CODIGO_SEGREDO, CODIGO_SMS_POR_DIA e, com SMS, COMTELE_API_KEY e COMTELE_ROTA.
 * Lança erro (e a API não sobe) com valor inválido ou faltando. As mensagens nunca repetem os segredos.
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
  const comum = { segredo: segredo || randomBytes(32).toString('hex'), limiteDiario };
  return modo === 'sms' ? { modo, ...comum, comtele: lerComtele(env) } : { modo, ...comum };
}

function lerComtele(env: Record<string, string | undefined>): ConfigComtele {
  const chave = env.COMTELE_API_KEY?.trim();
  if (!chave) throw new Error(`CODIGO_MODO=sms precisa de COMTELE_API_KEY (${ONDE_FICA_A_CHAVE}).`);
  if (/\s/.test(chave)) {
    throw new Error(`COMTELE_API_KEY inválida: tem espaço no meio (copie de novo; ${ONDE_FICA_A_CHAVE}).`);
  }

  const textoRota = env.COMTELE_ROTA?.trim();
  const rota = textoRota ? Number(textoRota) : null;
  if (rota !== null && (!Number.isInteger(rota) || rota < 1)) {
    throw new Error(`COMTELE_ROTA inválida: "${textoRota}". Use o número da rota (ou apague a variável no painel antigo).`);
  }

  const base = env.COMTELE_API_BASE?.trim();
  const apiBase = base
    ? base.replace(/\/+$/, '')
    : rota === null
      ? 'https://sms.comtele.com.br'
      : 'https://api.comtele.com.br';
  return { chave, rota, apiBase };
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
