import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
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
        // Filho de <Link asChild> precisa de estilo achatado (exigência do expo-router na web).
        style={StyleSheet.flatten([
          estilos.cartao,
          { backgroundColor: tema.backgroundElement, borderColor: tema.border },
        ])}>
        <Texto tipo="pequeno" cor="textSecondary">
          {lote.municipio}/{lote.uf}
          {lote.distanciaKm !== undefined ? ` · ${lote.distanciaKm} km` : ''}
        </Texto>
        <Texto tipo="subtitulo">{lote.titulo}</Texto>
        <Texto>{resumoDoLote(lote)}</Texto>
        <Texto tipo="destaque" cor="brand" style={estilos.preco}>
          {precoDoLote(lote)}
        </Texto>
        <Texto tipo="pequeno" cor="textSecondary">
          {lote.vendedor.nome}
          {lote.vendedor.verificado ? ' · ✓ verificado' : ''}
        </Texto>
      </Pressable>
    </Link>
  );
}

const estilos = StyleSheet.create({
  cartao: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  preco: { marginTop: Spacing.two },
});
