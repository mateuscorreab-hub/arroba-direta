import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SmsRecebido {
  caminho: string;
  chave: string | undefined;
  corpo: Record<string, unknown>;
}

/** Comtele de mentira para os testes: guarda o que chegou e responde como as duas APIs dela. */
export class ComteleFalsa {
  readonly recebidos: SmsRecebido[] = [];
  /** Próximas respostas: status HTTP, corpo e quanto demora para responder. Vazio: sucesso na hora. */
  falhas: { status: number; corpo: unknown; atrasoMs?: number }[] = [];
  base = '';
  private servidor?: Server;

  async subir(): Promise<this> {
    this.servidor = createServer((req, res) => {
      let texto = '';
      req.on('data', (c: Buffer) => (texto += c.toString()));
      req.on('end', () => {
        const caminho = req.url ?? '';
        const chave = (req.headers['auth-key'] ?? req.headers['x-api-key']) as string | undefined;
        this.recebidos.push({ caminho, chave, corpo: JSON.parse(texto || '{}') });
        const falha = this.falhas.shift();
        const novo = caminho === '/messages/sms/send';
        const corpo = falha
          ? falha.corpo
          : novo
            ? { hasError: false, message: 'ok', totalRecords: 1, errors: [], object: null }
            : { Success: true, Object: { requestUniqueId: 'teste' }, Message: 'A requisicao de envio foi encaminhada.' };
        setTimeout(() => {
          if (res.destroyed) return;
          res.writeHead(falha?.status ?? 200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(corpo));
        }, falha?.atrasoMs ?? 0);
      });
    });
    await new Promise<void>((ok) => this.servidor!.listen(0, '127.0.0.1', ok));
    this.base = `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
    return this;
  }

  /** O código de 6 números do último SMS mandado para `telefone` (+55...). */
  codigoPara(telefone: string): string | undefined {
    const semMais = telefone.replace(/^\+/, '');
    const sms = this.recebidos.findLast(
      (r) => r.corpo.Receivers === semMais.slice(2) || (r.corpo.receivers as number[] | undefined)?.[0] === Number(semMais),
    );
    const texto = String(sms?.corpo.Content ?? sms?.corpo.message ?? '');
    return /\b(\d{6})\b/.exec(texto)?.[1];
  }

  async fechar() {
    this.servidor?.closeAllConnections();
    await new Promise((ok) => this.servidor?.close(ok));
  }
}
