/** Quem leva o código até o celular. Só existe com CODIGO_MODO=sms. */
export interface EnvioSms {
  /** Manda `texto` para `telefone` (+55DD9XXXXXXXX). Lança erro se o serviço recusar ou não responder. */
  enviar(telefone: string, texto: string): Promise<void>;
}

export const ENVIO_SMS = Symbol('ENVIO_SMS');

/**
 * Sem acento, como costuma ser SMS no Brasil: com acento a mensagem vai em Unicode, que nem toda
 * operadora mostra direito e cabe menos texto por crédito. Curto: um crédito só.
 */
export function textoDoSms(codigo: string): string {
  return `Arroba Direta: seu codigo de acesso e ${codigo}. Nao passe para ninguem.`;
}

/** Final do número, para o log: dá para achar a pessoa sem gravar o telefone inteiro. */
export function finalDoTelefone(telefone: string): string {
  return `…${telefone.slice(-4)}`;
}
