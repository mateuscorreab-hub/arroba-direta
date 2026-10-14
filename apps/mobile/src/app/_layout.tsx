import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ProvedorSessao } from '@/lib/sessao';

export default function RootLayout() {
  const esquema = useColorScheme();
  return (
    <ProvedorSessao>
      <ThemeProvider value={esquema === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(abas)" options={{ headerShown: false }} />
          <Stack.Screen name="lote/[id]" options={{ title: 'Lote', headerBackTitle: 'Voltar' }} />
        </Stack>
      </ThemeProvider>
    </ProvedorSessao>
  );
}
