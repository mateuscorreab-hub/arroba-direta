import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ProvedorSessao } from '@/lib/sessao';

// Aberta por link ou recarregando a página, a tela fica por cima das abas e tem Voltar.
export const unstable_settings = { anchor: '(abas)' };

export default function RootLayout() {
  const esquema = useColorScheme();
  return (
    <ProvedorSessao>
      <ThemeProvider value={esquema === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(abas)" options={{ headerShown: false }} />
          <Stack.Screen name="lote/[id]/index" options={{ title: 'Lote', headerBackTitle: 'Voltar' }} />
          <Stack.Screen
            name="lote/[id]/midias"
            options={{ title: 'Fotos e vídeo do lote', headerBackTitle: 'Voltar' }}
          />
          <Stack.Screen name="lote/[id]/editar" options={{ title: 'Editar anúncio', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="meus-anuncios" options={{ title: 'Meus anúncios', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="conversa/[id]/index" options={{ title: 'Conversa', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="conversa/[id]/proposta" options={{ title: 'Proposta', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="termos" options={{ title: 'Termos de uso', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="privacidade" options={{ title: 'Privacidade', headerBackTitle: 'Voltar' }} />
        </Stack>
      </ThemeProvider>
    </ProvedorSessao>
  );
}
