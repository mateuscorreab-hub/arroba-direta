import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SmsRecebido {
  caminho: string;
  chave: string | undefined;
  corpo: Record<string, unknown>;
}

/** Comtele de mentira para os testes: guarda o que chegou e responde como a API dela. */
export class ComteleFalsa {
  /** Os SMS pedidos (POST /messages/sms/send). */
  readonly recebidos: SmsRecebido[] = [];
  /** Próximas respostas ao envio: status HTTP, corpo e quanto demora para responder. Vazio: sucesso na hora. */
  falhas: { status: number; corpo: unknown; atrasoMs?: number }[] = [];
  /** Quantas vezes pediram a lista de rotas (GET /routes) e o que ela devolve. */
  consultasDeRotas = 0;
  rotas: { status: number; corpo: unknown } = ComteleFalsa.rotasPadrao();
  base = '';
  private servidor?: Server;

  static rotasPadrao() {
    return {
      status: 200,
      corpo: {
        hasError: false,
        message: '',
        totalRecords: 2,
        errors: [],
        object: [
          { id: 3, displayName: 'Econômica', farePrice: 0.07, productName: 'SMS', productId: 1, replyFarePrice: 0 },
          { id: 17, displayName: 'Premium', farePrice: 0.12, productName: 'SMS', productId: 1, replyFarePrice: 0 },
        ],
      },
    };
  }

  async subir(): Promise<this> {
    this.servidor = createServer((req, res) => {
      let texto = '';
      req.on('data', (c: Buffer) => (texto += c.toString()));
      req.on('end', () => {
        const caminho = req.url ?? '';
        const responder = (status: number, corpo: unknown) => {
          if (res.destroyed) return;
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(corpo));
        };
        if (req.method === 'GET' && caminho === '/routes') {
          this.consultasDeRotas++;
          return responder(this.rotas.status, this.rotas.corpo);
        }
        const chave = req.headers['x-api-key'] as string | undefined;
        this.recebidos.push({ caminho, chave, corpo: JSON.parse(texto || '{}') });
        const falha = this.falhas.shift();
        const corpo = falha ? falha.corpo : { hasError: false, message: 'ok', totalRecords: 1, errors: [], object: null };
        setTimeout(() => responder(falha?.status ?? 200, corpo), falha?.atrasoMs ?? 0);
      });
    });
    await new Promise<void>((ok) => this.servidor!.listen(0, '127.0.0.1', ok));
    this.base = `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
    return this;
  }

  /** O código de 6 números do último SMS mandado para `telefone` (+55...). */
  codigoPara(telefone: string): string | undefined {
    const numero = Number(telefone.replace(/^\+/, ''));
    const sms = this.recebidos.findLast((r) => (r.corpo.receivers as number[] | undefined)?.[0] === numero);
    return /\b(\d{6})\b/.exec(String(sms?.corpo.message ?? ''))?.[1];
  }

  async fechar() {
    this.servidor?.closeAllConnections();
    await new Promise((ok) => this.servidor?.close(ok));
  }
}
