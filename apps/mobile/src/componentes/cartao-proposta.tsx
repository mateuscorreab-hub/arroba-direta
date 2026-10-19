import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FRETE_ROTULO, STATUS_PROPOSTA_ROTULO, formatarReais, type PropostaNegociacao } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { textoDoErro } from '@/lib/api';
import { cabecas, formatarData, formatarDataHora, precoDaProposta } from '@/lib/formato';

type Props = {
  proposta: PropostaNegociacao;
  minha: boolean;
  nomeOutraParte: string;
  /** É a proposta aberta da conversa (aguardando resposta e dentro do prazo). */
  aberta: boolean;
  /** Mostra Aceitar, Contraproposta e Recusar. */
  podeResponder: boolean;
  aoAceitar: () => Promise<void>;
  aoRecusar: () => Promise<void>;
  aoContrapropor: () => void;
};

/** Proposta dentro da conversa, com os termos e a resposta. Confirma na própria tela: Alert não funciona na web. */
export function CartaoProposta({
  proposta: p,
  minha,
  nomeOutraParte,
  aberta,
  podeResponder,
  aoAceitar,
  aoRecusar,
  aoContrapropor,
}: Props) {
  const tema = useTheme();
  const [confirmando, setConfirmando] = useState<'aceitar' | 'recusar' | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function responder(acao: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      await acao();
    } catch (e) {
      setErro(textoDoErro(e));
    } finally {
      setOcupado(false);
      setConfirmando(null);
    }
  }

  const situacao = aberta
    ? minha
      ? `Aguardando resposta de ${nomeOutraParte}`
      : 'Aguardando sua resposta'
    : STATUS_PROPOSTA_ROTULO[p.status];
  const destacada = aberta || p.status === 'aceita';

  return (
    <View
      style={[
        estilos.cartao,
        minha ? estilos.minha : estilos.outra,
        { backgroundColor: tema.backgroundElement, borderColor: destacada ? tema.brand : tema.border },
      ]}>
      <Texto tipo="pequeno" cor="textSecondary">
        {minha ? 'Sua proposta' : `Proposta de ${nomeOutraParte}`}
      </Texto>
      <Texto tipo="destaque" cor="brand">
        {precoDaProposta(p)}
      </Texto>
      <View style={estilos.termos}>
        <Texto>Quantidade: {cabecas(p.quantidade)}</Texto>
        {p.unidadePreco !== 'cabeca' && <Texto>Quebra: {String(p.quebraPercentual).replace('.', ',')}%</Texto>}
        <Texto>{FRETE_ROTULO[p.fretePorConta]}</Texto>
        <Texto>Embarque: {formatarData(p.dataEmbarque)}</Texto>
      </View>
      <Texto style={estilos.negrito}>Valor estimado: {formatarReais(p.valorEstimado)}</Texto>
      {p.mensagem ? <Texto cor="textSecondary">“{p.mensagem}”</Texto> : null}
      <Texto tipo="pequeno" cor={destacada ? 'brand' : 'textSecondary'} style={estilos.negrito}>
        {situacao}
      </Texto>
      {aberta && (
        <Texto tipo="pequeno" cor="textSecondary">
          Vale até {formatarDataHora(p.expiraEm)}
        </Texto>
      )}

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {podeResponder && confirmando === 'aceitar' && (
        <View style={estilos.acoes}>
          <Texto>
            {`Aceitar esta proposta? O negócio fica fechado nestes termos (${cabecas(p.quantidade)} a ` +
              `${precoDaProposta(p)}, valor estimado de ${formatarReais(p.valorEstimado)}) ` +
              'e o lote sai da busca.'}
          </Texto>
          <Botao titulo="Sim, aceitar" onPress={() => responder(aoAceitar)} carregando={ocupado} />
          <Botao titulo="Voltar" variante="discreto" onPress={() => setConfirmando(null)} desabilitado={ocupado} />
        </View>
      )}
      {podeResponder && confirmando === 'recusar' && (
        <View style={estilos.acoes}>
          <Texto>Recusar esta proposta? Vocês continuam conversando e podem fazer outras propostas.</Texto>
          <Botao titulo="Sim, recusar" onPress={() => responder(aoRecusar)} carregando={ocupado} />
          <Botao titulo="Voltar" variante="discreto" onPress={() => setConfirmando(null)} desabilitado={ocupado} />
        </View>
      )}
      {podeResponder && confirmando === null && (
        <View style={estilos.acoes}>
          <Botao titulo="Aceitar" onPress={() => setConfirmando('aceitar')} />
          <Botao titulo="Contraproposta" variante="secundario" onPress={aoContrapropor} />
          <Botao titulo="Recusar" variante="discreto" onPress={() => setConfirmando('recusar')} />
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { width: '92%', maxWidth: 480, borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  minha: { alignSelf: 'flex-end' },
  outra: { alignSelf: 'flex-start' },
  termos: { gap: 2, marginVertical: Spacing.one },
  negrito: { fontWeight: '700' },
  acoes: { gap: Spacing.two, marginTop: Spacing.two },
});
