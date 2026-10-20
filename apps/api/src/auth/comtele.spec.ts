import { EnvioComtele } from './comtele.js';
import { ComteleFalsa } from './comtele-falsa.teste.js';
import { SmsRecusado, textoDoSms } from './envio-sms.js';

describe('EnvioComtele', () => {
  let comtele: ComteleFalsa;

  beforeAll(async () => {
    comtele = await new ComteleFalsa().subir();
  });
  afterAll(() => comtele.fechar());
  beforeEach(() => {
    comtele.recebidos.length = 0;
    comtele.falhas = [];
  });

  it('painel antigo: auth-key e o número com DDD, sem o 55', async () => {
    await new EnvioComtele({ chave: 'chave-antiga', rota: null, apiBase: comtele.base }).enviar(
      '+5567999990001',
      'Arroba Direta: oi',
    );
    expect(comtele.recebidos).toEqual([
      {
        caminho: '/api/v2/send',
        chave: 'chave-antiga',
        corpo: { Sender: 'login', Receivers: '67999990001', Content: 'Arroba Direta: oi' },
      },
    ]);
  });

  it('painel novo: x-api-key, o número com 55 e a rota', async () => {
    await new EnvioComtele({ chave: 'chave-nova', rota: 17, apiBase: comtele.base }).enviar(
      '+5567999990001',
      'Arroba Direta: oi',
    );
    expect(comtele.recebidos).toEqual([
      {
        caminho: '/messages/sms/send',
        chave: 'chave-nova',
        corpo: { receivers: [5567999990001], message: 'Arroba Direta: oi', route: 17, tag: 'login' },
      },
    ]);
  });

  it('recusa vira SmsRecusado com o motivo, sem a chave', async () => {
    const antiga = new EnvioComtele({ chave: 'segredo-da-chave', rota: null, apiBase: comtele.base });
    comtele.falhas = [{ status: 400, corpo: { Success: false, Message: 'é necessário ao menos 1 créditos.' } }];
    const recusa = antiga.enviar('+5567999990001', 'oi');
    await expect(recusa).rejects.toBeInstanceOf(SmsRecusado);
    await expect(recusa).rejects.toThrow('Comtele respondeu 400: é necessário ao menos 1 créditos.');
    // 200 com Success=false também é recusa.
    comtele.falhas = [{ status: 200, corpo: { Success: false, Message: 'Usuário desativado' } }];
    await expect(antiga.enviar('+5567999990001', 'oi')).rejects.toThrow('Comtele respondeu 200: Usuário desativado');
    comtele.falhas = [{ status: 401, corpo: null }];
    await expect(antiga.enviar('+5567999990001', 'oi')).rejects.toThrow(/^Comtele respondeu 401$/);
    comtele.falhas = [{ status: 401, corpo: null }];
    await expect(antiga.enviar('+5567999990001', 'oi')).rejects.toBeInstanceOf(SmsRecusado);

    const nova = new EnvioComtele({ chave: 'segredo-da-chave', rota: 3, apiBase: comtele.base });
    comtele.falhas = [{ status: 200, corpo: { hasError: true, message: 'Rota inválida', errors: ['route'] } }];
    const semRota = nova.enviar('+5567999990001', 'oi');
    await expect(semRota).rejects.toBeInstanceOf(SmsRecusado);
    await expect(semRota).rejects.toThrow('Comtele respondeu 200: Rota inválida route');
    comtele.falhas = [{ status: 500, corpo: { Success: false, Message: 'segredo-da-chave'.replace(/./g, 'x') } }];
    await expect(antiga.enviar('+5567999990001', 'oi')).rejects.not.toThrow(/segredo-da-chave/);
  });

  it('falha do lado da Comtele sem recusa clara não é SmsRecusado: o SMS pode ter saído', async () => {
    const antiga = new EnvioComtele({ chave: 'k', rota: null, apiBase: comtele.base });
    comtele.falhas = [{ status: 502, corpo: null }];
    const falha = antiga.enviar('+5567999990001', 'oi');
    await expect(falha).rejects.toThrow(/^Comtele respondeu 502$/);
    await expect(falha).rejects.not.toBeInstanceOf(SmsRecusado);
  });

  it('sem resposta, desiste em vez de travar o pedido de código', async () => {
    const fora = new EnvioComtele({ chave: 'k', rota: null, apiBase: 'http://127.0.0.1:9' });
    const semConexao = fora.enviar('+5567999990001', 'oi');
    await expect(semConexao).rejects.toThrow();
    await expect(semConexao).rejects.not.toBeInstanceOf(SmsRecusado);

    const lenta = new EnvioComtele({ chave: 'k', rota: null, apiBase: comtele.base }, 50);
    comtele.falhas = [{ status: 200, corpo: { Success: true }, atrasoMs: 2_000 }];
    const inicio = Date.now();
    const demorou = lenta.enviar('+5567999990001', 'oi');
    await expect(demorou).rejects.toThrow();
    await expect(demorou).rejects.not.toBeInstanceOf(SmsRecusado);
    expect(Date.now() - inicio).toBeLessThan(1_000);
  });

  it('o texto do SMS é curto, sem acento e leva o código', () => {
    const texto = textoDoSms('123456');
    expect(texto).toContain('123456');
    expect(texto.length).toBeLessThanOrEqual(160);
    expect(texto).toMatch(/^[\x20-\x7e]+$/);
  });
});
