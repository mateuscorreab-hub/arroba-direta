import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { BotaoPequeno } from '@/componentes/botao-pequeno';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ItemEnvio } from '@/lib/fila-envio';
import { duracaoTexto } from '@/lib/formato';

type Props = {
  item: ItemEnvio;
  largura: number;
  capa: boolean;
  /** Escolha liberada: dá para trocar a capa e tirar arquivos. */
  podeMexer: boolean;
  aoUsarComoCapa: () => void;
  aoTirar: () => void;
};

/** Foto ou vídeo escolhido no formulário, antes de enviar. Arquivo fora do limite mostra o problema. */
export function CartaoArquivo({ item, largura, capa, podeMexer, aoUsarComoCapa, aoTirar }: Props) {
  const tema = useTheme();
  const { arquivo } = item;
  const foto = arquivo.tipo === 'foto';
  const problema = item.estado === 'erro' ? (item.erro ?? 'Este arquivo não pode ser enviado.') : null;
  return (
    <View style={[estilos.cartao, { width: largura }]}>
      <View
        style={[
          estilos.miniatura,
          {
            height: Math.round((largura * 3) / 4),
            backgroundColor: tema.backgroundSelected,
            borderColor: problema ? tema.danger : tema.border,
          },
        ]}>
        {foto ? (
          <Image
            source={{ uri: arquivo.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={capa ? 'Foto de capa' : 'Foto escolhida'}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, estilos.centro]} accessibilityLabel="Vídeo escolhido">
            <Texto tipo="destaque" cor="brand">
              ▶
            </Texto>
            <Texto tipo="pequeno" cor="brand" style={estilos.negrito}>
              {`Vídeo${arquivo.duracaoSeg ? ` · ${duracaoTexto(arquivo.duracaoSeg)}` : ''}`}
            </Texto>
          </View>
        )}
        {capa && (
          <View style={[estilos.selo, { backgroundColor: tema.brand }]}>
            <Texto tipo="pequeno" cor="onBrand" style={estilos.negrito}>
              Capa
            </Texto>
          </View>
        )}
      </View>
      {problema && (
        <Texto tipo="pequeno" cor="danger">
          {problema}
        </Texto>
      )}
      {foto && !capa && !problema && (
        <BotaoPequeno titulo="Usar como capa" onPress={aoUsarComoCapa} desabilitado={!podeMexer} />
      )}
      <BotaoPequeno titulo="Tirar" tipo="perigo" onPress={aoTirar} desabilitado={!podeMexer && !problema} />
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { gap: Spacing.two },
  miniatura: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  centro: { alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  selo: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  negrito: { fontWeight: '600' },
});
