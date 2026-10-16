import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ConversaResumo } from '@arroba/shared';

import { Texto } from '@/componentes/texto';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatarDataHora } from '@/lib/formato';

function situacao(c: ConversaResumo, meuId: string): { texto: string; cor: ThemeColor } | null {
  if (c.negocioFechado) return { texto: 'Negócio fechado', cor: 'brand' };
  if (c.propostaAberta) {
    return c.propostaAberta.autorId === meuId
      ? { texto: `Proposta aguardando ${c.outraParte.nome}`, cor: 'textSecondary' }
      : { texto: 'Proposta aguardando você', cor: 'brand' };
  }
  if (c.lote.status !== 'ativo') return { texto: 'Lote indisponível', cor: 'textSecondary' };
  return null;
}

export function ConversaItem({ conversa: c, meuId }: { conversa: ConversaResumo; meuId: string }) {
  const tema = useTheme();
  const s = situacao(c, meuId);
  const novas = c.naoLidas > 0;
  return (
    <Link href={{ pathname: '/conversa/[id]', params: { id: c.id } }} asChild>
      <Pressable
        accessibilityHint={novas ? `${c.naoLidas} mensagens não lidas` : undefined}
        // Filho de <Link asChild> precisa de estilo achatado (exigência do expo-router na web).
        style={StyleSheet.flatten([
          estilos.item,
          { backgroundColor: tema.backgroundElement, borderColor: novas ? tema.brand : tema.border },
        ])}>
        <View style={estilos.linha}>
          <Texto tipo="subtitulo" numberOfLines={2} style={estilos.titulo}>
            {c.lote.titulo}
          </Texto>
          {novas && (
            <View style={[estilos.bolinha, { backgroundColor: tema.brand }]}>
              <Texto tipo="pequeno" cor="onBrand" style={estilos.negrito}>
                {c.naoLidas > 99 ? '99+' : c.naoLidas}
              </Texto>
            </View>
          )}
        </View>
        <Texto tipo="pequeno" cor="textSecondary">
          {c.papel === 'comprador' ? 'Vendedor' : 'Comprador'}: {c.outraParte.nome}
          {c.outraParte.verificado ? ' ✓' : ''} · {c.outraParte.municipio}/{c.outraParte.uf}
        </Texto>
        {c.ultimaMensagem && (
          <View style={estilos.linha}>
            <Texto numberOfLines={2} style={[estilos.previa, novas && estilos.negrito]}>
              {c.ultimaMensagem.texto}
            </Texto>
            <Texto tipo="pequeno" cor="textSecondary">
              {formatarDataHora(c.ultimaMensagem.criadoEm)}
            </Texto>
          </View>
        )}
        {s && (
          <Texto tipo="pequeno" cor={s.cor} style={estilos.negrito}>
            {s.texto}
          </Texto>
        )}
      </Pressable>
    </Link>
  );
}

const estilos = StyleSheet.create({
  item: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  titulo: { flex: 1 },
  previa: { flex: 1 },
  bolinha: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  negrito: { fontWeight: '700' },
});
