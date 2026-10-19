// "Fazer proposta" na tela do lote abre a conversa e, quando ela carrega, o formulário por cima.
// O pedido fica aqui, fora da URL, para o formulário não reabrir ao voltar ou recarregar a página.
const VALIDADE_MS = 60_000;
let pedido: { conversaId: string; em: number } | null = null;

export function abrirPropostaAoCarregar(conversaId: string) {
  pedido = { conversaId, em: Date.now() };
}

/** true uma vez só, se a conversa foi aberta pelo "Fazer proposta" há pouco. */
export function consumirAbrirProposta(conversaId: string): boolean {
  if (pedido?.conversaId !== conversaId) return false;
  const valido = Date.now() - pedido.em < VALIDADE_MS;
  pedido = null;
  return valido;
}
