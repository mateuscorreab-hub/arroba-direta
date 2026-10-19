import {
  CATEGORIA_ROTULO,
  UNIDADE_PRECO_ROTULO,
  formatarReais,
  type Lote,
  type PapelNegociacao,
  type StatusLote,
  type UnidadePreco,
  type UnidadeProposta,
} from '@arroba/shared';

/** Serve para o lote completo e para o resumo que vem nas conversas. */
export function precoDoLote(l: { unidadePreco: UnidadePreco; preco?: number | null }): string {
  if (l.unidadePreco === 'a_combinar' || l.preco == null) return 'A combinar';
  return `${formatarReais(l.preco)} ${UNIDADE_PRECO_ROTULO[l.unidadePreco]}`;
}

export function precoDaProposta(p: { preco: number; unidadePreco: UnidadeProposta }): string {
  return `${formatarReais(p.preco)} ${UNIDADE_PRECO_ROTULO[p.unidadePreco]}`;
}

/** Por que o lote fora da busca não aceita proposta, para o comprador ou para o próprio vendedor. */
export function motivoIndisponivel(status: StatusLote, papel: PapelNegociacao = 'comprador'): string {
  const vendedor = papel === 'vendedor';
  if (status === 'vendido') return vendedor ? 'Você marcou este lote como vendido.' : 'Este lote já foi vendido.';
  if (status === 'encerrado') {
    return vendedor
      ? 'Você pausou este anúncio. Reative na tela do lote para voltar a negociar.'
      : 'O vendedor pausou este anúncio. Por enquanto não dá para fazer propostas.';
  }
  if (status === 'em_analise') {
    return vendedor
      ? 'Seu anúncio está em revisão. Vocês voltam a negociar quando ele for aprovado.'
      : 'O anúncio está em revisão. Ele volta a aceitar propostas depois de aprovado.';
  }
  return 'Este lote não está mais disponível para negociação.';
}

export function cabecas(n: number): string {
  return `${n} ${n === 1 ? 'cabeça' : 'cabeças'}`;
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

/** Formata a data enquanto a pessoa digita: 15112026 vira 15/11/2026. */
export function mascararData(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "15/11/2026" vira "2026-11-15"; null se a data não estiver completa. */
export function dataDoCampo(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "2026-11-15" vira "15/11/2026". */
export function formatarData(data: string): string {
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Dia e hora no relógio do aparelho: "14/10 às 09:32". */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/**
 * Lê um número do jeito que a pessoa digita: "2.600,50", "2600", "18,5" ou "18.5".
 * Vazio vira undefined; texto que não é número vira NaN (a validação avisa).
 */
export function lerNumero(texto: string): number | undefined {
  let s = texto.replace(/R\$|\s/g, '');
  if (s === '') return undefined;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

/** Número para preencher um campo: 18.5 vira "18,5". */
export function numeroParaCampo(n: number): string {
  return String(n).replace('.', ',');
}

/** 45 s, 1 min, 1 min 20 s. */
export function duracaoTexto(segundos: number): string {
  const total = Math.round(segundos);
  if (total < 60) return `${total} s`;
  const resto = total % 60;
  return `${Math.floor(total / 60)} min${resto ? ` ${resto} s` : ''}`;
}

/** 0,4 MB, 12,5 MB. */
export function tamanhoTexto(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
