import { describe, expect, it } from 'vitest';
import { formatarReais } from './calculos.js';
import {
  dataEmbarqueValida,
  hojeEmBrasilia,
  mensagemCriarSchema,
  propostaCriarSchema,
  resumoProposta,
} from './negociacao.js';

describe('hojeEmBrasilia', () => {
  it('usa o horário de Brasília e não o UTC', () => {
    // 02:00 UTC do dia 15 ainda é 23:00 do dia 14 em Brasília.
    expect(hojeEmBrasilia(new Date('2026-11-15T02:00:00Z'))).toBe('2026-11-14');
    expect(hojeEmBrasilia(new Date('2026-11-15T03:00:00Z'))).toBe('2026-11-15');
  });
});

describe('dataEmbarqueValida', () => {
  const hoje = '2026-10-14';

  it('aceita hoje e datas futuras', () => {
    expect(dataEmbarqueValida('2026-10-14', hoje)).toBe(true);
    expect(dataEmbarqueValida('2026-11-15', hoje)).toBe(true);
    expect(dataEmbarqueValida('2027-01-02', hoje)).toBe(true);
  });

  it('recusa ontem', () => {
    expect(dataEmbarqueValida('2026-10-13', hoje)).toBe(false);
  });

  it.each([['14/10/2026'], ['2026-1-5'], ['2026-10-14T00:00:00Z'], [''], ['amanhã']])(
    'recusa o formato %s',
    (data) => {
      expect(dataEmbarqueValida(data, hoje)).toBe(false);
    },
  );

  it('recusa data que não existe', () => {
    expect(dataEmbarqueValida('2026-02-30', '2026-01-01')).toBe(false);
    expect(dataEmbarqueValida('2026-13-01', '2026-01-01')).toBe(false);
    expect(dataEmbarqueValida('2028-02-29', '2026-01-01')).toBe(true);
  });
});

describe('propostaCriarSchema', () => {
  const base = {
    preco: 2500,
    unidadePreco: 'cabeca',
    quantidade: 100,
    fretePorConta: 'comprador',
    dataEmbarque: '2026-11-15',
  };

  it('aceita proposta mínima e usa quebra 0 por padrão', () => {
    const r = propostaCriarSchema.parse(base);
    expect(r.quebraPercentual).toBe(0);
    expect(r.mensagem).toBeUndefined();
  });

  it('aceita os limites', () => {
    expect(propostaCriarSchema.safeParse({ ...base, preco: 10_000_000 }).success).toBe(true);
    expect(propostaCriarSchema.safeParse({ ...base, quantidade: 1 }).success).toBe(true);
    expect(propostaCriarSchema.safeParse({ ...base, quebraPercentual: 10 }).success).toBe(true);
    expect(propostaCriarSchema.safeParse({ ...base, mensagem: 'x'.repeat(1000) }).success).toBe(true);
  });

  it.each([
    ['preco', { preco: 0 }],
    ['preco', { preco: 10_000_000.01 }],
    ['unidadePreco', { unidadePreco: 'a_combinar' }],
    ['quantidade', { quantidade: 0 }],
    ['quantidade', { quantidade: 2.5 }],
    ['quebraPercentual', { quebraPercentual: -1 }],
    ['quebraPercentual', { quebraPercentual: 10.5 }],
    ['fretePorConta', { fretePorConta: 'ninguem' }],
    ['dataEmbarque', { dataEmbarque: '15/11/2026' }],
    ['dataEmbarque', { dataEmbarque: '2026-02-30' }],
    ['mensagem', { mensagem: 'x'.repeat(1001) }],
  ])('recusa %s inválido: %o', (campo, mudanca) => {
    const r = propostaCriarSchema.safeParse({ ...base, ...mudanca });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual([campo]);
  });

  it('dá mensagem amigável quando falta o preço', () => {
    const { preco: _, ...semPreco } = base;
    const r = propostaCriarSchema.safeParse(semPreco);
    expect(r.error?.issues[0]).toMatchObject({ path: ['preco'], message: 'Informe o preço' });
  });
});

describe('mensagemCriarSchema', () => {
  it('tira os espaços das pontas e exige texto', () => {
    expect(mensagemCriarSchema.parse({ texto: '  Bom dia  ' }).texto).toBe('Bom dia');
    expect(mensagemCriarSchema.safeParse({ texto: '   ' }).success).toBe(false);
  });

  it('aceita até 2000 letras', () => {
    expect(mensagemCriarSchema.safeParse({ texto: 'x'.repeat(2000) }).success).toBe(true);
    expect(mensagemCriarSchema.safeParse({ texto: 'x'.repeat(2001) }).success).toBe(false);
  });
});

describe('resumoProposta', () => {
  it('mostra preço e unidade', () => {
    expect(resumoProposta({ preco: 2500, unidadePreco: 'cabeca' })).toBe(
      `Proposta: ${formatarReais(2500)} por cabeça`,
    );
  });
});
