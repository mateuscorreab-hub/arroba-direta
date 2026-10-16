import { StyleSheet, View } from 'react-native';
import type { Mensagem } from '@arroba/shared';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatarDataHora } from '@/lib/formato';

/** Mensagem de texto (minhas à direita, da outra parte à esquerda) ou aviso do sistema, no centro. */
export function BalaoMensagem({ mensagem, minha }: { mensagem: Mensagem; minha: boolean }) {
  const tema = useTheme();
  const quando = formatarDataHora(mensagem.criadoEm);

  if (mensagem.tipo === 'sistema') {
    return (
      <View style={[estilos.sistema, { backgroundColor: tema.backgroundSelected }]}>
        <Texto tipo="pequeno" style={estilos.centro}>
          {mensagem.texto}
        </Texto>
        <Texto tipo="pequeno" cor="textSecondary" style={[estilos.centro, estilos.hora]}>
          {quando}
        </Texto>
      </View>
    );
  }

  return (
    <View
      style={[
        estilos.balao,
        minha
          ? [estilos.minha, { backgroundColor: tema.brand }]
          : [estilos.outra, { backgroundColor: tema.backgroundElement, borderColor: tema.border }],
      ]}>
      <Texto cor={minha ? 'onBrand' : 'text'} selectable>
        {mensagem.texto}
      </Texto>
      <Texto tipo="pequeno" cor={minha ? 'onBrand' : 'textSecondary'} style={[estilos.hora, minha && estilos.horaMinha]}>
        {quando}
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  balao: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  minha: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  outra: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 4 },
  hora: { fontSize: 13, lineHeight: 18 },
  horaMinha: { textAlign: 'right', opacity: 0.85 },
  sistema: {
    alignSelf: 'center',
    maxWidth: '90%',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  centro: { textAlign: 'center' },
});
