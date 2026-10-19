/** Quem leva o código até o celular. Só existe com CODIGO_MODO=sms. */
export interface EnvioSms {
  /** Manda `texto` para `telefone` (+55DD9XXXXXXXX). Lança erro se o serviço recusar ou não responder. */
  enviar(telefone: string, texto: string): Promise<void>;
}

export const ENVIO_SMS = Symbol('ENVIO_SMS');

/**
 * Com "ó" e "ã" o SMS vai em Unicode, que cabe 70 caracteres por mensagem, e cada parte a mais é
 * cobrada. Este texto tem menos de 70: uma mensagem só.
 */
export function textoDoSms(codigo: string): string {
  return `Arroba Direta: seu código é ${codigo}. Não passe para ninguém.`;
}

/** Final do número, para o log: dá para achar a pessoa sem gravar o telefone inteiro. */
export function finalDoTelefone(telefone: string): string {
  return `…${telefone.slice(-4)}`;
}
