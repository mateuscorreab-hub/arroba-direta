import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Na web, recarregar ou fechar a aba no meio do envio perde o que falta: o navegador pergunta antes. */
export function useAvisarAoFechar(ativo: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !ativo) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [ativo]);
}
