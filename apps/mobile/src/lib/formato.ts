import { CATEGORIA_ROTULO, UNIDADE_PRECO_ROTULO, formatarReais, type Lote } from '@arroba/shared';

export function precoDoLote(l: Lote): string {
  if (l.unidadePreco === 'a_combinar' || l.preco === undefined) return 'A combinar';
  return `${formatarReais(l.preco)} ${UNIDADE_PRECO_ROTULO[l.unidadePreco]}`;
}

export function resumoDoLote(l: Lote): string {
  const partes = [`${l.quantidade} cab.`, CATEGORIA_ROTULO[l.categoria], l.raca];
  if (l.pesoMedioKg) partes.push(`~${l.pesoMedioKg} kg`);
  return partes.join(' · ');
}
