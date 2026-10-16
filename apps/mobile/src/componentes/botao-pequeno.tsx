import { Pressable, StyleSheet } from 'react-native';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  titulo: string;
  onPress: () => void;
  tipo?: 'normal' | 'perigo' | 'perigoCheio';
  desabilitado?: boolean;
};

/** Botão das fotos (capa, apagar, tentar de novo): menor que o Botao, mas ainda fácil de acertar. */
export function BotaoPequeno({ titulo, onPress, tipo = 'normal', desabilitado }: Props) {
  const tema = useTheme();
  const cor = tipo === 'normal' ? tema.brand : tema.danger;
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desabilitado }}
      style={({ pressed }) => [
        estilos.botao,
        { borderColor: cor, opacity: desabilitado ? 0.5 : pressed ? 0.7 : 1 },
        tipo === 'perigoCheio' && { backgroundColor: cor },
      ]}>
      <Texto
        tipo="pequeno"
        cor={tipo === 'perigoCheio' ? 'onBrand' : tipo === 'perigo' ? 'danger' : 'brand'}
        style={estilos.rotulo}>
        {titulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  botao: {
    flexGrow: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotulo: { fontWeight: '600', textAlign: 'center' },
});
