import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { CATEGORIA_ROTULO, STATUS_LOTE_ROTULO, type Lote } from '@arroba/shared';

import { SemFoto } from '@/componentes/sem-foto';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { precoDoLote, resumoDoLote } from '@/lib/formato';

/** Com `comSituacao` (em "Meus anúncios"), mostra a situação do anúncio no lugar do vendedor. */
export function LoteCartao({ lote, comSituacao = false }: { lote: Lote; comSituacao?: boolean }) {
  const tema = useTheme();
  return (
    <Link href={{ pathname: '/lote/[id]', params: { id: lote.id } }} asChild>
      <Pressable
        // Filho de <Link asChild> precisa de estilo achatado (exigência do expo-router na web).
        style={StyleSheet.flatten([
          estilos.cartao,
          { backgroundColor: tema.backgroundElement, borderColor: tema.border },
        ])}>
        {lote.capa ? (
          <Image
            source={{ uri: lote.capa }}
            style={[estilos.capa, { backgroundColor: tema.backgroundSelected }]}
            contentFit="cover"
            transition={150}
            recyclingKey={lote.id}
            // Na web o expo-image usa o accessibilityLabel como alt (o alt da imagem principal é ignorado).
            accessibilityLabel={`Foto do lote: ${lote.titulo}`}
          />
        ) : (
          <SemFoto categoria={CATEGORIA_ROTULO[lote.categoria]} pequeno style={estilos.capa} />
        )}
        <View style={estilos.textos}>
          <Texto tipo="pequeno" cor="textSecondary">
            {lote.municipio}/{lote.uf}
            {lote.distanciaKm !== undefined ? ` · ${lote.distanciaKm} km` : ''}
          </Texto>
          <Texto tipo="subtitulo">{lote.titulo}</Texto>
          <Texto>{resumoDoLote(lote)}</Texto>
          <Texto tipo="destaque" cor="brand" style={estilos.preco}>
            {precoDoLote(lote)}
          </Texto>
          {comSituacao ? (
            <View style={[estilos.situacao, { backgroundColor: tema.backgroundSelected }]}>
              <Texto tipo="pequeno" cor={lote.status === 'ativo' ? 'brand' : 'text'} style={estilos.negrito}>
                {STATUS_LOTE_ROTULO[lote.status]}
              </Texto>
            </View>
          ) : (
            <Texto tipo="pequeno" cor="textSecondary">
              {lote.vendedor.nome}
              {lote.vendedor.verificado ? ' · ✓ verificado' : ''}
            </Texto>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  // Mesma proporção da miniatura que a API entrega (600x450).
  capa: { width: 112, height: 84, borderRadius: 10, overflow: 'hidden' },
  textos: { flex: 1, gap: Spacing.one },
  preco: { marginTop: Spacing.two },
  situacao: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  negrito: { fontWeight: '700' },
});
