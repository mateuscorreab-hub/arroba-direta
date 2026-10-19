import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { STATUS_LOTE_ROTULO, type Lote, type StatusLote } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, marcarLoteVendido, obterLote, pausarLote, publicarLote, reativarLote, textoDoErro } from '@/lib/api';

// O lote fora da busca precisa dizer por quê, senão o vendedor acha que deu errado e anuncia de novo.
const SITUACAO: Record<StatusLote, string> = {
  rascunho: 'Ainda não foi publicado e não aparece na busca. Confira as fotos e toque em "Publicar anúncio".',
  em_analise: 'Anúncio enviado! Ele aparece na busca depois de uma revisão rápida.',
  ativo: 'Aparece na busca. Quem entrar no app vê seu telefone e pode conversar e fazer propostas.',
  encerrado: 'Pausado: não aparece na busca até você reativar.',
  negociando: 'Você fechou negócio pelo app e o lote saiu da busca. Quando o gado for entregue, marque como vendido.',
  vendido: 'Lote vendido. O anúncio não aparece mais na busca.',
};

const EDITAVEL: readonly StatusLote[] = ['rascunho', 'em_analise', 'ativo', 'encerrado'];
const PAUSAVEL: readonly StatusLote[] = ['em_analise', 'ativo'];
const VENDIVEL: readonly StatusLote[] = ['em_analise', 'ativo', 'encerrado', 'negociando'];

type Acao = 'publicar' | 'pausar' | 'reativar' | 'vender';
const CHAMADA: Record<Acao, (id: string) => Promise<Lote>> = {
  publicar: publicarLote,
  pausar: pausarLote,
  reativar: reativarLote,
  vender: marcarLoteVendido,
};

/**
 * Na tela do lote, para o vendedor: a situação do anúncio e o que dá para fazer com ele.
 * Confirma na própria tela: Alert não funciona na web.
 */
export function PainelDoVendedor({ lote, aoMudar }: { lote: Lote; aoMudar: (lote: Lote) => void }) {
  const tema = useTheme();
  const [confirmando, setConfirmando] = useState<'pausar' | 'vender' | null>(null);
  const [ocupado, setOcupado] = useState<Acao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const s = lote.status;
  // O lote mudou de situação (aqui ou por outro caminho): a confirmação e o erro de antes não valem mais.
  const [statusVisto, setStatusVisto] = useState(s);
  if (s !== statusVisto) {
    setStatusVisto(s);
    setConfirmando(null);
    setErro(null);
  }

  function abrir(tela: '/lote/[id]/editar' | '/lote/[id]/midias') {
    setErro(null);
    router.push({ pathname: tela, params: { id: lote.id } });
  }

  async function fazer(acao: Acao) {
    if (ocupado) return;
    setOcupado(acao);
    setErro(null);
    try {
      aoMudar(await CHAMADA[acao](lote.id));
      setConfirmando(null);
    } catch (e) {
      setErro(textoDoErro(e));
      // 409: o lote mudou por outro caminho (um comprador fechou negócio, por exemplo); mostra como ele está.
      if (e instanceof ErroApi && e.status === 409) {
        setConfirmando(null);
        obterLote(lote.id).then(aoMudar, () => {});
      }
    } finally {
      setOcupado(null);
    }
  }

  let acoes;
  if (confirmando === 'pausar') {
    acoes = (
      <>
        <Texto>Pausar o anúncio? Ele sai da busca até você reativar, e a proposta em aberto deixa de valer.</Texto>
        <Botao titulo="Sim, pausar" onPress={() => fazer('pausar')} carregando={ocupado === 'pausar'} />
        <Botao titulo="Voltar" variante="discreto" onPress={() => setConfirmando(null)} desabilitado={!!ocupado} />
      </>
    );
  } else if (confirmando === 'vender') {
    acoes = (
      <>
        <Texto>
          Marcar como vendido? O lote sai da busca de vez e isso não pode ser desfeito. Quem conversa com você sobre
          ele recebe um aviso.
        </Texto>
        <Botao titulo="Sim, foi vendido" onPress={() => fazer('vender')} carregando={ocupado === 'vender'} />
        <Botao titulo="Voltar" variante="discreto" onPress={() => setConfirmando(null)} desabilitado={!!ocupado} />
      </>
    );
  } else {
    acoes = (
      <>
        {s === 'rascunho' && (
          <Botao titulo="Publicar anúncio" onPress={() => fazer('publicar')} carregando={ocupado === 'publicar'} />
        )}
        {s === 'encerrado' && (
          <Botao titulo="Reativar anúncio" onPress={() => fazer('reativar')} carregando={ocupado === 'reativar'} />
        )}
        {EDITAVEL.includes(s) && (
          <>
            <Botao
              titulo="Editar anúncio"
              variante="secundario"
              onPress={() => abrir('/lote/[id]/editar')}
              desabilitado={!!ocupado}
            />
            <Botao
              titulo="Fotos e vídeo do lote"
              variante="secundario"
              onPress={() => abrir('/lote/[id]/midias')}
              desabilitado={!!ocupado}
            />
          </>
        )}
        {VENDIVEL.includes(s) && (
          <Botao
            titulo="Marcar como vendido"
            variante="secundario"
            onPress={() => setConfirmando('vender')}
            desabilitado={!!ocupado}
          />
        )}
        {PAUSAVEL.includes(s) && (
          <Botao
            titulo="Pausar anúncio"
            variante="discreto"
            onPress={() => setConfirmando('pausar')}
            desabilitado={!!ocupado}
          />
        )}
        {s !== 'rascunho' && (
          // dismissTo volta às abas que já estão na pilha, em vez de empilhar outra cópia delas.
          <Botao titulo="Ver conversas" variante="discreto" onPress={() => router.dismissTo('/conversas')} />
        )}
      </>
    );
  }

  return (
    <View style={[estilos.painel, { backgroundColor: tema.backgroundElement, borderColor: tema.border }]}>
      <Texto tipo="pequeno" cor="textSecondary">
        Seu anúncio
      </Texto>
      <Texto tipo="subtitulo" cor={s === 'ativo' ? 'brand' : 'text'}>
        {STATUS_LOTE_ROTULO[s]}
      </Texto>
      <Texto>{SITUACAO[s]}</Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {acoes}
    </View>
  );
}

const estilos = StyleSheet.create({
  painel: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
});
