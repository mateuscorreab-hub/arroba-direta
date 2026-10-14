import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Lote } from '@arroba/shared';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { precoDoLote, resumoDoLote } from '@/lib/formato';

export function LoteCartao({ lote }: { lote: Lote }) {
  const tema = useTheme();
  return (
    <Link href={{ pathname: '/lote/[id]', params: { id: lote.id } }} asChild>
      <Pressable
        style={[estilos.cartao, { backgroundColor: tema.backgroundElement, borderColor: tema.border }]}>
        <Texto tipo="pequeno" cor="textSecondary">
          {lote.municipio}/{lote.uf}
          {lote.distanciaKm !== undefined ? ` · ${lote.distanciaKm} km` : ''}
        </Texto>
        <Texto tipo="subtitulo">{lote.titulo}</Texto>
        <Texto>{resumoDoLote(lote)}</Texto>
        <View style={estilos.rodape}>
          <Texto tipo="destaque" cor="brand">
            {precoDoLote(lote)}
          </Texto>
          {lote.vendedor.verificado && (
            <Texto tipo="pequeno" cor="brand">
              ✓ verificado
            </Texto>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const estilos = StyleSheet.create({
  cartao: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  rodape: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
