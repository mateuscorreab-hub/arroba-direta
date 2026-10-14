import { describe, expect, it } from 'vitest';
import { comissao, distanciaKm, kgParaArroba, valorTotal } from './calculos.js';
import { loteCriarSchema } from './schemas.js';

describe('valorTotal', () => {
  it('calcula por cabeça', () => {
    expect(valorTotal({ unidade: 'cabeca', preco: 2500, quantidade: 100 })).toBe(250000);
  });

  it('calcula por arroba com quebra', () => {
    // 50 bois de 450 kg, quebra de 3% => 21.825 kg = 1.455 @ x R$ 300
    const v = valorTotal({
      unidade: 'arroba',
      preco: 300,
      quantidade: 50,
      pesoMedioKg: 450,
      quebraPercentual: 3,
    });
    expect(v).toBe(436500);
  });

  it('exige peso para preço por kg', () => {
    expect(() => valorTotal({ unidade: 'kg', preco: 14, quantidade: 10 })).toThrow();
  });
});

describe('comissao', () => {
  it('desconta 1,5% por padrão', () => {
    expect(comissao(250000)).toEqual({ valorComissao: 3750, valorVendedor: 246250 });
  });
});

describe('conversões e distância', () => {
  it('converte kg em arroba', () => {
    expect(kgParaArroba(450)).toBe(30);
  });

  it('mede Campo Grande a Cuiabá em torno de 560 km em linha reta', () => {
    const d = distanciaKm({ lat: -20.4697, lng: -54.6201 }, { lat: -15.601, lng: -56.0974 });
    expect(d).toBeGreaterThan(540);
    expect(d).toBeLessThan(580);
  });
});

describe('loteCriarSchema', () => {
  const base = {
    titulo: '100 bezerros Nelore desmamados',
    categoria: 'bezerro',
    raca: 'Nelore',
    sexo: 'macho',
    quantidade: 100,
    municipio: 'Campo Grande',
    uf: 'MS',
    lat: -20.47,
    lng: -54.62,
  };

  it('aceita lote por cabeça', () => {
    expect(loteCriarSchema.safeParse({ ...base, unidadePreco: 'cabeca', preco: 2500 }).success).toBe(true);
  });

  it('recusa preço por arroba sem peso médio', () => {
    const r = loteCriarSchema.safeParse({ ...base, unidadePreco: 'arroba', preco: 300 });
    expect(r.success).toBe(false);
  });
});
