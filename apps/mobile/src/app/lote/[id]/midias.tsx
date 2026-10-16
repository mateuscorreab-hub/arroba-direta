import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { MAX_FOTOS_LOTE, MAX_VIDEOS_LOTE, type Lote, type Midia } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { LARGURA_MAXIMA } from '@/componentes/galeria-lote';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, apagarMidia, obterLote, ordenarMidias, textoDoErro } from '@/lib/api';
import { escolherFotos, escolherVideo, tirarFoto, type ResultadoEscolha } from '@/lib/escolher-midia';
import { useFilaEnvio, type ItemEnvio } from '@/lib/fila-envio';
import { duracaoTexto, tamanhoTexto } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

const DICA = 'Fotos de dia, mostrando o lote inteiro e alguns animais de perto. Vídeo de até 1 minuto com os animais andando.';

const ordenar = (l: Midia[]) => [...l].sort((a, b) => a.ordem - b.ordem);

function verLote(id: string) {
  router.replace({ pathname: '/lote/[id]', params: { id } });
}

export default function MidiasDoLote() {
  const { id, novo } = useLocalSearchParams<{ id: string; novo?: string }>();
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

  if (lote && sessao.usuario?.id === lote.vendedor.id) return <EditorMidias lote={lote} novo={novo === '1'} />;

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

type Permissao = { recurso: 'camera' | 'galeria'; podePedirDeNovo: boolean };
type Escolha = 'fotos' | 'camera' | 'video';

/** Tela apagada manda o app para segundo plano, e o envio para. */
function ManterTelaLigada() {
  useKeepAwake('envio-midia', { suppressDeactivateWarnings: true });
  return null;
}

function EditorMidias({ lote, novo }: { lote: Lote; novo: boolean }) {
  const tema = useTheme();
  const janela = useWindowDimensions();
  const navigation = useNavigation();
  const [midias, setMidias] = useState(() => ordenar(lote.midias ?? []));
  const fila = useFilaEnvio(lote.id, setMidias);
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null);
  const [permissao, setPermissao] = useState<Permissao | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [preparando, setPreparando] = useState<Escolha | null>(null);
  const abrindo = useRef(false);
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
  useEffect(() => {
    if (Platform.OS !== 'web' || !enviando) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [enviando]);

  const larguraUtil = Math.min(janela.width - Spacing.three * 2, LARGURA_MAXIMA);
  const colunas = larguraUtil >= 520 ? 3 : 2;
  const larguraItem = Math.floor((larguraUtil - Spacing.three * (colunas - 1)) / colunas);

  async function escolher(acao: Escolha) {
    // Na web o seletor nem sempre avisa quando a pessoa desiste; lá o botão não pode ficar travado.
    if (abrindo.current) return;
    setAviso(null);
    setPermissao(null);
    const maximo = fotosRestantes;
    // O seletor abre já no toque, antes de qualquer await (exigência do navegador).
    const pedido = acao === 'fotos' ? escolherFotos(maximo) : acao === 'camera' ? tirarFoto() : escolherVideo();
    // No celular, depois de escolher, o seletor ainda prepara os arquivos (comprime, baixa do iCloud) com a
    // tela parada: o botão mostra que está trabalhando.
    abrindo.current = Platform.OS !== 'web';
    if (abrindo.current) setPreparando(acao);
    let r: ResultadoEscolha;
    try {
      r = await pedido;
    } finally {
      abrindo.current = false;
      setPreparando(null);
    }
    if (r.tipo === 'sem-permissao') setPermissao(r);
    else if (r.tipo === 'erro') setAviso({ tipo: 'erro', texto: r.mensagem });
    else if (r.tipo === 'ok' && acao === 'video') fila.adicionar(r.arquivos.slice(0, 1));
    else if (r.tipo === 'ok') {
      if (r.arquivos.length > maximo) {
        const fora = r.arquivos.length - maximo;
        setAviso({
          tipo: 'info',
          texto: `O lote aceita até ${MAX_FOTOS_LOTE} fotos. ${fora === 1 ? 'Uma foto ficou' : `${fora} fotos ficaram`} de fora.`,
        });
      }
      fila.adicionar(r.arquivos.slice(0, maximo));
    }
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
    // Vindo do Anunciar, a tela anterior é o formulário: troca esta tela pela do lote.
    if (!novo && router.canGoBack()) router.back();
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
        {novo && (
          <Aviso>
            {`${
              lote.status === 'ativo'
                ? 'Anúncio publicado! Seu lote já aparece na busca.'
                : 'Anúncio enviado! Seu lote vai ao ar depois de uma revisão rápida.'
            } Agora coloque fotos e um vídeo: anúncio com foto chama muito mais compradores.`}
          </Aviso>
        )}
        <View style={estilos.bloco}>
          <Texto tipo="subtitulo">{lote.titulo}</Texto>
          <Texto cor="textSecondary">
            Até {MAX_FOTOS_LOTE} fotos e 1 vídeo de até 1 minuto. A primeira foto é a capa do anúncio.
          </Texto>
        </View>
        <Aviso>{`Dica: ${DICA}`}</Aviso>

        {fila.desligado && <Aviso tipo="erro">{fila.desligado}</Aviso>}
        {permissao && <AvisoPermissao permissao={permissao} />}
        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

        <View style={estilos.bloco}>
          <Botao
            titulo="Escolher fotos"
            onPress={() => escolher('fotos')}
            carregando={preparando === 'fotos'}
            desabilitado={desligado || fotosRestantes === 0 || preparando !== null}
          />
          {Platform.OS !== 'web' && (
            <Botao
              titulo="Tirar foto"
              variante="secundario"
              onPress={() => escolher('camera')}
              carregando={preparando === 'camera'}
              desabilitado={desligado || fotosRestantes === 0 || preparando !== null}
            />
          )}
          {!desligado && (
            <Texto tipo="pequeno" cor="textSecondary">
              {fotosRestantes === 0
                ? `O lote já tem ${MAX_FOTOS_LOTE} fotos. Apague uma para colocar outra.`
                : fotosRestantes === 1
                  ? 'Cabe mais 1 foto.'
                  : `Cabem mais ${fotosRestantes} fotos.`}
            </Texto>
          )}
        </View>
        <View style={estilos.bloco}>
          <Botao
            titulo="Escolher vídeo"
            variante="secundario"
            onPress={() => escolher('video')}
            carregando={preparando === 'video'}
            desabilitado={desligado || !podeVideo || preparando !== null}
          />
          {!desligado && !podeVideo && (
            <Texto tipo="pequeno" cor="textSecondary">
              O lote já tem um vídeo. Apague o atual para enviar outro.
            </Texto>
          )}
        </View>

        {preparando && (
          <View style={estilos.preparando}>
            <ActivityIndicator color={tema.brand} />
            <Texto cor="textSecondary" accessibilityLiveRegion="polite" style={estilos.flex}>
              {`Preparando ${{ fotos: 'as fotos', camera: 'a foto', video: 'o vídeo' }[preparando]}… Isso pode levar um pouco.`}
            </Texto>
          </View>
        )}

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

function AvisoPermissao({ permissao }: { permissao: Permissao }) {
  const ios = Platform.OS === 'ios';
  let texto: string;
  if (permissao.recurso === 'camera' && permissao.podePedirDeNovo) {
    texto = 'O app precisa da sua permissão para usar a câmera. Toque em "Tirar foto" de novo e escolha "Permitir".';
  } else if (permissao.recurso === 'camera') {
    texto = ios
      ? 'A câmera está bloqueada para o Arroba Direta. Para liberar, abra os Ajustes do iPhone, toque em Arroba Direta e ligue a Câmera.'
      : 'A câmera está bloqueada para o Arroba Direta. Para liberar, abra as Configurações do celular, toque em Apps, depois em Arroba Direta e em Permissões, e permita a Câmera.';
  } else {
    texto = ios
      ? 'As fotos estão bloqueadas para o Arroba Direta. Para liberar, abra os Ajustes do iPhone, toque em Arroba Direta, depois em Fotos, e escolha Acesso Total.'
      : 'As fotos estão bloqueadas para o Arroba Direta. Para liberar, abra as Configurações do celular, toque em Apps, depois em Arroba Direta e em Permissões, e permita Fotos e vídeos.';
  }
  return (
    <Aviso tipo="erro">
      <Texto>{texto}</Texto>
      {!permissao.podePedirDeNovo && (
        <Botao titulo="Abrir ajustes do celular" variante="secundario" onPress={() => Linking.openSettings().catch(() => {})} />
      )}
    </Aviso>
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

function LinhaEnvio({
  item,
  aoTentarDeNovo,
  aoRemover,
}: {
  item: ItemEnvio;
  aoTentarDeNovo: () => void;
  aoRemover: () => void;
}) {
  const tema = useTheme();
  const { arquivo } = item;
  const foto = arquivo.tipo === 'foto';
  const porcento = Math.round(item.progresso * 100);
  const situacao = {
    esperando: 'Na fila',
    enviando: `Enviando… ${porcento}%`,
    registrando: 'Salvando no anúncio…',
    erro: item.erro ?? 'Não foi possível enviar.',
  }[item.estado];
  const detalhes = [
    foto ? 'Foto' : 'Vídeo',
    arquivo.duracaoSeg ? duracaoTexto(arquivo.duracaoSeg) : null,
    arquivo.tamanho ? tamanhoTexto(arquivo.tamanho) : null,
  ].filter(Boolean);

  return (
    <View
      style={[
        estilos.envio,
        { backgroundColor: tema.backgroundElement, borderColor: item.estado === 'erro' ? tema.danger : tema.border },
      ]}>
      <View style={estilos.envioTopo}>
        {foto ? (
          <Image
            source={{ uri: arquivo.uri }}
            style={[estilos.previa, { backgroundColor: tema.backgroundSelected }]}
            contentFit="cover"
            accessibilityLabel=""
          />
        ) : (
          <View style={[estilos.previa, estilos.centro, { backgroundColor: tema.backgroundSelected }]}>
            <Texto tipo="pequeno" cor="brand">
              ▶ Vídeo
            </Texto>
          </View>
        )}
        <View style={estilos.envioTextos}>
          <Texto tipo="pequeno">{detalhes.join(' · ')}</Texto>
          <Texto tipo="pequeno" cor={item.estado === 'erro' ? 'danger' : 'textSecondary'} accessibilityLiveRegion="polite">
            {situacao}
          </Texto>
        </View>
      </View>
      {item.estado !== 'erro' && (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: porcento }}
          style={[estilos.trilho, { backgroundColor: tema.backgroundSelected }]}>
          <View style={[estilos.barra, { width: `${porcento}%`, backgroundColor: tema.brand }]} />
        </View>
      )}
      {item.estado !== 'registrando' && (
        <View style={estilos.envioBotoes}>
          {item.estado === 'erro' && item.podeTentarDeNovo && (
            <BotaoPequeno titulo="Tentar de novo" onPress={aoTentarDeNovo} />
          )}
          <BotaoPequeno titulo={item.estado === 'erro' ? 'Remover' : 'Cancelar'} tipo="perigo" onPress={aoRemover} />
        </View>
      )}
    </View>
  );
}

function BotaoPequeno({
  titulo,
  onPress,
  tipo = 'normal',
  desabilitado,
}: {
  titulo: string;
  onPress: () => void;
  tipo?: 'normal' | 'perigo' | 'perigoCheio';
  desabilitado?: boolean;
}) {
  const tema = useTheme();
  const cor = tipo === 'normal' ? tema.brand : tema.danger;
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desabilitado }}
      style={({ pressed }) => [
        estilos.botaoPequeno,
        { borderColor: cor, opacity: desabilitado ? 0.5 : pressed ? 0.7 : 1 },
        tipo === 'perigoCheio' && { backgroundColor: cor },
      ]}>
      <Texto
        tipo="pequeno"
        cor={tipo === 'perigoCheio' ? 'onBrand' : tipo === 'perigo' ? 'danger' : 'brand'}
        style={[estilos.negrito, estilos.textoCentro]}>
        {titulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  rolagem: { padding: Spacing.three, paddingBottom: Spacing.five * 2, flexGrow: 1 },
  coluna: { width: '100%', maxWidth: LARGURA_MAXIMA, alignSelf: 'center', gap: Spacing.four, flexGrow: 1 },
  carregando: { flex: 1 },
  flex: { flex: 1 },
  bloco: { gap: Spacing.two },
  preparando: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grade: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.three },
  cartao: { gap: Spacing.two },
  miniatura: { borderRadius: 12, overflow: 'hidden' },
  etiqueta: { position: 'absolute', left: Spacing.two, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  etiquetaTopo: { top: Spacing.two },
  etiquetaBaixo: { bottom: Spacing.two },
  sobre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  girando: { borderRadius: 999, padding: Spacing.two },
  envio: { borderWidth: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  envioTopo: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  envioTextos: { flex: 1, gap: Spacing.one },
  envioBotoes: { flexDirection: 'row', gap: Spacing.two },
  previa: { width: 64, height: 48, borderRadius: 8, overflow: 'hidden' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  trilho: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barra: { height: '100%' },
  botaoPequeno: {
    flexGrow: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  negrito: { fontWeight: '600' },
  textoCentro: { textAlign: 'center' },
});
