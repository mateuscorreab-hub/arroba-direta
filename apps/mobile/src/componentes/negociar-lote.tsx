import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { ConversaResumo, Lote, StatusLote } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { ContatoVendedor } from '@/componentes/contato-vendedor';
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
    // O vendedor cuida do anúncio no painel do alto da tela (PainelDoVendedor).
    return null;
  } else if (lote.status !== 'ativo') {
    conteudo = <LoteIndisponivel lote={lote} usuarioId={usuario?.id} />;
  } else if (!usuario) {
    conteudo = (
      <>
        <Texto cor="textSecondary">
          Para ver o telefone do vendedor, conversar ou fazer uma proposta, entre com o número do seu celular.
        </Texto>
        <Botao titulo="Ver telefone do vendedor" onPress={irParaPerfil} />
        <Botao titulo="Conversar pelo app" variante="secundario" onPress={irParaPerfil} />
      </>
    );
  } else if (!usuario.perfilCompleto) {
    conteudo = (
      <>
        <ContatoVendedor lote={lote} />
        <Aviso>
          Para conversar pelo app ou fazer uma proposta, complete seu perfil com nome, município e estado. O vendedor
          vê esses dados e o seu celular.
        </Aviso>
        <Botao titulo="Completar perfil" variante="secundario" onPress={irParaPerfil} />
      </>
    );
  } else {
    conteudo = (
      <>
        <ContatoVendedor lote={lote} />
        <BotoesNegociar loteId={lote.id} />
      </>
    );
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
        titulo="Conversar pelo app"
        variante="secundario"
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
      <Texto tipo="pequeno" cor="textSecondary">
        Ao conversar pelo app, o vendedor vê seu nome, município e celular.
      </Texto>
    </>
  );
}

const POR_QUE_INDISPONIVEL: Partial<Record<StatusLote, string>> = {
  vendido: 'Este lote já foi vendido.',
  encerrado: 'O vendedor pausou este anúncio. Ele pode voltar mais tarde.',
};

/** Lote fora de negociação: só dá para abrir a conversa que já existia. */
function LoteIndisponivel({ lote, usuarioId }: { lote: Lote; usuarioId: string | undefined }) {
  const loteId = lote.id;
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
      <Aviso>{POR_QUE_INDISPONIVEL[lote.status] ?? 'Este lote não está disponível para negociação no momento.'}</Aviso>
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
