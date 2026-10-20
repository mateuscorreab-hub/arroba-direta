import { lerConfigEnvio, SMS_POR_DIA_PADRAO } from './config-envio.js';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';

describe('lerConfigEnvio', () => {
  it('usa "teste" fora de produção quando a variável não existe', () => {
    expect(lerConfigEnvio({}).modo).toBe('teste');
    expect(lerConfigEnvio({ NODE_ENV: 'development' }).modo).toBe('teste');
    expect(lerConfigEnvio({ NODE_ENV: 'test', CODIGO_MODO: '' }).modo).toBe('teste');
  });

  it('aceita "teste" explícito, inclusive em produção', () => {
    expect(lerConfigEnvio({ CODIGO_MODO: 'teste' }).modo).toBe('teste');
    expect(lerConfigEnvio({ NODE_ENV: 'production', CODIGO_MODO: 'teste' }).modo).toBe('teste');
  });

  it('exige a variável em produção', () => {
    expect(() => lerConfigEnvio({ NODE_ENV: 'production' })).toThrow(/CODIGO_MODO não definido/);
    expect(() => lerConfigEnvio({ NODE_ENV: 'production', CODIGO_MODO: ' ' })).toThrow(/CODIGO_MODO não definido/);
  });

  it('recusa valor desconhecido', () => {
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'whatsapp' })).toThrow(/CODIGO_MODO inválido/);
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'whatsapp' })).not.toThrow(/whatsapp/);
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'SMS' })).toThrow(/CODIGO_MODO inválido/);
  });

  it('com SMS, exige CODIGO_SEGREDO longo e nunca repete o valor no erro', () => {
    const sms = { CODIGO_MODO: 'sms', COMTELE_API_KEY: 'chave-da-comtele' };
    expect(() => lerConfigEnvio(sms)).toThrow(/CODIGO_MODO=sms precisa de CODIGO_SEGREDO/);
    expect(() => lerConfigEnvio({ ...sms, CODIGO_SEGREDO: 'curto-demais' })).toThrow(/CODIGO_SEGREDO muito curto/);
    expect(() => lerConfigEnvio({ ...sms, CODIGO_SEGREDO: 'curto-demais' })).not.toThrow(/curto-demais/);
    expect(lerConfigEnvio({ ...sms, CODIGO_SEGREDO: ` ${SEGREDO} ` })).toEqual({
      modo: 'sms',
      segredo: SEGREDO,
      limiteDiario: SMS_POR_DIA_PADRAO,
      comtele: { chave: 'chave-da-comtele', rota: null, apiBase: 'https://sms.comtele.com.br' },
    });
  });

  it('com SMS, exige a chave da Comtele e usa a API do painel novo quando há rota', () => {
    const sms = { CODIGO_MODO: 'sms', CODIGO_SEGREDO: SEGREDO };
    expect(() => lerConfigEnvio(sms)).toThrow(/CODIGO_MODO=sms precisa de COMTELE_API_KEY \(fica no painel da Comtele/);
    expect(() => lerConfigEnvio({ ...sms, COMTELE_API_KEY: 'abc def' })).toThrow(/COMTELE_API_KEY inválida/);
    expect(() => lerConfigEnvio({ ...sms, COMTELE_API_KEY: 'abc def' })).not.toThrow(/abc def/);
    const novo = lerConfigEnvio({ ...sms, COMTELE_API_KEY: 'k', COMTELE_ROTA: ' 17 ' });
    expect(novo.modo === 'sms' && novo.comtele).toEqual({ chave: 'k', rota: 17, apiBase: 'https://api.comtele.com.br' });
    for (const ruim of ['0', 'premium', '1.5']) {
      expect(() => lerConfigEnvio({ ...sms, COMTELE_API_KEY: 'k', COMTELE_ROTA: ruim })).toThrow(/COMTELE_ROTA inválida/);
      expect(() => lerConfigEnvio({ ...sms, COMTELE_API_KEY: 'k', COMTELE_ROTA: ruim })).not.toThrow(ruim);
    }
    const falsa = lerConfigEnvio({ ...sms, COMTELE_API_KEY: 'k', COMTELE_API_BASE: 'http://127.0.0.1:9/' });
    expect(falsa.modo === 'sms' && falsa.comtele.apiBase).toBe('http://127.0.0.1:9');
  });

  it('na versão de teste ignora a chave da Comtele (dá para pôr a chave antes de ligar o SMS)', () => {
    expect(lerConfigEnvio({ CODIGO_MODO: 'teste', COMTELE_API_KEY: 'k' })).not.toHaveProperty('comtele');
  });

  it('sem CODIGO_SEGREDO na versão de teste, cria uma chave a cada vez que sobe', () => {
    const a = lerConfigEnvio({}).segredo;
    const b = lerConfigEnvio({}).segredo;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('lê o limite de SMS por dia', () => {
    expect(lerConfigEnvio({ CODIGO_SMS_POR_DIA: '50' }).limiteDiario).toBe(50);
    expect(lerConfigEnvio({ CODIGO_SMS_POR_DIA: ' 1000 ' }).limiteDiario).toBe(1000);
    for (const ruim of ['0', '-3', '2.5', 'muitos', '1.000', '1e3', '0x10']) {
      expect(() => lerConfigEnvio({ CODIGO_SMS_POR_DIA: ruim })).toThrow(/CODIGO_SMS_POR_DIA inválido/);
      expect(() => lerConfigEnvio({ CODIGO_SMS_POR_DIA: ruim })).not.toThrow(`"${ruim}"`);
    }
  });
});
