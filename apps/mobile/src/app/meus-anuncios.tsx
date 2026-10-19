import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { LoteCartao } from '@/componentes/lote-cartao';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useDadosEmFoco } from '@/hooks/use-dados-em-foco';
import { useTheme } from '@/hooks/use-theme';
import { listarMeusLotes, textoDoErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

const ATUALIZAR_A_CADA_MS = 60_000;
// dismissTo volta às abas que já estão na pilha, em vez de empilhar outra cópia delas.
const irParaAnunciar = () => router.dismissTo('/anunciar');

export default function MeusAnuncios() {
  const tema = useTheme();
  const sessao = useSessao();

  let conteudo;
  if (sessao.carregando) {
    conteudo = <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
  } else if (sessao.erro) {
    conteudo = (
      <View style={estilos.bloco}>
        <Aviso tipo="erro">{`Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
        <Botao titulo="Tentar de novo" onPress={sessao.tentarDeNovo} />
      </View>
    );
  } else if (!sessao.usuario) {
    conteudo = (
      <View style={estilos.bloco}>
        <Texto cor="textSecondary">Para ver seus anúncios, entre com o número do seu celular.</Texto>
        <Botao titulo="Entrar com celular" onPress={() => router.dismissTo('/perfil')} />
      </View>
    );
  } else {
    // A chave zera a lista quando outra pessoa entra no mesmo aparelho.
    conteudo = <ListaMeusLotes key={sessao.usuario.id} />;
  }

  return <View style={[estilos.tela, { backgroundColor: tema.background }]}>{conteudo}</View>;
}

function ListaMeusLotes() {
  const tema = useTheme();
  const { dados: lotes, erro, recarregar } = useDadosEmFoco(listarMeusLotes, ATUALIZAR_A_CADA_MS);
  const [puxando, setPuxando] = useState(false);

  async function puxar() {
    setPuxando(true);
    await recarregar();
    setPuxando(false);
  }

  if (!lotes) {
    if (!erro) return <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
    return (
      <View style={estilos.bloco}>
        <Aviso tipo="erro">{textoDoErro(erro)}</Aviso>
        <Botao titulo="Tentar de novo" onPress={recarregar} />
      </View>
    );
  }

  return (
    <FlatList
      data={lotes}
      keyExtractor={(l) => l.id}
      renderItem={({ item }) => <LoteCartao lote={item} comSituacao />}
      contentContainerStyle={estilos.lista}
      onRefresh={puxar}
      refreshing={puxando}
      ListHeaderComponent={
        lotes.length > 0 ? (
          <View style={estilos.cabecalho}>
            <Texto cor="textSecondary">Toque em um anúncio para editar, pausar ou marcar como vendido.</Texto>
            {erro !== null && <Aviso tipo="erro">{`Não foi possível atualizar. ${textoDoErro(erro)}`}</Aviso>}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={estilos.cabecalho}>
          <Texto cor="textSecondary">Você ainda não anunciou nenhum lote.</Texto>
          <Botao titulo="Anunciar lote" onPress={irParaAnunciar} />
        </View>
      }
      ListFooterComponent={
        lotes.length > 0 ? <Botao titulo="Anunciar outro lote" variante="secundario" onPress={irParaAnunciar} /> : null
      }
    />
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  carregando: { flex: 1 },
  bloco: { padding: Spacing.three, gap: Spacing.three },
  cabecalho: { gap: Spacing.three },
  lista: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
  },
});
