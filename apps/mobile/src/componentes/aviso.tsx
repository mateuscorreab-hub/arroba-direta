import { StyleSheet, View, type ViewProps } from 'react-native';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = ViewProps & { tipo?: 'info' | 'erro' };

/** Caixa destacada para avisos e erros. Texto solto vira <Texto>. */
export function Aviso({ tipo = 'info', style, children, ...rest }: Props) {
  const tema = useTheme();
  return (
    <View
      accessibilityRole={tipo === 'erro' ? 'alert' : undefined}
      {...rest}
      style={[
        estilos.caixa,
        tipo === 'erro'
          ? { borderColor: tema.danger, backgroundColor: tema.backgroundElement }
          : { borderColor: tema.brand, backgroundColor: tema.backgroundSelected },
        style,
      ]}>
      {typeof children === 'string' ? <Texto cor={tipo === 'erro' ? 'danger' : 'text'}>{children}</Texto> : children}
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { borderWidth: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
});
