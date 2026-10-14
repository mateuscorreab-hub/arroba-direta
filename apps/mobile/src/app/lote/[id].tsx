import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { CATEGORIA_ROTULO, type Lote } from '@arroba/shared';

import { NegociarLote } from '@/componentes/negociar-lote';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { obterLote } from '@/lib/api';
import { precoDoLote } from '@/lib/formato';

export default function LoteDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tema = useTheme();
  const [lote, setLote] = useState<Lote | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Busca de novo ao voltar para a tela: o lote pode ter fechado negócio enquanto isso.
  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      obterLote(id).then(
        (l) => {
          if (ativo) setLote(l);
        },
        (e: Error) => {
          if (ativo) setErro(e.message);
        },
      );
      return () => {
        ativo = false;
      };
    }, [id]),
  );

  // Uma falha ao buscar de novo não apaga o lote que já está na tela.
  if (!lote) {
    if (erro) return <Texto cor="danger" style={estilos.conteudo}>{erro}</Texto>;
    return <ActivityIndicator style={{ flex: 1 }} color={tema.brand} />;
  }

  const ficha: [string, string][] = [
    ['Categoria', CATEGORIA_ROTULO[lote.categoria]],
    ['Raça', lote.raca],
    ['Quantidade', `${lote.quantidade} cabeças`],
    ['Peso médio', lote.pesoMedioKg ? `${lote.pesoMedioKg} kg` : 'Não informado'],
    ['Idade média', lote.idadeMediaMeses ? `${lote.idadeMediaMeses} meses` : 'Não informada'],
    ['Local', `${lote.municipio}/${lote.uf}`],
    ['Vendedor', `${lote.vendedor.nome}${lote.vendedor.verificado ? ' ✓' : ''}`],
  ];

  return (
    <ScrollView style={{ backgroundColor: tema.background }} contentContainerStyle={estilos.conteudo}>
      <Stack.Screen options={{ title: CATEGORIA_ROTULO[lote.categoria] }} />
      <Texto tipo="titulo">{lote.titulo}</Texto>
      <Texto tipo="destaque" cor="brand">
        {precoDoLote(lote)}
      </Texto>
      <View style={[estilos.ficha, { backgroundColor: tema.backgroundElement, borderColor: tema.border }]}>
        {ficha.map(([k, v]) => (
          <View key={k} style={estilos.linha}>
            <Texto cor="textSecondary">{k}</Texto>
            <Texto>{v}</Texto>
          </View>
        ))}
      </View>
      <NegociarLote lote={lote} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  ficha: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  linha: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
});
