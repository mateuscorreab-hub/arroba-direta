import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { MAX_FOTOS_LOTE } from '@arroba/shared';

import type { Permissao } from '@/componentes/aviso-permissao';
import {
  escolherFotos,
  escolherVideo,
  tirarFoto,
  type ArquivoEscolhido,
  type ResultadoEscolha,
} from '@/lib/escolher-midia';

export type Escolha = 'fotos' | 'camera' | 'video';
export type AvisoEscolha = { tipo: 'info' | 'erro'; texto: string };

/**
 * Abre a galeria ou a câmera pelos botões de BotoesEscolha. Guarda o "Preparando…" do botão tocado e a
 * permissão negada (para o AvisoPermissao).
 */
export function useEscolhaMidia() {
  const [preparando, setPreparando] = useState<Escolha | null>(null);
  const [permissao, setPermissao] = useState<Permissao | null>(null);
  const abrindo = useRef(false);

  /** Os arquivos que cabem (até fotosRestantes fotos, ou 1 vídeo) e o aviso para mostrar, se houver. */
  async function escolher(
    acao: Escolha,
    fotosRestantes: number,
  ): Promise<{ arquivos: ArquivoEscolhido[]; aviso: AvisoEscolha | null }> {
    const nada = { arquivos: [], aviso: null };
    // Na web o seletor nem sempre avisa quando a pessoa desiste; lá o botão não pode ficar travado.
    if (abrindo.current) return nada;
    setPermissao(null);
    // O seletor abre já no toque, antes de qualquer await (exigência do navegador).
    const pedido =
      acao === 'fotos' ? escolherFotos(fotosRestantes) : acao === 'camera' ? tirarFoto() : escolherVideo();
    // No celular, depois de escolher, o seletor ainda prepara os arquivos (comprime, baixa do iCloud) com a
    // tela parada: o botão mostra que está trabalhando.
    abrindo.current = Platform.OS !== 'web';
    if (abrindo.current) setPreparando(acao);
    let r: ResultadoEscolha;
    try {
      r = await pedido;
    } finally {
      abrindo.current = false;
      setPreparando(null);
    }
    if (r.tipo === 'sem-permissao') {
      setPermissao(r);
      return nada;
    }
    if (r.tipo === 'erro') return { arquivos: [], aviso: { tipo: 'erro', texto: r.mensagem } };
    if (r.tipo !== 'ok') return nada;
    if (acao === 'video') return { arquivos: r.arquivos.slice(0, 1), aviso: null };
    const fora = r.arquivos.length - fotosRestantes;
    return {
      arquivos: r.arquivos.slice(0, fotosRestantes),
      aviso:
        fora > 0
          ? {
              tipo: 'info',
              texto: `O lote aceita até ${MAX_FOTOS_LOTE} fotos. ${fora === 1 ? 'Uma foto ficou' : `${fora} fotos ficaram`} de fora.`,
            }
          : null,
    };
  }

  return { preparando, permissao, escolher };
}
