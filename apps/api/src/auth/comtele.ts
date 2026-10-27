import { Logger } from '@nestjs/common';
import type { ConfigComtele } from './config-envio.js';
import { SmsRecusado, type EnvioSms } from './envio-sms.js';

const ESPERA_MS = 10_000;

/**
 * SMS pela Comtele (só envia para o Brasil), pela API do painel portal.comtele.com.br: cabeçalho
 * x-api-key, número com 55 e o id da rota. Documentação: developers.comtele.com.br.
 */
export class EnvioComtele implements EnvioSms {
  private readonly logger = new Logger('Login');
  private rota: Promise<number> | null;

  constructor(
    private readonly cfg: ConfigComtele,
    private readonly esperaMs = ESPERA_MS,
  ) {
    this.rota = cfg.rota === null ? null : Promise.resolve(cfg.rota);
  }

  async enviar(telefone: string, texto: string): Promise<void> {
    const route = await this.rotaDeEnvio();
    const res = await fetch(`${this.cfg.apiBase}/messages/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.cfg.chave },
      body: JSON.stringify({ receivers: [Number(telefone.replace(/^\+/, ''))], message: texto, route, tag: 'login' }),
      signal: AbortSignal.timeout(this.esperaMs),
    });
    const corpo = (await res.json().catch(() => null)) as Resposta<unknown> | null;
    // 200 com hasError=true também é recusa: falta de crédito, por exemplo.
    const recusou = corpo?.hasError === true;
    if (res.ok && !recusou) return;
    const erro = `Comtele respondeu ${res.status}${motivo(corpo)}`;
    // 5xx sem recusa explícita: a Comtele pode ter mandado antes de falhar.
    if (recusou || res.status < 500) throw new SmsRecusado(erro);
    throw new Error(erro);
  }

  /**
   * O painel da Comtele não mostra o id da rota, então sem COMTELE_ROTA a API pede a lista na primeira
   * vez e guarda a premium. Se não der, nenhum SMS sai (SmsRecusado) e o próximo pedido tenta de novo.
   */
  private rotaDeEnvio(): Promise<number> {
    this.rota ??= this.buscarRotaPremium().catch((e: unknown) => {
      this.rota = null;
      throw e instanceof SmsRecusado ? e : new SmsRecusado(`Comtele não listou as rotas: ${(e as Error).message}`);
    });
    return this.rota;
  }

  private async buscarRotaPremium(): Promise<number> {
    const res = await fetch(`${this.cfg.apiBase}/routes`, {
      headers: { 'x-api-key': this.cfg.chave },
      signal: AbortSignal.timeout(this.esperaMs),
    });
    const corpo = (await res.json().catch(() => null)) as Resposta<Rota[]> | null;
    const rotas = Array.isArray(corpo?.object) ? corpo.object : null;
    if (!res.ok || !rotas) throw new SmsRecusado(`Comtele não listou as rotas: respondeu ${res.status}${motivo(corpo)}`);

    const premium = rotas.filter((r) => /premium/i.test(`${r.displayName ?? ''} ${r.productName ?? ''}`));
    const id = Number(premium[0]?.id);
    if (premium.length !== 1 || !Number.isInteger(id) || id < 1) {
      const lista = rotas.map((r) => `${r.id} (${r.displayName ?? '?'}, ${r.productName ?? '?'})`).join('; ');
      throw new SmsRecusado(
        `Não deu para escolher a rota premium da Comtele entre: ${lista || 'nenhuma rota'}. ` +
          'Ponha o número da rota certa em COMTELE_ROTA.',
      );
    }
    this.logger.log(`Rota da Comtele: ${id} (${premium[0].displayName ?? premium[0].productName})`);
    return id;
  }
}

interface Resposta<T> {
  hasError?: boolean;
  message?: string;
  errors?: string[];
  object?: T;
}

interface Rota {
  id: number | string;
  displayName?: string;
  productName?: string;
}

function motivo(corpo: Resposta<unknown> | null): string {
  const texto = [corpo?.message, ...(corpo?.errors ?? [])].filter(Boolean).join(' ');
  return texto ? `: ${texto.slice(0, 200)}` : '';
}
