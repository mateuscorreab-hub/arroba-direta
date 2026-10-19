import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Botao } from '@/componentes/botao';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import type { Escolha } from '@/hooks/use-escolha-midia';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  aoEscolher: (acao: Escolha) => void;
  /** O botão tocado, enquanto o celular prepara os arquivos escolhidos. */
  preparando: Escolha | null;
  /** Envio desligado ou travado: botões apagados e sem as contas do que cabe. */
  desabilitado: boolean;
  fotosRestantes: number;
  podeVideo: boolean;
  /** Texto quando não cabe mais foto. */
  semLugarFoto: string;
  /** Texto quando já tem vídeo. */
  semLugarVideo: string;
};

/** "Escolher fotos", "Tirar foto" (só no celular) e "Escolher vídeo", com o que ainda cabe no lote. */
export function BotoesEscolha({
  aoEscolher,
  preparando,
  desabilitado,
  fotosRestantes,
  podeVideo,
  semLugarFoto,
  semLugarVideo,
}: Props) {
  const tema = useTheme();
  return (
    <>
      <View style={estilos.bloco}>
        <Botao
          titulo="Escolher fotos"
          onPress={() => aoEscolher('fotos')}
          carregando={preparando === 'fotos'}
          desabilitado={desabilitado || fotosRestantes === 0 || preparando !== null}
        />
        {Platform.OS !== 'web' && (
          <Botao
            titulo="Tirar foto"
            variante="secundario"
            onPress={() => aoEscolher('camera')}
            carregando={preparando === 'camera'}
            desabilitado={desabilitado || fotosRestantes === 0 || preparando !== null}
          />
        )}
        {!desabilitado && (
          <Texto tipo="pequeno" cor="textSecondary">
            {fotosRestantes === 0
              ? semLugarFoto
              : fotosRestantes === 1
                ? 'Cabe mais 1 foto.'
                : `Cabem mais ${fotosRestantes} fotos.`}
          </Texto>
        )}
      </View>
      <View style={estilos.bloco}>
        <Botao
          titulo="Escolher vídeo"
          variante="secundario"
          onPress={() => aoEscolher('video')}
          carregando={preparando === 'video'}
          desabilitado={desabilitado || !podeVideo || preparando !== null}
        />
        {!desabilitado && !podeVideo && (
          <Texto tipo="pequeno" cor="textSecondary">
            {semLugarVideo}
          </Texto>
        )}
      </View>

      {preparando && (
        <View style={estilos.preparando}>
          <ActivityIndicator color={tema.brand} />
          <Texto cor="textSecondary" accessibilityLiveRegion="polite" style={estilos.flex}>
            {`Preparando ${{ fotos: 'as fotos', camera: 'a foto', video: 'o vídeo' }[preparando]}… Isso pode levar um pouco.`}
          </Texto>
        </View>
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: Spacing.two },
  preparando: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
});
