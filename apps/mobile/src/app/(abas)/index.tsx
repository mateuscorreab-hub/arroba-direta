import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CATEGORIAS, CATEGORIA_ROTULO, type Categoria, type Lote } from '@arroba/shared';

import { LoteCartao } from '@/componentes/lote-cartao';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buscarLotes } from '@/lib/api';

export default function Buscar() {
  const tema = useTheme();
  const [categoria, setCategoria] = useState<Categoria | undefined>();
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    // TODO: usar a localização do usuário (expo-location) para ordenar por distância.
    buscarLotes({ categoria }).then(
      (pagina) => {
        if (!ativo) return;
        setLotes(pagina.itens);
        setErro(null);
        setCarregando(false);
      },
      (e: unknown) => {
        if (!ativo) return;
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar os lotes');
        setCarregando(false);
      },
    );
    return () => {
      ativo = false;
    };
  }, [categoria, versao]);

  const recarregar = () => {
    setCarregando(true);
    setVersao((v) => v + 1);
  };

  const filtrar = (c: Categoria | undefined) => {
    if (c === categoria) return;
    setCarregando(true);
    setCategoria(c);
  };

  return (
    <SafeAreaView style={[estilos.tela, { backgroundColor: tema.background }]} edges={['top']}>
      <View style={estilos.cabecalho}>
        <Texto tipo="titulo">Lotes à venda</Texto>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={estilos.faixaChips}
        contentContainerStyle={estilos.chips}>
        {[undefined, ...CATEGORIAS].map((c) => {
          const ativo = c === categoria;
          return (
            <Pressable
              key={c ?? 'todas'}
              onPress={() => filtrar(c)}
              style={[
                estilos.chip,
                { borderColor: tema.border, backgroundColor: ativo ? tema.brand : tema.backgroundElement },
              ]}>
              <Texto tipo="pequeno" cor={ativo ? 'onBrand' : 'text'}>
                {c ? CATEGORIA_ROTULO[c] : 'Todas'}
              </Texto>
            </Pressable>
          );
        })}
      </ScrollView>

      {carregando ? (
        <ActivityIndicator style={estilos.centro} color={tema.brand} />
      ) : erro ? (
        <View style={estilos.centro}>
          <Texto cor="danger">{erro}</Texto>
          <Pressable onPress={recarregar}>
            <Texto cor="brand">Tentar de novo</Texto>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={lotes}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <LoteCartao lote={item} />}
          contentContainerStyle={estilos.lista}
          onRefresh={recarregar}
          refreshing={carregando}
          ListEmptyComponent={<Texto cor="textSecondary">Nenhum lote nessa categoria ainda.</Texto>}
        />
      )}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  cabecalho: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  faixaChips: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: Spacing.two, padding: Spacing.three, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  lista: { gap: Spacing.three, padding: Spacing.three, paddingTop: 0, paddingBottom: 120 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
