import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  titulo: string;
  onPress: () => void;
  variante?: 'principal' | 'secundario' | 'discreto';
  carregando?: boolean;
  desabilitado?: boolean;
};

export function Botao({ titulo, onPress, variante = 'principal', carregando, desabilitado }: Props) {
  const tema = useTheme();
  const inativo = desabilitado || carregando;
  const corTexto = variante === 'principal' ? 'onBrand' : 'brand';
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inativo, busy: !!carregando }}
      style={({ pressed }) => [
        estilos.botao,
        variante === 'principal' && { backgroundColor: tema.brand },
        variante === 'secundario' && { borderWidth: 1, borderColor: tema.brand },
        { opacity: inativo ? 0.6 : pressed ? 0.8 : 1 },
      ]}>
      <View style={estilos.linha}>
        {carregando && <ActivityIndicator color={tema[corTexto]} />}
        <Texto tipo={variante === 'discreto' ? 'normal' : 'destaque'} cor={corTexto} style={estilos.rotulo}>
          {titulo}
        </Texto>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  // Alvo de toque grande: o app é usado no campo, às vezes com luva ou mão suja.
  botao: { minHeight: 52, borderRadius: 12, paddingHorizontal: Spacing.three, justifyContent: 'center' },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  rotulo: { textAlign: 'center' },
});
