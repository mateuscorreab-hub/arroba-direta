import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  rotulo: string;
  erro?: string;
};

export function CampoTexto({ rotulo, erro, style, ...rest }: Props) {
  const tema = useTheme();
  return (
    <View style={estilos.campo}>
      <Texto tipo="pequeno" cor="textSecondary">
        {rotulo}
      </Texto>
      <TextInput
        accessibilityLabel={rotulo}
        placeholderTextColor={tema.textSecondary}
        {...rest}
        style={[
          estilos.entrada,
          { color: tema.text, borderColor: erro ? tema.danger : tema.border, backgroundColor: tema.backgroundElement },
          style,
        ]}
      />
      {erro && (
        <Texto tipo="pequeno" cor="danger">
          {erro}
        </Texto>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  campo: { gap: Spacing.one },
  entrada: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 17, minHeight: 50 },
});
