/**
 * Como um lote anunciado entra na busca. "manual": fica em análise até alguém aprovar.
 * "automatica": já entra ativo, para dar para testar a negociação na versão de teste.
 */
export type AprovacaoLotes = 'automatica' | 'manual';

export const APROVACAO_LOTES = Symbol('APROVACAO_LOTES');

/** Lê APROVACAO_LOTES (padrão "manual"). Lança erro (e a API não sobe) se o valor for inválido. */
export function lerAprovacaoLotes(env: Record<string, string | undefined> = process.env): AprovacaoLotes {
  const valor = env.APROVACAO_LOTES?.trim();
  if (!valor) return 'manual';
  if (valor === 'automatica' || valor === 'manual') return valor;
  throw new Error(
    `APROVACAO_LOTES inválido: "${valor}". Use "manual" (o lote fica em análise) ou "automatica" (o lote já entra na busca).`,
  );
}
