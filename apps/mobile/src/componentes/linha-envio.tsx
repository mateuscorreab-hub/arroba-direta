import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { BotaoPequeno } from '@/componentes/botao-pequeno';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ItemEnvio } from '@/lib/fila-envio';
import { duracaoTexto, tamanhoTexto } from '@/lib/formato';

type Props = {
  item: ItemEnvio;
  aoTentarDeNovo: () => void;
  aoRemover: () => void;
};

/** Um arquivo na fila de envio: prévia, situação, barra de progresso e os botões do que dá para fazer. */
export function LinhaEnvio({ item, aoTentarDeNovo, aoRemover }: Props) {
  const tema = useTheme();
  const { arquivo } = item;
  const foto = arquivo.tipo === 'foto';
  const porcento = Math.round(item.progresso * 100);
  const situacao = {
    pronto: 'Esperando a hora de enviar',
    esperando: 'Na fila',
    enviando: `Enviando… ${porcento}%`,
    registrando: 'Salvando no anúncio…',
    enviado: foto ? 'Enviada ✓' : 'Enviado ✓',
    erro: item.erro ?? 'Não foi possível enviar.',
  }[item.estado];
  const detalhes = [
    foto ? 'Foto' : 'Vídeo',
    arquivo.duracaoSeg ? duracaoTexto(arquivo.duracaoSeg) : null,
    arquivo.tamanho ? tamanhoTexto(arquivo.tamanho) : null,
  ].filter(Boolean);
  const comBarra = item.estado !== 'erro' && item.estado !== 'pronto';
  const comBotoes = item.estado !== 'registrando' && item.estado !== 'enviado';

  return (
    <View
      style={[
        estilos.envio,
        { backgroundColor: tema.backgroundElement, borderColor: item.estado === 'erro' ? tema.danger : tema.border },
      ]}>
      <View style={estilos.topo}>
        {foto ? (
          <Image
            source={{ uri: arquivo.uri }}
            style={[estilos.previa, { backgroundColor: tema.backgroundSelected }]}
            contentFit="cover"
            accessibilityLabel=""
          />
        ) : (
          <View style={[estilos.previa, estilos.centro, { backgroundColor: tema.backgroundSelected }]}>
            <Texto tipo="pequeno" cor="brand">
              ▶ Vídeo
            </Texto>
          </View>
        )}
        <View style={estilos.textos}>
          <Texto tipo="pequeno">{detalhes.join(' · ')}</Texto>
          <Texto tipo="pequeno" cor={item.estado === 'erro' ? 'danger' : 'textSecondary'} accessibilityLiveRegion="polite">
            {situacao}
          </Texto>
        </View>
      </View>
      {comBarra && (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: porcento }}
          style={[estilos.trilho, { backgroundColor: tema.backgroundSelected }]}>
          <View style={[estilos.barra, { width: `${porcento}%`, backgroundColor: tema.brand }]} />
        </View>
      )}
      {comBotoes && (
        <View style={estilos.botoes}>
          {item.estado === 'erro' && item.podeTentarDeNovo && (
            <BotaoPequeno titulo="Tentar de novo" onPress={aoTentarDeNovo} />
          )}
          <BotaoPequeno
            titulo={item.estado === 'erro' ? 'Remover' : item.estado === 'pronto' ? 'Tirar' : 'Cancelar'}
            tipo="perigo"
            onPress={aoRemover}
          />
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  envio: { borderWidth: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  topo: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  textos: { flex: 1, gap: Spacing.one },
  botoes: { flexDirection: 'row', gap: Spacing.two },
  previa: { width: 64, height: 48, borderRadius: 8, overflow: 'hidden' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  trilho: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barra: { height: '100%' },
});
