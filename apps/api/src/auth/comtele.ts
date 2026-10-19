import type { ConfigComtele } from './config-envio.js';
import type { EnvioSms } from './envio-sms.js';

const ESPERA_MS = 10_000;

/**
 * SMS pela Comtele (só envia para o Brasil). Há duas APIs, uma para cada painel da Comtele:
 * - painel antigo (sms.comtele.com.br): POST /api/v2/send, cabeçalho auth-key, número com DDD sem o 55;
 * - painel novo (portal.comtele.com.br): POST /messages/sms/send, cabeçalho x-api-key, número com 55 e
 *   o id da rota (COMTELE_ROTA).
 * Documentação: docs.comtele.com.br (antigo) e developers.comtele.com.br (novo).
 */
export class EnvioComtele implements EnvioSms {
  constructor(private readonly cfg: ConfigComtele) {}

  async enviar(telefone: string, texto: string): Promise<void> {
    const comPais = telefone.replace(/^\+/, '');
    const novo = this.cfg.rota !== null;
    const res = await fetch(`${this.cfg.apiBase}${novo ? '/messages/sms/send' : '/api/v2/send'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [novo ? 'x-api-key' : 'auth-key']: this.cfg.chave },
      body: JSON.stringify(
        novo
          ? { receivers: [Number(comPais)], message: texto, route: this.cfg.rota, tag: 'login' }
          : { Sender: 'login', Receivers: comPais.slice(2), Content: texto },
      ),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    const corpo = (await res.json().catch(() => null)) as Resposta | null;
    // 200 com Success=false (antigo) ou hasError=true (novo) também é recusa: falta de crédito, por exemplo.
    if (res.ok && corpo?.Success !== false && corpo?.hasError !== true) return;
    const motivo = [corpo?.Message, corpo?.message, ...(corpo?.errors ?? [])].filter(Boolean).join(' ');
    throw new Error(`Comtele respondeu ${res.status}${motivo ? `: ${motivo.slice(0, 200)}` : ''}`);
  }
}

interface Resposta {
  Success?: boolean;
  Message?: string;
  hasError?: boolean;
  message?: string;
  errors?: string[];
}
