import { ScrollView, StyleSheet, View } from 'react-native';
import type { DocumentoLegal as Documento } from '@arroba/shared';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Termos de uso e Política de privacidade: o texto vem de @arroba/shared, o mesmo do site. */
export function DocumentoLegal({ documento }: { documento: Documento }) {
  const tema = useTheme();
  return (
    <ScrollView style={{ backgroundColor: tema.background }} contentContainerStyle={estilos.conteudo}>
      <Texto tipo="titulo">{documento.titulo}</Texto>
      <Texto tipo="pequeno" cor="textSecondary">
        Atualizado em {documento.atualizadoEm}
      </Texto>
      <Texto>{documento.introducao}</Texto>
      {documento.secoes.map((secao) => (
        <View key={secao.titulo} style={estilos.secao}>
          <Texto tipo="subtitulo">{secao.titulo}</Texto>
          {secao.blocos.map((bloco, i) =>
            typeof bloco === 'string' ? (
              <Texto key={i}>{bloco}</Texto>
            ) : (
              <View key={i} style={estilos.lista}>
                {bloco.map((item) => (
                  <View key={item} style={estilos.item}>
                    <Texto>•</Texto>
                    <Texto style={estilos.textoItem}>{item}</Texto>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.two },
  secao: { gap: Spacing.two, marginTop: Spacing.two },
  lista: { gap: Spacing.one },
  item: { flexDirection: 'row', gap: Spacing.two },
  textoItem: { flex: 1 },
});
