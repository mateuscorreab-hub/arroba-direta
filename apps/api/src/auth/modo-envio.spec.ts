import { lerModoEnvio } from './modo-envio.js';

describe('lerModoEnvio', () => {
  it('usa "teste" fora de produção quando a variável não existe', () => {
    expect(lerModoEnvio({})).toBe('teste');
    expect(lerModoEnvio({ NODE_ENV: 'development' })).toBe('teste');
    expect(lerModoEnvio({ NODE_ENV: 'test', CODIGO_MODO: '' })).toBe('teste');
  });

  it('aceita "teste" explícito, inclusive em produção', () => {
    expect(lerModoEnvio({ CODIGO_MODO: 'teste' })).toBe('teste');
    expect(lerModoEnvio({ NODE_ENV: 'production', CODIGO_MODO: 'teste' })).toBe('teste');
  });

  it('exige a variável em produção', () => {
    expect(() => lerModoEnvio({ NODE_ENV: 'production' })).toThrow(/CODIGO_MODO não definido/);
    expect(() => lerModoEnvio({ NODE_ENV: 'production', CODIGO_MODO: ' ' })).toThrow(/CODIGO_MODO não definido/);
  });

  it('recusa "sms" porque o envio ainda não existe', () => {
    expect(() => lerModoEnvio({ CODIGO_MODO: 'sms' })).toThrow(/SMS ainda não foi implementado/);
    expect(() => lerModoEnvio({ NODE_ENV: 'production', CODIGO_MODO: 'sms' })).toThrow(
      /SMS ainda não foi implementado/,
    );
  });

  it('recusa valor desconhecido', () => {
    expect(() => lerModoEnvio({ CODIGO_MODO: 'whatsapp' })).toThrow(/CODIGO_MODO inválido: "whatsapp"/);
    expect(() => lerModoEnvio({ CODIGO_MODO: 'TESTE' })).toThrow(/CODIGO_MODO inválido/);
  });
});
