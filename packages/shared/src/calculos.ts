import type { UnidadePreco } from './dominio.js';

/** 1 arroba = 15 kg. */
export const KG_POR_ARROBA = 15;

export function kgParaArroba(kg: number): number {
  return kg / KG_POR_ARROBA;
}

export function arrobaParaKg(arrobas: number): number {
  return arrobas * KG_POR_ARROBA;
}

/** Arredonda para centavos, evitando erros de ponto flutuante. */
export function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export interface EntradaValorTotal {
  unidade: Exclude<UnidadePreco, 'a_combinar'>;
  preco: number;
  quantidade: number;
  /** Peso médio por cabeça em kg. Obrigatório para preço por kg ou arroba. */
  pesoMedioKg?: number;
  /** Quebra combinada em % (desconto de peso por jejum/transporte). */
  quebraPercentual?: number;
}

/**
 * Valor total de um negócio a partir do preço e da unidade combinada.
 * Para kg e arroba, aplica a quebra sobre o peso total.
 */
export function valorTotal(e: EntradaValorTotal): number {
  if (e.quantidade <= 0) throw new Error('quantidade deve ser maior que zero');
  if (e.preco < 0) throw new Error('preço não pode ser negativo');
  if (e.unidade === 'cabeca') return centavos(e.preco * e.quantidade);

  if (!e.pesoMedioKg || e.pesoMedioKg <= 0) {
    throw new Error('peso médio é obrigatório para preço por kg ou arroba');
  }
  const quebra = e.quebraPercentual ?? 0;
  if (quebra < 0 || quebra >= 100) throw new Error('quebra deve estar entre 0 e 100');

  const pesoLiquidoKg = e.pesoMedioKg * e.quantidade * (1 - quebra / 100);
  const unidades = e.unidade === 'kg' ? pesoLiquidoKg : kgParaArroba(pesoLiquidoKg);
  return centavos(e.preco * unidades);
}

/** Distância em km entre dois pontos (fórmula de haversine). */
export function distanciaKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatarReais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}
