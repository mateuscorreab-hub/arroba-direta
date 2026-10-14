/**
 * Como o código de login chega ao usuário. Por enquanto só existe "teste":
 * o código volta na resposta para o app mostrar na tela, sem SMS.
 */
export type ModoEnvio = 'teste';

export const MODO_ENVIO = Symbol('MODO_ENVIO');

/** Lê CODIGO_MODO. Lança erro (e a API não sobe) se o modo for inválido ou ainda não existir. */
export function lerModoEnvio(env: Record<string, string | undefined> = process.env): ModoEnvio {
  const modo = env.CODIGO_MODO?.trim();
  if (!modo) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'CODIGO_MODO não definido. Em produção ele é obrigatório: use CODIGO_MODO=teste para a versão de teste (o código aparece na tela).',
      );
    }
    return 'teste';
  }
  if (modo === 'teste') return 'teste';
  if (modo === 'sms') {
    throw new Error('CODIGO_MODO=sms: o envio do código por SMS ainda não foi implementado. Use CODIGO_MODO=teste.');
  }
  throw new Error(`CODIGO_MODO inválido: "${modo}". Use "teste" (o envio por "sms" ainda não existe).`);
}
