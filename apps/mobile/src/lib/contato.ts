import { Linking } from 'react-native';
import { linkWhatsApp, type PapelNegociacao } from '@arroba/shared';

/** Abre o WhatsApp ou a ligação. Devolve false se o aparelho não conseguir abrir. */
export async function abrirLink(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Conversa no WhatsApp com a mensagem já escrita, dizendo de qual lote é e quem está chamando. */
export function whatsAppDoLote(telefone: string, titulo: string, papel: PapelNegociacao = 'comprador'): string {
  const mensagem =
    papel === 'comprador'
      ? `Olá! Vi o lote "${titulo}" no Arroba Direta.`
      : `Olá! Sou o vendedor do lote "${titulo}", do Arroba Direta.`;
  return linkWhatsApp(telefone, mensagem);
}

/** Cada lado corre um risco diferente quando o pagamento é direto entre os dois. */
export const DICA_SEGURANCA: Record<PapelNegociacao, string> = {
  comprador: 'Dica de segurança: não faça Pix adiantado. Pague só depois de ver o gado.',
  vendedor: 'Dica de segurança: só embarque o gado depois de ver o pagamento na sua conta.',
};
