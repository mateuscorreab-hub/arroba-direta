import { Image } from 'expo-image';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MAX_FOTOS_LOTE, MAX_VIDEOS_LOTE, type Lote, type Midia } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { AvisoPermissao } from '@/componentes/aviso-permissao';
import { Botao } from '@/componentes/botao';
import { BotaoPequeno } from '@/componentes/botao-pequeno';
import { BotoesEscolha } from '@/componentes/botoes-escolha';
import { DicaFotos } from '@/componentes/dica-fotos';
import { LARGURA_MAXIMA } from '@/componentes/galeria-lote';
import { LinhaEnvio } from '@/componentes/linha-envio';
import { ManterTelaLigada } from '@/componentes/manter-tela-ligada';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useAvisarAoFechar } from '@/hooks/use-avisar-ao-fechar';
import { useEscolhaMidia, type Escolha } from '@/hooks/use-escolha-midia';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, apagarMidia, obterLote, ordenarMidias, textoDoErro } from '@/lib/api';
import { useFilaEnvio } from '@/lib/fila-envio';
import { duracaoTexto } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

const ordenar = (l: Midia[]) => [...l].sort((a, b) => a.ordem - b.ordem);

function verLote(id: string) {
  router.replace({ pathname: '/lote/[id]', params: { id } });
}

export default function MidiasDoLote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tema = useTheme();
  const sessao = useSessao();
  const [lote, setLote] = useState<Lote | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    obterLote(id).then(
      (l) => {
        if (!ativo) return;
        setLote(l);
        setErro(null);
      },
      (e: unknown) => {
        if (ativo) setErro(textoDoErro(e));
      },
    );
    return () => {
      ativo = false;
    };
  }, [id, versao]);

  if (lote && sessao.usuario?.id === lote.vendedor.id) return <EditorMidias lote={lote} />;

  let conteudo;
  if (sessao.carregando || (!lote && !erro)) {
    conteudo = <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
  } else if (!lote || sessao.erro) {
    conteudo = (
      <>
        <Aviso tipo="erro">{erro ?? `Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
        <Botao
          titulo="Tentar de novo"
          onPress={() => {
            if (sessao.erro) sessao.tentarDeNovo();
            setErro(null);
            setVersao((v) => v + 1);
          }}
        />
      </>
    );
  } else if (!sessao.usuario) {
    conteudo = (
      <>
        <Texto cor="textSecondary">Para mudar as fotos e o vídeo, entre com o celular de quem anunciou o lote.</Texto>
        <Botao titulo="Entrar com celular" onPress={() => router.navigate('/perfil')} />
      </>
    );
  } else {
    conteudo = (
      <>
        <Aviso>Só o vendedor do lote pode mudar as fotos e o vídeo.</Aviso>
        <Botao titulo="Ver o lote" variante="secundario" onPress={() => verLote(lote.id)} />
      </>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: tema.background }} contentContainerStyle={estilos.rolagem}>
      <View style={estilos.coluna}>{conteudo}</View>
    </ScrollView>
  );
}

function EditorMidias({ lote }: { lote: Lote }) {
  const tema = useTheme();
  const janela = useWindowDimensions();
  const navigation = useNavigation();
  const [midias, setMidias] = useState(() => ordenar(lote.midias ?? []));
  const fila = useFilaEnvio(lote.id, setMidias);
  const escolha = useEscolhaMidia();
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const saidaPendente = useRef<NavigationAction | null>(null);
  const rolagem = useRef<ScrollView>(null);

  // Conta também o que está na fila (menos o que falhou de vez) para não passar do limite.
  const naFila = (tipo: Midia['tipo']) =>
    fila.itens.filter((i) => i.arquivo.tipo === tipo && (i.estado !== 'erro' || i.podeTentarDeNovo)).length;
  const fotos = midias.filter((m) => m.tipo === 'foto');
  const videos = midias.filter((m) => m.tipo === 'video');
  const fotosRestantes = Math.max(0, MAX_FOTOS_LOTE - fotos.length - naFila('foto'));
  const podeVideo = videos.length + naFila('video') < MAX_VIDEOS_LOTE;
  const capaId = (fotos[0] ?? videos[0])?.id;
  const enviando = fila.itens.some((i) => i.estado !== 'erro');
  const desligado = fila.desligado !== null;

  // Qualquer saída (Concluir, seta do topo, voltar do Android, gesto do iPhone) pergunta antes de cancelar o envio.
  // A pergunta fica no fim da tela: rola até ela (de novo, se a pessoa já tinha subido).
  usePreventRemove(enviando, ({ data }) => {
    saidaPendente.current = data.action;
    setConfirmarSaida(true);
    rolagem.current?.scrollToEnd({ animated: true });
  });

  useEffect(() => {
    if (confirmarSaida) rolagem.current?.scrollToEnd({ animated: true });
  }, [confirmarSaida]);

  // Na web, recarregar ou fechar a aba também cancela o envio.
  useAvisarAoFechar(enviando);

  const larguraUtil = Math.min(janela.width - Spacing.three * 2, LARGURA_MAXIMA);
  const colunas = larguraUtil >= 520 ? 3 : 2;
  const larguraItem = Math.floor((larguraUtil - Spacing.three * (colunas - 1)) / colunas);

  async function escolher(acao: Escolha) {
    setAviso(null);
    const r = await escolha.escolher(acao, fotosRestantes);
    if (r.aviso) setAviso(r.aviso);
    if (r.arquivos.length > 0) fila.adicionar(r.arquivos);
  }

  async function apagar(m: Midia) {
    setOcupada(m.id);
    setAviso(null);
    try {
      await apagarMidia(lote.id, m.id);
      setMidias((l) => l.filter((x) => x.id !== m.id));
    } catch (e) {
      if (e instanceof ErroApi && e.status === 404) setMidias((l) => l.filter((x) => x.id !== m.id));
      else setAviso({ tipo: 'erro', texto: textoDoErro(e) });
    } finally {
      setOcupada(null);
      setConfirmando(null);
    }
  }

  async function usarComoCapa(m: Midia) {
    setOcupada(m.id);
    setAviso(null);
    try {
      const nova = ordenar(await ordenarMidias(lote.id, [m.id, ...midias.filter((x) => x.id !== m.id).map((x) => x.id)]));
      // Mantém o que terminou de enviar enquanto a ordem era salva.
      setMidias((atual) => [...nova, ...atual.filter((x) => !nova.some((n) => n.id === x.id))]);
    } catch (e) {
      // 400: a lista do servidor mudou no meio (outro envio terminou); pega a ordem atual.
      const mudou = e instanceof ErroApi && e.status === 400;
      setAviso({ tipo: 'erro', texto: mudou ? 'As fotos mudaram enquanto a capa era salva. Tente de novo.' : textoDoErro(e) });
      if (mudou) {
        obterLote(lote.id).then(
          (l) => setMidias(ordenar(l.midias ?? [])),
          () => {},
        );
      }
    } finally {
      setOcupada(null);
    }
  }

  function sair() {
    if (router.canGoBack()) router.back();
    else verLote(lote.id);
  }

  function sairSemTerminar() {
    const acao = saidaPendente.current;
    saidaPendente.current = null;
    setConfirmarSaida(false);
    // A mesma saída que foi segurada; repetida, ela não é segurada de novo.
    if (acao) navigation.dispatch(acao);
  }

  return (
    <ScrollView ref={rolagem} style={{ backgroundColor: tema.background }} contentContainerStyle={estilos.rolagem}>
      {enviando && <ManterTelaLigada />}
      <View style={estilos.coluna}>
        <View style={estilos.bloco}>
          <Texto tipo="subtitulo">{lote.titulo}</Texto>
          <Texto cor="textSecondary">
            Até {MAX_FOTOS_LOTE} fotos e 1 vídeo de até 1 minuto. A primeira foto é a capa do anúncio.
          </Texto>
        </View>
        <DicaFotos />

        {fila.desligado && <Aviso tipo="erro">{fila.desligado}</Aviso>}
        {escolha.permissao && <AvisoPermissao permissao={escolha.permissao} />}
        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

        <BotoesEscolha
          aoEscolher={escolher}
          preparando={escolha.preparando}
          desabilitado={desligado}
          fotosRestantes={fotosRestantes}
          podeVideo={podeVideo}
          semLugarFoto={`O lote já tem ${MAX_FOTOS_LOTE} fotos. Apague uma para colocar outra.`}
          semLugarVideo="O lote já tem um vídeo. Apague o atual para enviar outro."
        />

        {fila.itens.length > 0 && (
          <View style={estilos.bloco}>
            <Texto tipo="subtitulo">Enviando</Texto>
            {enviando && (
              <Texto tipo="pequeno" cor="textSecondary">
                Deixe o app aberto e a tela ligada até terminar o envio.
              </Texto>
            )}
            {fila.itens.map((item) => (
              <LinhaEnvio
                key={item.chave}
                item={item}
                aoTentarDeNovo={() => fila.tentarDeNovo(item.chave)}
                aoRemover={() => fila.remover(item.chave)}
              />
            ))}
          </View>
        )}

        <View style={estilos.bloco}>
          <Texto tipo="subtitulo">No anúncio</Texto>
          <Texto tipo="pequeno" cor="textSecondary">
            {`${fotos.length} de ${MAX_FOTOS_LOTE} fotos · ${videos.length > 0 ? '1 vídeo' : 'sem vídeo'}`}
          </Texto>
          {midias.length === 0 ? (
            <Texto cor="textSecondary">Nenhuma foto ainda.</Texto>
          ) : (
            <View style={estilos.grade}>
              {midias.map((m) => (
                <CartaoMidia
                  key={m.id}
                  midia={m}
                  largura={larguraItem}
                  capa={m.id === capaId}
                  ocupada={ocupada === m.id}
                  bloqueada={ocupada !== null}
                  confirmando={confirmando === m.id}
                  aoUsarComoCapa={() => usarComoCapa(m)}
                  aoPedirApagar={() => setConfirmando(m.id)}
                  aoConfirmarApagar={() => apagar(m)}
                  aoCancelar={() => setConfirmando(null)}
                />
              ))}
            </View>
          )}
        </View>

        {confirmarSaida && enviando ? (
          <Aviso>
            <Texto>Ainda tem arquivo enviando. Se sair agora, ele não entra no anúncio.</Texto>
            <Botao titulo="Esperar terminar" onPress={() => setConfirmarSaida(false)} />
            <Botao titulo="Sair sem terminar" variante="discreto" onPress={sairSemTerminar} />
          </Aviso>
        ) : (
          <Botao titulo="Concluir" onPress={sair} />
        )}
      </View>
    </ScrollView>
  );
}

function CartaoMidia({
  midia,
  largura,
  capa,
  ocupada,
  bloqueada,
  confirmando,
  aoUsarComoCapa,
  aoPedirApagar,
  aoConfirmarApagar,
  aoCancelar,
}: {
  midia: Midia;
  largura: number;
  capa: boolean;
  ocupada: boolean;
  bloqueada: boolean;
  confirmando: boolean;
  aoUsarComoCapa: () => void;
  aoPedirApagar: () => void;
  aoConfirmarApagar: () => void;
  aoCancelar: () => void;
}) {
  const tema = useTheme();
  const foto = midia.tipo === 'foto';
  return (
    <View style={[estilos.cartao, { width: largura }]}>
      <View style={[estilos.miniatura, { height: Math.round((largura * 3) / 4), backgroundColor: tema.backgroundSelected }]}>
        <Image
          source={{ uri: midia.miniatura }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          accessibilityLabel={foto ? (capa ? 'Foto de capa' : 'Foto do lote') : 'Vídeo do lote'}
        />
        {capa && (
          <View style={[estilos.etiqueta, estilos.etiquetaTopo, { backgroundColor: tema.brand }]}>
            <Texto tipo="pequeno" cor="onBrand" style={estilos.negrito}>
              Capa
            </Texto>
          </View>
        )}
        {!foto && (
          <View style={[estilos.etiqueta, estilos.etiquetaBaixo, { backgroundColor: tema.background }]}>
            <Texto tipo="pequeno">{`▶ Vídeo${midia.duracaoSeg ? ` · ${duracaoTexto(midia.duracaoSeg)}` : ''}`}</Texto>
          </View>
        )}
        {ocupada && (
          <View style={estilos.sobre}>
            <View style={[estilos.girando, { backgroundColor: tema.background }]}>
              <ActivityIndicator color={tema.brand} />
            </View>
          </View>
        )}
      </View>
      {confirmando ? (
        <>
          <Texto tipo="pequeno">{foto ? 'Apagar esta foto?' : 'Apagar este vídeo?'}</Texto>
          <BotaoPequeno titulo="Sim, apagar" tipo="perigoCheio" onPress={aoConfirmarApagar} desabilitado={ocupada} />
          <BotaoPequeno titulo="Cancelar" onPress={aoCancelar} desabilitado={ocupada} />
        </>
      ) : (
        <>
          {foto && !capa && <BotaoPequeno titulo="Usar como capa" onPress={aoUsarComoCapa} desabilitado={bloqueada} />}
          <BotaoPequeno titulo="Apagar" tipo="perigo" onPress={aoPedirApagar} desabilitado={bloqueada} />
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  rolagem: { padding: Spacing.three, paddingBottom: Spacing.five * 2, flexGrow: 1 },
  coluna: { width: '100%', maxWidth: LARGURA_MAXIMA, alignSelf: 'center', gap: Spacing.four, flexGrow: 1 },
  carregando: { flex: 1 },
  bloco: { gap: Spacing.two },
  grade: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.three },
  cartao: { gap: Spacing.two },
  miniatura: { borderRadius: 12, overflow: 'hidden' },
  etiqueta: { position: 'absolute', left: Spacing.two, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  etiquetaTopo: { top: Spacing.two },
  etiquetaBaixo: { bottom: Spacing.two },
  sobre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  girando: { borderRadius: 999, padding: Spacing.two },
  negrito: { fontWeight: '600' },
});
