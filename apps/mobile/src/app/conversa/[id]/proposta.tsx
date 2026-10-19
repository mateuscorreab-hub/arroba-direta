import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import type { ConversaDetalhe, Eu, PropostaNegociacao } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { FormularioProposta } from '@/componentes/formulario-proposta';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, obterConversa, textoDoErro } from '@/lib/api';
import { motivoIndisponivel } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

const irParaPerfil = () => router.dismissTo('/perfil');

export default function PropostaTela() {
  const { id, de } = useLocalSearchParams<{ id: string; de?: string }>();
  const tema = useTheme();
  const sessao = useSessao();

  let conteudo;
  if (sessao.carregando) {
    conteudo = <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
  } else if (!sessao.usuario) {
    conteudo = (
      <>
        <Texto>Para fazer uma proposta, entre com o número do seu celular.</Texto>
        <Botao titulo="Entrar com celular" onPress={irParaPerfil} />
      </>
    );
  } else if (!sessao.usuario.perfilCompleto) {
    conteudo = (
      <>
        <Texto>Para fazer propostas, complete seu perfil com nome, município e estado.</Texto>
        <Botao titulo="Completar perfil" onPress={irParaPerfil} />
      </>
    );
  } else {
    conteudo = <Proposta key={`${sessao.usuario.id}:${id}`} id={id} de={de} usuario={sessao.usuario} />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: tema.background }}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      {conteudo}
    </ScrollView>
  );
}

/** Volta à conversa que está embaixo ou, aberto por link, troca o formulário por ela. */
function voltarParaConversa(id: string) {
  router.dismissTo({ pathname: '/conversa/[id]', params: { id } });
}

/** Proposta de onde o formulário parte: a escolhida, a aberta ou a mais recente da conversa. */
function propostaBase(conversa: ConversaDetalhe, de: string | undefined): PropostaNegociacao | null {
  const propostas = conversa.mensagens.flatMap((m) => (m.proposta ? [m.proposta] : []));
  return (
    (de ? propostas.find((p) => p.id === de) : undefined) ?? conversa.propostaAberta ?? propostas.at(-1) ?? null
  );
}

function Proposta({ id, de, usuario }: { id: string; de: string | undefined; usuario: Eu }) {
  const tema = useTheme();
  const [conversa, setConversa] = useState<ConversaDetalhe | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    obterConversa(id).then(
      (c) => {
        if (ativo) setConversa(c);
      },
      (e: unknown) => {
        if (ativo) setErro(e);
      },
    );
    return () => {
      ativo = false;
    };
  }, [id, versao]);

  if (!conversa) {
    if (!erro) return <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
    const naoEncontrada = erro instanceof ErroApi && erro.status === 404;
    return (
      <>
        <Aviso tipo="erro">{naoEncontrada ? 'Conversa não encontrada.' : textoDoErro(erro)}</Aviso>
        {!naoEncontrada && (
          <Botao
            titulo="Tentar de novo"
            onPress={() => {
              setErro(null);
              setVersao((v) => v + 1);
            }}
          />
        )}
      </>
    );
  }

  if (conversa.negocioFechado || conversa.lote.status !== 'ativo') {
    return (
      <>
        <Aviso>
          {conversa.negocioFechado
            ? 'O negócio desta conversa já foi fechado.'
            : motivoIndisponivel(conversa.lote.status)}
        </Aviso>
        <Botao titulo="Voltar para a conversa" onPress={() => voltarParaConversa(id)} />
      </>
    );
  }

  const base = propostaBase(conversa, de);
  const respondendo = conversa.propostaAberta !== null && conversa.propostaAberta.autorId !== usuario.id;
  return (
    <>
      <Stack.Screen options={{ title: respondendo ? 'Contraproposta' : 'Nova proposta' }} />
      <FormularioProposta
        conversa={conversa}
        base={base}
        meuId={usuario.id}
        aoEnviar={() => voltarParaConversa(id)}
        aoCancelar={() => voltarParaConversa(id)}
      />
    </>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 80, flexGrow: 1 },
  carregando: { flex: 1 },
});
