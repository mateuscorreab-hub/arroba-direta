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

/**
 * Formata o celular enquanto a pessoa digita: 67999990001 vira (67) 99999-0001.
 * Tira o +55 e o zero antes do DDD que vêm quando o número é colado ou preenchido pelo celular.
 */
export function mascararTelefone(texto: string): string {
  let d = texto.replace(/\D/g, '').replace(/^0+/, '');
  // Só é o +55 do país com o "+" ou com 13 dígitos; senão pode ser o DDD 55 com um dígito a mais.
  if (d.startsWith('55') && (d.length >= 13 || (d.length > 11 && texto.includes('+')))) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d && `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
