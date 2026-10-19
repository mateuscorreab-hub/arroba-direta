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
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'whatsapp' })).toThrow(/CODIGO_MODO inválido: "whatsapp"/);
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'SMS' })).toThrow(/CODIGO_MODO inválido/);
  });

  it('com SMS, exige CODIGO_SEGREDO longo e nunca repete o valor no erro', () => {
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'sms' })).toThrow(/CODIGO_MODO=sms precisa de CODIGO_SEGREDO/);
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'sms', CODIGO_SEGREDO: 'curto-demais' })).toThrow(
      /CODIGO_SEGREDO muito curto/,
    );
    expect(() => lerConfigEnvio({ CODIGO_MODO: 'sms', CODIGO_SEGREDO: 'curto-demais' })).not.toThrow(/curto-demais/);
    expect(lerConfigEnvio({ CODIGO_MODO: 'sms', CODIGO_SEGREDO: ` ${SEGREDO} ` })).toEqual({
      modo: 'sms',
      segredo: SEGREDO,
      limiteDiario: SMS_POR_DIA_PADRAO,
    });
  });

  it('sem CODIGO_SEGREDO na versão de teste, cria uma chave a cada vez que sobe', () => {
    const a = lerConfigEnvio({}).segredo;
    const b = lerConfigEnvio({}).segredo;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('lê o limite de SMS por dia', () => {
    expect(lerConfigEnvio({ CODIGO_SMS_POR_DIA: '50' }).limiteDiario).toBe(50);
    for (const ruim of ['0', '-3', '2.5', 'muitos']) {
      expect(() => lerConfigEnvio({ CODIGO_SMS_POR_DIA: ruim })).toThrow(/CODIGO_SMS_POR_DIA inválido/);
    }
  });
});
