import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { CATEGORIA_ROTULO, type Lote } from '@arroba/shared';

import { Botao } from '@/componentes/botao';
import { GaleriaLote, LARGURA_MAXIMA } from '@/componentes/galeria-lote';
import { NegociarLote } from '@/componentes/negociar-lote';
import { PainelDoVendedor } from '@/componentes/painel-vendedor';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { obterLote, textoDoErro } from '@/lib/api';
import { precoDoLote } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

export default function LoteDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tema = useTheme();
  const sessao = useSessao();
  const [lote, setLote] = useState<Lote | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Cada troca do lote (pelo painel do vendedor ou por uma recarga) conta uma versão: a resposta que chega depois
  // de uma troca mais nova é descartada.
  const versao = useRef(0);
  const mudarLote = useCallback((l: Lote) => {
    versao.current += 1;
    setLote(l);
  }, []);

  const carregar = useCallback(() => {
    let ativo = true;
    const minha = ++versao.current;
    obterLote(id).then(
      (l) => {
        if (!ativo || minha !== versao.current) return;
        setLote(l);
        setErro(null);
      },
      (e: unknown) => {
        if (ativo && minha === versao.current) setErro(textoDoErro(e));
      },
    );
    return () => {
      ativo = false;
    };
  }, [id]);
  // Recarrega ao voltar para a tela: o vendedor pode ter mudado os dados ou as fotos.
  useFocusEffect(carregar);

  if (!lote) {
    return (
      <View style={[estilos.centro, { backgroundColor: tema.background }]}>
        {erro ? (
          <>
            <Texto cor="danger" style={estilos.textoCentro}>
              {erro}
            </Texto>
            <Botao
              titulo="Tentar de novo"
              variante="secundario"
              onPress={() => {
                setErro(null);
                carregar();
              }}
            />
          </>
        ) : (
          <ActivityIndicator size="large" color={tema.brand} />
        )}
      </View>
    );
  }

  const categoria = CATEGORIA_ROTULO[lote.categoria];
  const souVendedor = sessao.usuario?.id === lote.vendedor.id;
  const ficha: [string, string][] = [
    ['Categoria', categoria],
    ['Raça', lote.raca],
    ['Quantidade', `${lote.quantidade} cabeças`],
    ['Peso médio', lote.pesoMedioKg ? `${lote.pesoMedioKg} kg` : 'Não informado'],
    ['Idade média', lote.idadeMediaMeses ? `${lote.idadeMediaMeses} meses` : 'Não informada'],
    ['Local', `${lote.municipio}/${lote.uf}`],
    ['Vendedor', `${lote.vendedor.nome}${lote.vendedor.verificado ? ' ✓' : ''}`],
  ];

  return (
    <ScrollView style={{ backgroundColor: tema.background }} contentContainerStyle={estilos.rolagem}>
      <Stack.Screen options={{ title: categoria }} />
      <View style={estilos.coluna}>
        <GaleriaLote midias={lote.midias ?? []} categoria={categoria} titulo={lote.titulo} />
        <View style={estilos.conteudo}>
          {souVendedor && <PainelDoVendedor lote={lote} aoMudar={mudarLote} recarregar={carregar} />}
          <Texto tipo="titulo">{lote.titulo}</Texto>
          <Texto tipo="destaque" cor="brand">
            {precoDoLote(lote)}
          </Texto>
          <View style={[estilos.ficha, { backgroundColor: tema.backgroundElement, borderColor: tema.border }]}>
            {ficha.map(([k, v]) => (
              <View key={k} style={estilos.linha}>
                <Texto cor="textSecondary">{k}</Texto>
                <Texto style={estilos.valor}>{v}</Texto>
              </View>
            ))}
          </View>
          <NegociarLote lote={lote} />
        </View>
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  rolagem: { paddingBottom: Spacing.five },
  coluna: { width: '100%', maxWidth: LARGURA_MAXIMA, alignSelf: 'center' },
  conteudo: { padding: Spacing.three, gap: Spacing.three },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.three, gap: Spacing.three },
  textoCentro: { textAlign: 'center' },
  ficha: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  linha: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  valor: { flexShrink: 1, textAlign: 'right' },
});
