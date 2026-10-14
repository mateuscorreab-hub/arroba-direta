import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Abas nativas não existem no navegador; na versão web do app usamos uma barra simples.
// Filhos de componentes com asChild recebem estilo achatado (exigência do expo-router na web).
export default function Abas() {
  const tema = useTheme();
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View
          style={StyleSheet.flatten([
            estilos.barra,
            { backgroundColor: tema.background, borderColor: tema.border },
          ])}>
          <TabTrigger name="index" href="/" asChild>
            <BotaoAba>Buscar</BotaoAba>
          </TabTrigger>
          <TabTrigger name="anunciar" href="/anunciar" asChild>
            <BotaoAba>Anunciar</BotaoAba>
          </TabTrigger>
          <TabTrigger name="perfil" href="/perfil" asChild>
            <BotaoAba>Perfil</BotaoAba>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

function BotaoAba({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const tema = useTheme();
  return (
    <Pressable
      {...props}
      style={StyleSheet.flatten([
        estilos.botao,
        isFocused && { backgroundColor: tema.backgroundSelected },
      ])}>
      <Texto tipo="pequeno" cor={isFocused ? 'brand' : 'textSecondary'} style={estilos.rotulo}>
        {children}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  botao: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: 999 },
  rotulo: { fontWeight: '600' },
});
