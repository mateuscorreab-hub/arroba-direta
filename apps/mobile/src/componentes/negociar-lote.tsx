import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { ConversaResumo, Lote } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { abrirPropostaAoCarregar } from '@/lib/abrir-proposta';
import { abrirConversa, listarConversas, textoDoErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

// dismissTo volta às abas que já estão na pilha, em vez de empilhar outra cópia delas.
const irParaPerfil = () => router.dismissTo('/perfil');
// navigate e não push: um toque duplo não abre a conversa duas vezes.
const irParaConversa = (id: string) => router.navigate({ pathname: '/conversa/[id]', params: { id } });

/** Botões de negociação na tela do lote, conforme quem está vendo e a situação do lote. */
export function NegociarLote({ lote }: { lote: Lote }) {
  const tema = useTheme();
  const sessao = useSessao();
  const usuario = sessao.usuario;

  let conteudo;
  if (sessao.carregando) {
    conteudo = <ActivityIndicator color={tema.brand} />;
  } else if (sessao.erro) {
    conteudo = (
      <>
        <Aviso tipo="erro">{`Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
        <Botao titulo="Tentar de novo" variante="secundario" onPress={sessao.tentarDeNovo} />
      </>
    );
  } else if (usuario && usuario.id === lote.vendedor.id) {
    conteudo = (
      <>
        <Aviso>
          {lote.status === 'em_analise'
            ? 'Este anúncio é seu. Ele está em revisão e ainda não aparece na busca.'
            : 'Este anúncio é seu. As conversas com compradores ficam na aba Conversas.'}
        </Aviso>
        <Botao titulo="Ver conversas" variante="secundario" onPress={() => router.dismissTo('/conversas')} />
      </>
    );
  } else if (lote.status !== 'ativo') {
    conteudo = <LoteIndisponivel loteId={lote.id} usuarioId={usuario?.id} />;
  } else if (!usuario) {
    conteudo = (
      <>
        <Texto cor="textSecondary">
          Para conversar com o vendedor ou fazer uma proposta, entre com o número do seu celular.
        </Texto>
        <Botao titulo="Conversar com o vendedor" onPress={irParaPerfil} />
        <Botao titulo="Fazer proposta" variante="secundario" onPress={irParaPerfil} />
      </>
    );
  } else if (!usuario.perfilCompleto) {
    conteudo = (
      <>
        <Aviso>Para negociar, complete seu perfil com nome, município e estado. O vendedor vê esses dados.</Aviso>
        <Botao titulo="Completar perfil" onPress={irParaPerfil} />
      </>
    );
  } else {
    conteudo = <BotoesNegociar loteId={lote.id} />;
  }

  return <View style={estilos.bloco}>{conteudo}</View>;
}

function BotoesNegociar({ loteId }: { loteId: string }) {
  const [ocupado, setOcupado] = useState<'conversar' | 'propor' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir(acao: 'conversar' | 'propor') {
    if (ocupado) return;
    setOcupado(acao);
    setErro(null);
    try {
      const conversa = await abrirConversa(loteId);
      // Com "Fazer proposta", a conversa abre o formulário por cima: voltar dele leva à conversa.
      if (acao === 'propor') abrirPropostaAoCarregar(conversa.id);
      irParaConversa(conversa.id);
    } catch (e) {
      setErro(textoDoErro(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      <Botao
        titulo="Conversar com o vendedor"
        onPress={() => abrir('conversar')}
        carregando={ocupado === 'conversar'}
        desabilitado={ocupado !== null}
      />
      <Botao
        titulo="Fazer proposta"
        variante="secundario"
        onPress={() => abrir('propor')}
        carregando={ocupado === 'propor'}
        desabilitado={ocupado !== null}
      />
    </>
  );
}

/** Lote fora de negociação: só dá para abrir a conversa que já existia. */
function LoteIndisponivel({ loteId, usuarioId }: { loteId: string; usuarioId: string | undefined }) {
  const [existente, setExistente] = useState<{ usuarioId: string; conversa: ConversaResumo | null } | null>(null);

  useEffect(() => {
    if (!usuarioId) return;
    let ativo = true;
    listarConversas().then(
      (lista) => {
        if (ativo) setExistente({ usuarioId, conversa: lista.itens.find((c) => c.lote.id === loteId) ?? null });
      },
      () => {},
    );
    return () => {
      ativo = false;
    };
  }, [loteId, usuarioId]);

  const conversa = existente && existente.usuarioId === usuarioId ? existente.conversa : null;
  return (
    <>
      <Aviso>Este lote não está disponível para negociação no momento.</Aviso>
      {conversa && (
        <Botao
          titulo={conversa.negocioFechado ? 'Ver negócio fechado' : 'Abrir sua conversa'}
          variante="secundario"
          onPress={() => irParaConversa(conversa.id)}
        />
      )}
    </>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: Spacing.three },
});
