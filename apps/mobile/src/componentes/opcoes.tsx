import { Pressable, StyleSheet, View } from 'react-native';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props<T extends string> = {
  lista: readonly T[];
  atual: T | undefined;
  aoEscolher: (v: T) => void;
  rotulos?: Partial<Record<T, string>>;
};

/** Escolha de uma opção em botões lado a lado, sem lista suspensa. */
export function Opcoes<T extends string>({ lista, atual, aoEscolher, rotulos }: Props<T>) {
  const tema = useTheme();
  return (
    <View style={estilos.opcoes} accessibilityRole="radiogroup">
      {lista.map((v) => {
        const ativo = v === atual;
        return (
          <Pressable
            key={v}
            onPress={() => aoEscolher(v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: ativo }}
            style={[estilos.chip, { borderColor: tema.border, backgroundColor: ativo ? tema.brand : tema.backgroundElement }]}>
            <Texto tipo="pequeno" cor={ativo ? 'onBrand' : 'text'}>
              {rotulos?.[v] ?? v}
            </Texto>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 44,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
