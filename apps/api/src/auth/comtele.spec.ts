import { EnvioComtele } from './comtele.js';
import { ComteleFalsa } from './comtele-falsa.teste.js';
import { SmsRecusado, textoDoSms } from './envio-sms.js';

describe('EnvioComtele', () => {
  let comtele: ComteleFalsa;
  const com = (rota: number | null, chave = 'chave-da-comtele', esperaMs?: number) =>
    new EnvioComtele({ chave, rota, apiBase: comtele.base }, esperaMs);

  beforeAll(async () => {
    comtele = await new ComteleFalsa().subir();
  });
  afterAll(() => comtele.fechar());
  beforeEach(() => {
    comtele.recebidos.length = 0;
    comtele.falhas = [];
    comtele.consultasDeRotas = 0;
    comtele.rotas = ComteleFalsa.rotasPadrao();
  });

  it('manda com x-api-key, o número com 55 e a rota de COMTELE_ROTA', async () => {
    await com(21).enviar('+5567999990001', 'Arroba Direta: oi');
    expect(comtele.recebidos).toEqual([
      {
        caminho: '/messages/sms/send',
        chave: 'chave-da-comtele',
        corpo: { receivers: [5567999990001], message: 'Arroba Direta: oi', route: 21, tag: 'login' },
      },
    ]);
    expect(comtele.consultasDeRotas).toBe(0);
  });

  it('sem COMTELE_ROTA, pede a lista uma vez e usa a rota premium', async () => {
    const envio = com(null);
    await Promise.all([envio.enviar('+5567999990001', 'um'), envio.enviar('+5567999990002', 'dois')]);
    await envio.enviar('+5567999990003', 'três');
    expect(comtele.consultasDeRotas).toBe(1);
    expect(comtele.recebidos.map((r) => r.corpo.route)).toEqual([17, 17, 17]);
  });

  it('sem uma rota premium só, nenhum SMS sai e o erro lista as rotas; o próximo pedido tenta de novo', async () => {
    const envio = com(null);
    comtele.rotas = { status: 200, corpo: { hasError: false, object: [{ id: 3, displayName: 'Econômica', productName: 'SMS' }] } };
    const semPremium = envio.enviar('+5567999990001', 'oi');
    await expect(semPremium).rejects.toBeInstanceOf(SmsRecusado);
    await expect(semPremium).rejects.toThrow(/entre: 3 \(Econômica, SMS\)\. Ponha o número da rota certa em COMTELE_ROTA/);

    comtele.rotas = {
      status: 200,
      corpo: { object: [{ id: 5, displayName: 'Premium', productName: 'SMS' }, { id: 6, displayName: 'Premium 2', productName: 'SMS' }] },
    };
    await expect(envio.enviar('+5567999990001', 'oi')).rejects.toThrow(/entre: 5 \(Premium, SMS\); 6 \(Premium 2, SMS\)/);

    comtele.rotas = { status: 401, corpo: { hasError: true, message: 'Chave inválida', object: null } };
    const chaveErrada = envio.enviar('+5567999990001', 'oi');
    await expect(chaveErrada).rejects.toBeInstanceOf(SmsRecusado);
    await expect(chaveErrada).rejects.toThrow('Comtele não listou as rotas: respondeu 401: Chave inválida');
    expect(comtele.recebidos).toHaveLength(0);

    comtele.rotas = ComteleFalsa.rotasPadrao();
    await envio.enviar('+5567999990001', 'oi');
    expect(comtele.consultasDeRotas).toBe(4);
    expect(comtele.recebidos[0].corpo.route).toBe(17);
  });

  it('a lista de rotas que não responde também é SmsRecusado: nenhum SMS saiu', async () => {
    const fora = new EnvioComtele({ chave: 'k', rota: null, apiBase: 'http://127.0.0.1:9' });
    await expect(fora.enviar('+5567999990001', 'oi')).rejects.toBeInstanceOf(SmsRecusado);
  });

  it('recusa vira SmsRecusado com o motivo, sem a chave', async () => {
    const envio = com(17, 'segredo-da-chave');
    comtele.falhas = [{ status: 400, corpo: { hasError: true, message: 'é necessário ao menos 1 créditos.' } }];
    const recusa = envio.enviar('+5567999990001', 'oi');
    await expect(recusa).rejects.toBeInstanceOf(SmsRecusado);
    await expect(recusa).rejects.toThrow('Comtele respondeu 400: é necessário ao menos 1 créditos.');
    // 200 com hasError=true também é recusa.
    comtele.falhas = [{ status: 200, corpo: { hasError: true, message: 'Rota inválida', errors: ['route'] } }];
    const semRota = envio.enviar('+5567999990001', 'oi');
    await expect(semRota).rejects.toBeInstanceOf(SmsRecusado);
    await expect(semRota).rejects.toThrow('Comtele respondeu 200: Rota inválida route');
    comtele.falhas = [{ status: 401, corpo: null }];
    const semCorpo = envio.enviar('+5567999990001', 'oi');
    await expect(semCorpo).rejects.toBeInstanceOf(SmsRecusado);
    await expect(semCorpo).rejects.toThrow(/^Comtele respondeu 401$/);
    comtele.falhas = [{ status: 400, corpo: { hasError: true, message: 'x'.repeat(16) } }];
    await expect(envio.enviar('+5567999990001', 'oi')).rejects.not.toThrow(/segredo-da-chave/);
  });

  it('falha do lado da Comtele sem recusa clara não é SmsRecusado: o SMS pode ter saído', async () => {
    comtele.falhas = [{ status: 502, corpo: null }];
    const falha = com(17).enviar('+5567999990001', 'oi');
    await expect(falha).rejects.toThrow(/^Comtele respondeu 502$/);
    await expect(falha).rejects.not.toBeInstanceOf(SmsRecusado);
  });

  it('sem resposta ao envio, desiste em vez de travar o pedido de código', async () => {
    const fora = new EnvioComtele({ chave: 'k', rota: 17, apiBase: 'http://127.0.0.1:9' });
    const semConexao = fora.enviar('+5567999990001', 'oi');
    await expect(semConexao).rejects.toThrow();
    await expect(semConexao).rejects.not.toBeInstanceOf(SmsRecusado);

    comtele.falhas = [{ status: 200, corpo: { hasError: false }, atrasoMs: 2_000 }];
    const inicio = Date.now();
    const demorou = com(17, 'k', 50).enviar('+5567999990001', 'oi');
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
