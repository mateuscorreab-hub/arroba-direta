import { Linking, Platform } from 'react-native';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { Texto } from '@/componentes/texto';

export type Permissao = { recurso: 'camera' | 'galeria'; podePedirDeNovo: boolean };

/** Explica como liberar a câmera ou as fotos quando a pessoa negou a permissão. */
export function AvisoPermissao({ permissao }: { permissao: Permissao }) {
  const ios = Platform.OS === 'ios';
  let texto: string;
  if (permissao.recurso === 'camera' && permissao.podePedirDeNovo) {
    texto = 'O app precisa da sua permissão para usar a câmera. Toque em "Tirar foto" de novo e escolha "Permitir".';
  } else if (permissao.recurso === 'camera') {
    texto = ios
      ? 'A câmera está bloqueada para o Arroba Direta. Para liberar, abra os Ajustes do iPhone, toque em Arroba Direta e ligue a Câmera.'
      : 'A câmera está bloqueada para o Arroba Direta. Para liberar, abra as Configurações do celular, toque em Apps, depois em Arroba Direta e em Permissões, e permita a Câmera.';
  } else {
    texto = ios
      ? 'As fotos estão bloqueadas para o Arroba Direta. Para liberar, abra os Ajustes do iPhone, toque em Arroba Direta, depois em Fotos, e escolha Acesso Total.'
      : 'As fotos estão bloqueadas para o Arroba Direta. Para liberar, abra as Configurações do celular, toque em Apps, depois em Arroba Direta e em Permissões, e permita Fotos e vídeos.';
  }
  return (
    <Aviso tipo="erro">
      <Texto>{texto}</Texto>
      {!permissao.podePedirDeNovo && (
        <Botao titulo="Abrir ajustes do celular" variante="secundario" onPress={() => Linking.openSettings().catch(() => {})} />
      )}
    </Aviso>
  );
}
