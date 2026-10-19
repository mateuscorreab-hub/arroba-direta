import { Linking } from 'react-native';
import { linkWhatsApp } from '@arroba/shared';

/** Abre o WhatsApp ou a ligação. Devolve false se o aparelho não conseguir abrir. */
export async function abrirLink(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Conversa no WhatsApp com a mensagem já escrita, dizendo de qual lote é. */
export function whatsAppDoLote(telefone: string, titulo: string): string {
  return linkWhatsApp(telefone, `Olá! Vi o lote "${titulo}" no Arroba Direta.`);
}

export const DICA_SEGURANCA = 'Dica de segurança: não faça Pix adiantado. Pague só depois de ver o gado.';
