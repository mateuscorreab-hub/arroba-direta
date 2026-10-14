import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Próximo passo: login com código por SMS/WhatsApp e verificação de documento.
export default function Perfil() {
  const tema = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tema.background }} edges={['top']}>
      <View style={estilos.conteudo}>
        <Texto tipo="titulo">Perfil</Texto>
        <Texto cor="textSecondary">
          Em breve: entre com o número do seu celular, sem senha. Depois, envie um documento com
          foto para ganhar o selo de verificado.
        </Texto>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, gap: Spacing.three },
});
