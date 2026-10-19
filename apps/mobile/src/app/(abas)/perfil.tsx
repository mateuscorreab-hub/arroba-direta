import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatarTelefone, type Eu } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { EntrarComCelular } from '@/componentes/entrar-com-celular';
import { FormularioPerfil } from '@/componentes/formulario-perfil';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSessao } from '@/lib/sessao';

export default function Perfil() {
  const tema = useTheme();
  const sessao = useSessao();

  let conteudo;
  if (sessao.carregando) {
    conteudo = <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
  } else if (sessao.erro) {
    conteudo = (
      <View style={estilos.bloco}>
        <Texto tipo="titulo">Perfil</Texto>
        <Aviso tipo="erro">{`Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
        <Botao titulo="Tentar de novo" onPress={sessao.tentarDeNovo} />
        <Botao titulo="Sair" variante="discreto" onPress={sessao.sair} />
      </View>
    );
  } else if (!sessao.usuario) {
    conteudo = <EntrarComCelular />;
  } else {
    conteudo = <PerfilLogado usuario={sessao.usuario} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tema.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {conteudo}
      </ScrollView>
    </SafeAreaView>
  );
}

function PerfilLogado({ usuario }: { usuario: Eu }) {
  const tema = useTheme();
  const sessao = useSessao();
  const [editando, setEditando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  if (!usuario.perfilCompleto || editando) {
    return (
      <FormularioPerfil
        usuario={usuario}
        editando={usuario.perfilCompleto && editando}
        aoTerminar={(salvou) => {
          setEditando(false);
          setSalvo(salvou);
        }}
      />
    );
  }

  return (
    <View style={estilos.bloco}>
      <Texto tipo="titulo">Perfil</Texto>
      {salvo && <Aviso>Perfil salvo. Você já pode anunciar seu gado.</Aviso>}
      <View style={[estilos.cartao, { backgroundColor: tema.backgroundElement, borderColor: tema.border }]}>
        <Texto tipo="subtitulo">{usuario.nome}</Texto>
        <Texto>{formatarTelefone(usuario.telefone)}</Texto>
        <Texto cor="textSecondary">
          {usuario.municipio}/{usuario.uf}
        </Texto>
        {usuario.verificado && (
          <Texto cor="brand" style={estilos.negrito}>
            ✓ Verificado
          </Texto>
        )}
      </View>
      {!usuario.verificado && (
        <Aviso>
          Em breve: envie um documento com foto para ganhar o selo de verificado. Compradores confiam mais em
          quem tem o selo.
        </Aviso>
      )}
      <Botao titulo="Meus anúncios" variante="secundario" onPress={() => router.push('/meus-anuncios')} />
      <Botao
        titulo="Editar perfil"
        variante="secundario"
        onPress={() => {
          setSalvo(false);
          setEditando(true);
        }}
      />
      <Botao titulo="Sair" variante="discreto" onPress={sessao.sair} />
    </View>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, paddingBottom: 140, flexGrow: 1 },
  carregando: { flex: 1 },
  bloco: { gap: Spacing.three },
  cartao: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  negrito: { fontWeight: '700' },
});
