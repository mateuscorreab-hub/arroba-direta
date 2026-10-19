import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MENSAGEM_MAX,
  formatarReais,
  mensagemCriarSchema,
  type ConversaDetalhe,
  type Eu,
  type Mensagem,
} from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { BalaoMensagem } from '@/componentes/balao-mensagem';
import { Botao } from '@/componentes/botao';
import { CartaoProposta } from '@/componentes/cartao-proposta';
import { LinhaContato } from '@/componentes/contato-vendedor';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useDadosEmFoco } from '@/hooks/use-dados-em-foco';
import { useTheme } from '@/hooks/use-theme';
import { consumirAbrirProposta } from '@/lib/abrir-proposta';
import { ErroApi, aceitarProposta, enviarMensagem, obterConversa, recusarProposta, textoDoErro } from '@/lib/api';
import { DICA_SEGURANCA } from '@/lib/contato';
import { cabecas, precoDoLote } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

const ATUALIZAR_A_CADA_MS = 5_000;
// dismissTo volta às abas que já estão na pilha, em vez de empilhar outra cópia delas.
const irParaPerfil = () => router.dismissTo('/perfil');

export default function ConversaTela() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tema = useTheme();
  const sessao = useSessao();

  if (sessao.carregando) return <Carregando />;
  if (!sessao.usuario) {
    return (
      <ScrollView style={{ backgroundColor: tema.background }} contentContainerStyle={estilos.bloco}>
        {sessao.erro ? (
          <>
            <Aviso tipo="erro">{`Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
            <Botao titulo="Tentar de novo" onPress={sessao.tentarDeNovo} />
          </>
        ) : (
          <>
            <Texto>Para ver esta conversa, entre com o número do seu celular.</Texto>
            <Botao titulo="Entrar com celular" onPress={irParaPerfil} />
          </>
        )}
      </ScrollView>
    );
  }
  return <Conversa key={`${sessao.usuario.id}:${id}`} id={id} usuario={sessao.usuario} />;
}

function Carregando() {
  const tema = useTheme();
  return (
    <ActivityIndicator size="large" color={tema.brand} style={[estilos.tela, { backgroundColor: tema.background }]} />
  );
}

function Conversa({ id, usuario }: { id: string; usuario: Eu }) {
  const tema = useTheme();
  const margens = useSafeAreaInsets();
  const buscar = useCallback(() => obterConversa(id), [id]);
  const { dados: conversa, erro, recarregar, definir } = useDadosEmFoco(buscar, ATUALIZAR_A_CADA_MS);
  const tecladoAberto = useTecladoAberto();
  // Distância do topo da janela até a tela (cabeçalho e barra de status), para o teclado não cobrir o campo.
  const [topo, setTopo] = useState(0);
  const raiz = useRef<View>(null);
  const rolagem = useRef<ScrollView>(null);
  const seguirFim = useRef(true);
  const rolouUmaVez = useRef(false);

  // Só depois de carregar: abrir junto com a conversa faria o navegador guardar uma tela só no histórico.
  const carregada = conversa !== null;
  useEffect(() => {
    if (carregada && consumirAbrirProposta(id)) {
      router.push({ pathname: '/conversa/[id]/proposta', params: { id } });
    }
  }, [carregada, id]);

  if (!conversa) {
    if (!erro) {
      return <Carregando />;
    }
    const naoEncontrada = erro instanceof ErroApi && erro.status === 404;
    return (
      <ScrollView style={{ backgroundColor: tema.background }} contentContainerStyle={estilos.bloco}>
        <Aviso tipo="erro">{naoEncontrada ? 'Conversa não encontrada.' : textoDoErro(erro)}</Aviso>
        {naoEncontrada ? (
          <Botao titulo="Ver conversas" onPress={() => router.dismissTo('/conversas')} />
        ) : (
          <Botao titulo="Tentar de novo" onPress={recarregar} />
        )}
      </ScrollView>
    );
  }

  const { lote, outraParte } = conversa;
  const meuId = usuario.id;
  const podeNegociar = !conversa.negocioFechado && lote.status === 'ativo' && usuario.perfilCompleto;

  function irParaFim() {
    if (!seguirFim.current) return;
    rolagem.current?.scrollToEnd({ animated: rolouUmaVez.current });
    rolouUmaVez.current = true;
  }

  function aoRolar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    seguirFim.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 80;
  }

  async function responder(acao: () => Promise<ConversaDetalhe>) {
    try {
      const nova = await acao();
      seguirFim.current = true;
      definir(() => nova);
    } finally {
      recarregar();
    }
  }

  function mensagemEnviada(m: Mensagem) {
    seguirFim.current = true;
    definir((c) => (c.mensagens.some((x) => x.id === m.id) ? c : { ...c, mensagens: [...c.mensagens, m] }));
    recarregar();
  }

  function fazerProposta(de?: string) {
    router.navigate({ pathname: '/conversa/[id]/proposta', params: de ? { id, de } : { id } });
  }

  return (
    <View
      ref={raiz}
      style={[estilos.tela, { backgroundColor: tema.background }]}
      onLayout={() => raiz.current?.measureInWindow((_x, y) => setTopo(y))}>
      <Stack.Screen options={{ title: outraParte.nome }} />
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior="padding"
        enabled={Platform.OS !== 'web'}
        // O teclado cobre a margem de baixo, que o rodapé já reserva: sem descontar, sobra uma faixa vazia.
        keyboardVerticalOffset={topo - margens.bottom}>
        <View style={[estilos.cabecalho, { backgroundColor: tema.backgroundElement, borderColor: tema.border }]}>
          <Pressable
            onPress={() => router.navigate({ pathname: '/lote/[id]', params: { id: lote.id } })}
            accessibilityRole="link"
            accessibilityHint="Abre o anúncio do lote">
            <Texto tipo="destaque" numberOfLines={tecladoAberto ? 1 : 2}>
              {lote.titulo}
            </Texto>
            <Texto cor="brand" style={estilos.negrito}>
              {precoDoLote(lote)} · {cabecas(lote.quantidade)}
            </Texto>
          </Pressable>
          {!tecladoAberto && (
            <Texto tipo="pequeno" cor="textSecondary">
              {conversa.papel === 'comprador' ? 'Vendedor' : 'Comprador'}: {outraParte.nome}
              {outraParte.verificado ? ' ✓' : ''} · {outraParte.municipio}/{outraParte.uf}
            </Texto>
          )}
          {!tecladoAberto && outraParte.telefone && (
            <LinhaContato
              telefone={outraParte.telefone}
              nome={outraParte.nome}
              titulo={lote.titulo}
              papel={conversa.papel}
            />
          )}
          {conversa.negocioFechado ? (
            !tecladoAberto && (
              <Aviso>
                <Texto tipo="destaque" cor="brand">
                  Negócio fechado
                </Texto>
                {conversa.pedido && (
                  <Texto>
                    Valor total: <Texto style={estilos.negrito}>{formatarReais(conversa.pedido.valorTotal)}</Texto>
                  </Texto>
                )}
                <Texto tipo="pequeno" cor="textSecondary">
                  Combinem o pagamento e o embarque direto entre vocês. {DICA_SEGURANCA[conversa.papel]}
                </Texto>
              </Aviso>
            )
          ) : (
            !tecladoAberto &&
            lote.status !== 'ativo' && <Aviso>Este lote não está mais disponível para negociação.</Aviso>
          )}
        </View>

        <ScrollView
          ref={rolagem}
          style={estilos.tela}
          contentContainerStyle={estilos.mensagens}
          keyboardShouldPersistTaps="handled"
          onScroll={aoRolar}
          scrollEventThrottle={100}
          onContentSizeChange={irParaFim}
          onLayout={irParaFim}>
          {conversa.mensagens.length === 0 && (
            <Texto cor="textSecondary" style={estilos.centro}>
              Nenhuma mensagem ainda. Mande uma pergunta para {outraParte.nome} ou faça uma proposta.
            </Texto>
          )}
          {conversa.mensagens.map((m) => {
            if (m.tipo !== 'proposta') {
              return <BalaoMensagem key={m.id} mensagem={m} minha={m.autorId === meuId} />;
            }
            const p = m.proposta;
            if (!p) return null;
            const aberta = conversa.propostaAberta?.id === p.id;
            return (
              <CartaoProposta
                key={m.id}
                proposta={p}
                minha={p.autorId === meuId}
                nomeOutraParte={outraParte.nome}
                aberta={aberta}
                podeResponder={aberta && podeNegociar && p.autorId !== meuId}
                aoAceitar={() => responder(() => aceitarProposta(p.id))}
                aoRecusar={() => responder(() => recusarProposta(p.id))}
                aoContrapropor={() => fazerProposta(p.id)}
              />
            );
          })}
        </ScrollView>

        <View
          style={[
            estilos.rodape,
            { borderColor: tema.border, backgroundColor: tema.background, paddingBottom: margens.bottom + Spacing.two },
          ]}>
          {erro !== null && (
            <Aviso tipo="erro">{`Não foi possível atualizar a conversa. ${textoDoErro(erro)}`}</Aviso>
          )}
          {usuario.perfilCompleto ? (
            <Escrever
              conversaId={id}
              podePropor={podeNegociar && !tecladoAberto}
              aoPropor={() => fazerProposta()}
              aoEnviar={mensagemEnviada}
            />
          ) : (
            <>
              <Texto>Para responder e fazer propostas, complete seu perfil com nome, município e estado.</Texto>
              <Botao titulo="Completar perfil" onPress={irParaPerfil} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Teclado na tela, pelos eventos do teclado e não pelo foco do campo: no Android, fechar o teclado
 * com Voltar deixa o campo focado. Na web não há teclado virtual a considerar.
 */
function useTecladoAberto() {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ios = Platform.OS === 'ios';
    const abriu = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setAberto(true));
    const fechou = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setAberto(false));
    return () => {
      abriu.remove();
      fechou.remove();
    };
  }, []);
  return aberto;
}

function Escrever({
  conversaId,
  podePropor,
  aoPropor,
  aoEnviar,
}: {
  conversaId: string;
  podePropor: boolean;
  aoPropor: () => void;
  aoEnviar: (m: Mensagem) => void;
}) {
  const tema = useTheme();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (enviando) return;
    const r = mensagemCriarSchema.safeParse({ texto });
    if (!r.success) {
      if (texto.trim() !== '') setErro(r.error.issues[0]?.message ?? 'Confira a mensagem.');
      return;
    }
    const enviado = r.data.texto;
    setEnviando(true);
    setErro(null);
    setTexto('');
    try {
      aoEnviar(await enviarMensagem(conversaId, enviado));
    } catch (e) {
      setTexto((atual) => (atual === '' ? enviado : atual));
      setErro(textoDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  // No navegador, Enter envia e Shift+Enter quebra a linha.
  function aoTeclar(e: TextInputKeyPressEvent) {
    if (Platform.OS !== 'web') return;
    const tecla = e.nativeEvent as { key: string; shiftKey?: boolean; isComposing?: boolean };
    if (tecla.key === 'Enter' && !tecla.shiftKey && !tecla.isComposing) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {podePropor && <Botao titulo="Fazer proposta" variante="secundario" onPress={aoPropor} />}
      <View style={estilos.linhaEscrever}>
        <TextInput
          value={texto}
          onChangeText={(v) => {
            setTexto(v);
            if (erro) setErro(null);
          }}
          onKeyPress={aoTeclar}
          placeholder="Escreva uma mensagem"
          placeholderTextColor={tema.textSecondary}
          accessibilityLabel="Mensagem"
          multiline
          maxLength={MENSAGEM_MAX}
          style={[
            estilos.entrada,
            { color: tema.text, borderColor: tema.border, backgroundColor: tema.backgroundElement },
          ]}
        />
        <Botao titulo="Enviar" onPress={enviar} carregando={enviando} desabilitado={texto.trim() === ''} />
      </View>
    </>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  bloco: { padding: Spacing.three, gap: Spacing.three },
  cabecalho: { borderBottomWidth: 1, padding: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
  negrito: { fontWeight: '700' },
  mensagens: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1, justifyContent: 'flex-end' },
  centro: { textAlign: 'center' },
  rodape: { borderTopWidth: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.two },
  linhaEscrever: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  entrada: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    minHeight: 52,
    maxHeight: 140,
  },
});
