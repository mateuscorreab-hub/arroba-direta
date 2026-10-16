import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Espaço reservado para lote sem foto, com o nome da categoria. */
export function SemFoto({
  categoria,
  pequeno,
  style,
}: {
  categoria: string;
  pequeno?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tema = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${categoria}, sem foto`}
      style={[estilos.caixa, { backgroundColor: tema.backgroundSelected }, style]}>
      <Texto tipo={pequeno ? 'pequeno' : 'subtitulo'} cor="brand" style={estilos.centro}>
        {categoria}
      </Texto>
      <Texto tipo="pequeno" cor="textSecondary" style={estilos.centro}>
        {pequeno ? 'sem foto' : 'Ainda sem fotos'}
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { alignItems: 'center', justifyContent: 'center', padding: Spacing.two, gap: Spacing.one },
  centro: { textAlign: 'center' },
});
