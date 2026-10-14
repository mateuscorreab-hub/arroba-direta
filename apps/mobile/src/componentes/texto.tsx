import { StyleSheet, Text, type TextProps } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextProps & {
  tipo?: 'titulo' | 'subtitulo' | 'normal' | 'pequeno' | 'destaque';
  cor?: ThemeColor;
};

export function Texto({ tipo = 'normal', cor = 'text', style, ...rest }: Props) {
  const tema = useTheme();
  return <Text style={[{ color: tema[cor] }, estilos[tipo], style]} {...rest} />;
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  subtitulo: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  // Fonte maior que o padrão: público usa o app no campo, muitas vezes sob sol.
  normal: { fontSize: 17, lineHeight: 24 },
  pequeno: { fontSize: 15, lineHeight: 20 },
  destaque: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
});
