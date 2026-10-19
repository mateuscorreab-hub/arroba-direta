import { lerAprovacaoLotes } from './aprovacao-lotes.js';

describe('lerAprovacaoLotes', () => {
  it('usa "manual" quando a variável não existe ou está vazia', () => {
    expect(lerAprovacaoLotes({})).toBe('manual');
    expect(lerAprovacaoLotes({ APROVACAO_LOTES: '' })).toBe('manual');
    expect(lerAprovacaoLotes({ APROVACAO_LOTES: '  ' })).toBe('manual');
    expect(lerAprovacaoLotes({ NODE_ENV: 'production' })).toBe('manual');
  });

  it('aceita "manual" e "automatica"', () => {
    expect(lerAprovacaoLotes({ APROVACAO_LOTES: 'manual' })).toBe('manual');
    expect(lerAprovacaoLotes({ APROVACAO_LOTES: 'automatica' })).toBe('automatica');
    expect(lerAprovacaoLotes({ APROVACAO_LOTES: ' automatica ' })).toBe('automatica');
  });

  it('recusa valor desconhecido', () => {
    expect(() => lerAprovacaoLotes({ APROVACAO_LOTES: 'sim' })).toThrow(/APROVACAO_LOTES inválido: "sim"/);
    expect(() => lerAprovacaoLotes({ APROVACAO_LOTES: 'automática' })).toThrow(/APROVACAO_LOTES inválido/);
    expect(() => lerAprovacaoLotes({ APROVACAO_LOTES: 'MANUAL' })).toThrow(/APROVACAO_LOTES inválido/);
  });
});
