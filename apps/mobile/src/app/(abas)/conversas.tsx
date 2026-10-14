import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { ConversaItem } from '@/componentes/conversa-item';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useDadosEmFoco } from '@/hooks/use-dados-em-foco';
import { useTheme } from '@/hooks/use-theme';
import { listarConversas, textoDoErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

const ATUALIZAR_A_CADA_MS = 15_000;

export default function Conversas() {
  const tema = useTheme();
  const sessao = useSessao();

  let conteudo;
  if (sessao.carregando) {
    conteudo = <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
  } else if (sessao.erro) {
    conteudo = (
      <ScrollView contentContainerStyle={estilos.bloco}>
        <Texto tipo="titulo">Conversas</Texto>
        <Aviso tipo="erro">{`Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
        <Botao titulo="Tentar de novo" onPress={sessao.tentarDeNovo} />
      </ScrollView>
    );
  } else if (!sessao.usuario) {
    conteudo = (
      <ScrollView contentContainerStyle={estilos.bloco}>
        <Texto tipo="titulo">Conversas</Texto>
        <Texto cor="textSecondary">
          Aqui você conversa com compradores e vendedores e acompanha suas propostas. Para ver suas conversas,
          entre com o número do seu celular.
        </Texto>
        <Botao titulo="Entrar com celular" onPress={() => router.navigate('/perfil')} />
      </ScrollView>
    );
  } else {
    // A chave zera a lista quando outra pessoa entra no mesmo aparelho.
    conteudo = <ListaDeConversas key={sessao.usuario.id} meuId={sessao.usuario.id} />;
  }

  return (
    <SafeAreaView style={[estilos.tela, { backgroundColor: tema.background }]} edges={['top']}>
      {conteudo}
    </SafeAreaView>
  );
}

function ListaDeConversas({ meuId }: { meuId: string }) {
  const tema = useTheme();
  const { dados: lista, erro, recarregar } = useDadosEmFoco(listarConversas, ATUALIZAR_A_CADA_MS);

  const [puxando, setPuxando] = useState(false);

  async function puxar() {
    setPuxando(true);
    await recarregar();
    setPuxando(false);
  }

  if (!lista) {
    if (!erro) return <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
    return (
      <View style={estilos.bloco}>
        <Texto tipo="titulo">Conversas</Texto>
        <Aviso tipo="erro">{textoDoErro(erro)}</Aviso>
        <Botao titulo="Tentar de novo" onPress={recarregar} />
      </View>
    );
  }

  return (
    <FlatList
      data={lista.itens}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => <ConversaItem conversa={item} meuId={meuId} />}
      contentContainerStyle={estilos.lista}
      onRefresh={puxar}
      refreshing={puxando}
      ListHeaderComponent={
        <View style={estilos.cabecalho}>
          <Texto tipo="titulo">Conversas</Texto>
          {lista.naoLidas > 0 && (
            <Texto cor="brand" style={estilos.negrito}>
              {lista.naoLidas === 1 ? '1 mensagem nova' : `${lista.naoLidas} mensagens novas`}
            </Texto>
          )}
          {erro !== null && <Aviso tipo="erro">{`Não foi possível atualizar. ${textoDoErro(erro)}`}</Aviso>}
        </View>
      }
      ListEmptyComponent={
        <View style={estilos.vazio}>
          <Texto cor="textSecondary">
            Você ainda não tem conversas. Abra um lote em Buscar e toque em Conversar com o vendedor.
          </Texto>
          <Botao titulo="Buscar lotes" variante="secundario" onPress={() => router.navigate('/')} />
        </View>
      }
    />
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  carregando: { flex: 1 },
  bloco: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 140 },
  cabecalho: { gap: Spacing.two, paddingBottom: Spacing.one },
  lista: { gap: Spacing.three, padding: Spacing.three, paddingBottom: 140 },
  vazio: { gap: Spacing.three },
  negrito: { fontWeight: '700' },
});
