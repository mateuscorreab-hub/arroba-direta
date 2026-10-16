import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { Midia } from '@arroba/shared';

import { SemFoto } from '@/componentes/sem-foto';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { duracaoTexto } from '@/lib/formato';

/** Largura máxima do conteúdo das telas do lote (no computador a tela inteira fica grande demais). */
export const LARGURA_MAXIMA = 720;

type Props = { midias: Midia[]; categoria: string; titulo: string };

/** Fotos em páginas deslizáveis e o vídeo, que só baixa quando a pessoa toca (internet fraca). */
export function GaleriaLote({ midias, categoria, titulo }: Props) {
  const tema = useTheme();
  const janela = useWindowDimensions();
  const [largura, setLargura] = useState(Math.min(janela.width, LARGURA_MAXIMA));
  const [pagina, setPagina] = useState(0);
  const [videoAberto, setVideoAberto] = useState(false);
  const rolagem = useRef<ScrollView>(null);
  // Página para onde as setas mandaram rolar: até chegar lá, a rolagem animada não mexe no contador.
  const destino = useRef<{ pagina: number; ate: number } | null>(null);

  const altura = Math.round((largura * 3) / 4);
  const total = midias.length;
  const atual = Math.min(pagina, Math.max(total - 1, 0));

  if (total === 0) return <SemFoto categoria={categoria} style={{ height: altura }} />;

  function mudarPagina(i: number) {
    if (i === atual) return;
    setPagina(i);
    setVideoAberto(false);
  }

  function aoRolar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const d = destino.current;
    if (d) {
      if (Math.abs(x - d.pagina * largura) > 2 && Date.now() < d.ate) return;
      destino.current = null;
    }
    mudarPagina(Math.min(total - 1, Math.max(0, Math.round(x / largura))));
  }

  // Toques seguidos na seta avançam uma página cada, mesmo no meio da animação.
  function irPara(i: number) {
    destino.current = { pagina: i, ate: Date.now() + 800 };
    rolagem.current?.scrollTo({ x: i * largura, animated: true });
    mudarPagina(i);
  }

  return (
    <View
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
      style={[estilos.galeria, { height: altura, backgroundColor: tema.backgroundElement }]}>
      <ScrollView
        ref={rolagem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={aoRolar}
        scrollEventThrottle={32}>
        {midias.map((m, i) => (
          <View key={m.id} style={{ width: largura, height: altura }}>
            {m.tipo === 'foto' ? (
              <Image
                // Só baixa a foto grande da página atual e das vizinhas; as outras ficam na miniatura.
                source={{ uri: Math.abs(i - atual) <= 1 ? m.url : m.miniatura }}
                placeholder={{ uri: m.miniatura }}
                placeholderContentFit="contain"
                contentFit="contain"
                style={StyleSheet.absoluteFill}
                accessibilityLabel={`Foto ${i + 1} de ${total}: ${titulo}`}
              />
            ) : videoAberto && i === atual ? (
              <PlayerVideo url={m.url} />
            ) : (
              <Pressable
                onPress={() => setVideoAberto(true)}
                accessibilityRole="button"
                accessibilityLabel={`Assistir o vídeo do lote${m.duracaoSeg ? `, ${duracaoTexto(m.duracaoSeg)}` : ''}`}
                style={estilos.poster}>
                <Image source={{ uri: m.miniatura }} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="" />
                <View style={[estilos.play, { backgroundColor: tema.brand }]}>
                  <Texto tipo="destaque" cor="onBrand">
                    {`▶ Assistir vídeo${m.duracaoSeg ? ` (${duracaoTexto(m.duracaoSeg)})` : ''}`}
                  </Texto>
                </View>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
      {total > 1 && (
        <>
          {atual > 0 && <Seta lado="esquerda" onPress={() => irPara(atual - 1)} />}
          {atual < total - 1 && <Seta lado="direita" onPress={() => irPara(atual + 1)} />}
          <View style={[estilos.contador, { backgroundColor: tema.background, borderColor: tema.border }]}>
            <Texto tipo="pequeno" accessibilityLabel={`${atual + 1} de ${total}`}>
              {`${atual + 1}/${total}`}
            </Texto>
          </View>
        </>
      )}
    </View>
  );
}

function PlayerVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  // Na web o play só funciona depois que o <video> está na tela.
  useEffect(() => {
    player.play();
  }, [player]);
  return (
    <VideoView
      player={player}
      style={estilos.video}
      nativeControls
      contentFit="contain"
      // No Android, o TextureView convive melhor com a rolagem e as setas por cima.
      surfaceType="textureView"
    />
  );
}

function Seta({ lado, onPress }: { lado: 'esquerda' | 'direita'; onPress: () => void }) {
  const tema = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={lado === 'esquerda' ? 'Anterior' : 'Próxima'}
      hitSlop={8}
      style={[
        estilos.seta,
        lado === 'esquerda' ? { left: Spacing.two } : { right: Spacing.two },
        { backgroundColor: tema.background, borderColor: tema.border },
      ]}>
      <Texto tipo="titulo">{lado === 'esquerda' ? '‹' : '›'}</Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  galeria: { width: '100%', overflow: 'hidden' },
  poster: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Na web o <video> não estica só com top/left/right/bottom: precisa de largura e altura.
  video: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  play: { borderRadius: 999, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  contador: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    pointerEvents: 'none',
  },
  seta: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
