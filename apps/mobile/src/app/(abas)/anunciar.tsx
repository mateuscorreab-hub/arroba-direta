import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CATEGORIAS,
  CATEGORIA_ROTULO,
  MAX_FOTOS_LOTE,
  MAX_VIDEOS_LOTE,
  MIN_FOTOS_PUBLICAR,
  UNIDADES_PRECO,
  UNIDADE_PRECO_ROTULO,
  loteCriarSchema,
  type Categoria,
  type Eu,
  type TipoMidia,
  type UnidadePreco,
} from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { AvisoPermissao } from '@/componentes/aviso-permissao';
import { Botao } from '@/componentes/botao';
import { BotoesEscolha } from '@/componentes/botoes-escolha';
import { CampoTexto } from '@/componentes/campo-texto';
import { CartaoArquivo } from '@/componentes/cartao-arquivo';
import { DicaFotos } from '@/componentes/dica-fotos';
import { LinhaEnvio } from '@/componentes/linha-envio';
import { ManterTelaLigada } from '@/componentes/manter-tela-ligada';
import { Opcoes } from '@/componentes/opcoes';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useAvisarAoFechar } from '@/hooks/use-avisar-ao-fechar';
import { useEscolhaMidia, type AvisoEscolha, type Escolha } from '@/hooks/use-escolha-midia';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, criarLote, ordenarMidias, publicarLote, textoDoErro } from '@/lib/api';
import { useFilaEnvio, type ItemEnvio } from '@/lib/fila-envio';
import { useSessao } from '@/lib/sessao';

const irParaPerfil = () => router.navigate('/perfil');
const CONFIRA_CAMPOS = 'Confira os campos marcados acima.';
const ANUNCIO_ENVIADO = 'Anúncio enviado! Seu lote vai ao ar depois de uma revisão rápida.';
const TENTAR_ENVIAR = 'Tentar enviar de novo';
const FOTOS_PARA_REPETIR = `Algumas fotos não subiram, talvez pelo sinal fraco. Toque em "${TENTAR_ENVIAR}" para continuar de onde parou.`;
const FOTOS_RECUSADAS = 'Algumas fotos não podem ser enviadas. Toque em "Remover" nas que mostram o problema para continuar.';
const FALTA_PUBLICAR = 'As fotos subiram. Toque em "Publicar anúncio" para terminar.';
const DADOS_SALVOS = 'Os dados do lote já foram salvos e não podem mais ser mudados aqui. Falta só terminar de publicar, lá embaixo.';
const MINIMO_FOTOS = MIN_FOTOS_PUBLICAR > 1 ? `${MIN_FOTOS_PUBLICAR} fotos` : 'uma foto';
const FALTA_FOTO = `Coloque pelo menos ${MINIMO_FOTOS} do lote.`;
const COMO_COLOCAR =
  MIN_FOTOS_PUBLICAR > 0
    ? `Coloque pelo menos ${MINIMO_FOTOS} (até ${MAX_FOTOS_LOTE}) e, se quiser, um vídeo de até 1 minuto. A primeira foto é a capa do anúncio.`
    : `Até ${MAX_FOTOS_LOTE} fotos e um vídeo de até 1 minuto. A primeira foto é a capa do anúncio.`;
// Cada foto da grade tem pelo menos esta largura; cabem de 2 a 4 por linha.
const LARGURA_MINIMA_FOTO = 150;

export default function Anunciar() {
  const tema = useTheme();
  const sessao = useSessao();

  let conteudo;
  if (sessao.carregando) {
    conteudo = <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
  } else if (sessao.erro) {
    conteudo = (
      <>
        <Texto tipo="titulo">Anunciar lote</Texto>
        <Aviso tipo="erro">{`Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
        <Botao titulo="Tentar de novo" onPress={sessao.tentarDeNovo} />
      </>
    );
  } else if (!sessao.usuario) {
    conteudo = (
      <>
        <Texto tipo="titulo">Anunciar lote</Texto>
        <Texto cor="textSecondary">
          Para anunciar seu gado, entre com o número do seu celular. É rápido e não precisa de senha.
        </Texto>
        <Botao titulo="Entrar com celular" onPress={irParaPerfil} />
      </>
    );
  } else if (!sessao.usuario.perfilCompleto) {
    conteudo = (
      <>
        <Texto tipo="titulo">Complete seu perfil</Texto>
        <Texto cor="textSecondary">
          Antes de anunciar, informe seu nome, município e estado. Os compradores veem esses dados no
          anúncio.
        </Texto>
        <Botao titulo="Completar perfil" onPress={irParaPerfil} />
      </>
    );
  } else {
    conteudo = <FormularioLote usuario={sessao.usuario} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tema.background }} edges={['top']}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        {conteudo}
      </ScrollView>
    </SafeAreaView>
  );
}

type Passo = 'criando' | 'enviando' | 'publicando';

/** Vai (ou já foi) para o lote: o que falhou só conta se dá para mandar de novo. */
const vaiParaOLote = (i: ItemEnvio) => i.estado !== 'erro' || !!i.podeTentarDeNovo;

function contarFotos(itens: ItemEnvio[]) {
  return itens.filter((i) => i.arquivo.tipo === 'foto' && vaiParaOLote(i)).length;
}

/** Arquivo que falhou e foi de novo sobe depois dos outros: volta a ordem escolhida, com a capa primeiro. */
async function acertarOrdem(loteId: string, itens: ItemEnvio[]) {
  const midias = itens.flatMap((i) => (i.estado === 'enviado' && i.midia ? [i.midia] : []));
  if (midias.every((m, k) => k === 0 || m.ordem > midias[k - 1].ordem)) return;
  try {
    await ordenarMidias(loteId, midias.map((m) => m.id));
  } catch (e) {
    // Não impede a publicação: no pior caso a capa é outra foto, e o vendedor troca em "Fotos e vídeo do lote".
    if (e instanceof ErroApi && e.status === 401) throw e;
  }
}

/**
 * Formulário de anúncio, com as fotos e o vídeo. Ao publicar, o lote é criado em rascunho, recebe os arquivos
 * (um de cada vez) e só então vai para a revisão.
 * Próximos passos: localização pelo GPS, sanidade e rascunho salvo offline.
 */
function FormularioLote({ usuario }: { usuario: Eu }) {
  const janela = useWindowDimensions();
  const vazio = {
    titulo: '',
    raca: '',
    quantidade: '',
    pesoMedioKg: '',
    preco: '',
    municipio: usuario.municipio ?? '',
    uf: usuario.uf ?? '',
  };
  const [categoria, setCategoria] = useState<Categoria>('bezerro');
  const [unidade, setUnidade] = useState<UnidadePreco>('cabeca');
  const [campos, setCampos] = useState(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null);
  const [passo, setPasso] = useState<Passo | null>(null);
  // Lote já criado em rascunho: uma nova tentativa continua nele, sem criar outro.
  const [rascunhoId, setRascunhoId] = useState<string | null>(null);
  const [erroFotos, setErroFotos] = useState<string | null>(null);
  const [avisoFotos, setAvisoFotos] = useState<AvisoEscolha | null>(null);
  const fila = useFilaEnvio(null);
  const escolha = useEscolhaMidia();

  const subindo = fila.itens.some((i) => i.estado === 'esperando' || i.estado === 'enviando' || i.estado === 'registrando');
  const ocupado = passo !== null || subindo;
  const travado = ocupado || rascunhoId !== null;
  // Com o rascunho criado, o que for escolhido vai para o mesmo lote no próximo toque em publicar.
  const podeEscolher = !ocupado;
  const comFalha = (i: ItemEnvio) => i.estado === 'erro' && !i.foraDoLimite;
  // Falha de conexão: o botão manda de novo. Arquivo recusado: só sai com "Remover".
  const paraRepetir = fila.itens.some((i) => comFalha(i) && i.podeTentarDeNovo);
  const comErro = fila.itens.some((i) => comFalha(i) && !i.podeTentarDeNovo);
  const faltaPublicar =
    rascunhoId !== null &&
    !ocupado &&
    !erroFotos &&
    fila.itens.length > 0 &&
    fila.itens.every((i) => i.estado === 'enviado' || i.foraDoLimite);
  // Conta o que vai para o lote para não passar do limite.
  const contam = (tipo: TipoMidia) => fila.itens.filter((i) => i.arquivo.tipo === tipo && vaiParaOLote(i)).length;
  const fotosRestantes = Math.max(0, MAX_FOTOS_LOTE - contam('foto'));
  const podeVideo = contam('video') < MAX_VIDEOS_LOTE;
  const capa = fila.itens.find((i) => i.arquivo.tipo === 'foto' && i.estado !== 'erro')?.chave;
  // O que ainda não foi (e o que está fora do limite) fica na grade; o que já está indo, nas linhas de envio.
  const naGrade = fila.itens.filter((i) => i.estado === 'pronto' || i.foraDoLimite);
  const noEnvio = fila.itens.filter((i) => i.estado !== 'pronto' && !i.foraDoLimite);
  const terminados = noEnvio.filter((i) => i.estado === 'enviado' || i.estado === 'erro').length;

  // Fechar a aba no meio perde o envio e deixa o anúncio pela metade.
  useAvisarAoFechar(travado);

  const larguraUtil = janela.width - Spacing.three * 2;
  const colunas = Math.min(
    4,
    Math.max(2, Math.floor((larguraUtil + Spacing.three) / (LARGURA_MINIMA_FOTO + Spacing.three))),
  );
  const larguraItem = Math.floor((larguraUtil - Spacing.three * (colunas - 1)) / colunas);

  let tituloBotao = paraRepetir ? TENTAR_ENVIAR : 'Publicar anúncio';
  if (subindo) tituloBotao = `Enviando fotos… (${Math.min(terminados + 1, noEnvio.length)} de ${noEnvio.length})`;
  else if (passo === 'criando') tituloBotao = 'Salvando o anúncio…';
  else if (passo === 'enviando') tituloBotao = 'Enviando fotos…';
  else if (passo === 'publicando') tituloBotao = 'Publicando…';

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

  function validarCampos() {
    return loteCriarSchema.safeParse({
      titulo: campos.titulo,
      categoria,
      raca: campos.raca,
      sexo: ['bezerra', 'novilha', 'vaca', 'vaca_prenhe'].includes(categoria) ? 'femea' : 'macho',
      quantidade: num(campos.quantidade),
      pesoMedioKg: num(campos.pesoMedioKg),
      unidadePreco: unidade,
      preco: unidade === 'a_combinar' ? undefined : num(campos.preco),
      municipio: campos.municipio,
      uf: campos.uf.trim().toUpperCase(),
      // TODO: pegar do GPS. Por enquanto, centro aproximado do Brasil.
      lat: -15.78,
      lng: -47.93,
    });
  }

  async function escolher(acao: Escolha) {
    setAvisoFotos(null);
    const r = await escolha.escolher(acao, fotosRestantes);
    if (r.aviso) setAvisoFotos(r.aviso);
    if (r.arquivos.length > 0) {
      fila.adicionar(r.arquivos);
      setErroFotos(null);
    }
  }

  function pedirFoto(mensagem: string) {
    setErroFotos(mensagem);
    setAviso({ tipo: 'erro', texto: mensagem });
  }

  async function publicar() {
    if (ocupado || comErro) return;
    setAviso(null);
    setErroFotos(null);
    setAvisoFotos(null);
    // Sem saber se o envio está ligado (a consulta falhou), a foto é pedida; se estiver desligado, o envio avisa.
    const exigeFoto = fila.desligado === null;
    const faltaFoto = exigeFoto && contarFotos(fila.listaAtual()) < MIN_FOTOS_PUBLICAR;

    let id = rascunhoId;
    if (id === null) {
      const r = validarCampos();
      setErros(r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      if (!r.success || faltaFoto) {
        if (faltaFoto) setErroFotos(FALTA_FOTO);
        setAviso({ tipo: 'erro', texto: r.success ? FALTA_FOTO : CONFIRA_CAMPOS });
        return;
      }
      setPasso('criando');
      try {
        id = (await criarLote(r.data, { rascunho: true })).id;
      } catch (e) {
        setPasso(null);
        // 401: a sessão já foi encerrada pela API; leva a pessoa para entrar de novo.
        if (e instanceof ErroApi && e.status === 401) {
          irParaPerfil();
          return;
        }
        const porCampo = e instanceof ErroApi ? e.erros : {};
        setErros(porCampo);
        setAviso({ tipo: 'erro', texto: Object.keys(porCampo).length > 0 ? CONFIRA_CAMPOS : textoDoErro(e) });
        return;
      }
      setRascunhoId(id);
    } else if (faltaFoto) {
      pedirFoto(FALTA_FOTO);
      return;
    }

    try {
      setPasso('enviando');
      // Envio desligado: o que foi escolhido antes de a consulta responder fica de fora.
      const envio = exigeFoto ? await fila.enviar(id) : 'desligado';
      if (envio === 'cancelado' || envio === 'com-erro') return;
      if (envio === 'sem-sessao') {
        irParaPerfil();
        return;
      }
      const itens = fila.listaAtual();
      // Alguma foto saiu no meio (cancelada, ou maior que o limite depois de medida).
      if (envio === 'ok' && contarFotos(itens) < MIN_FOTOS_PUBLICAR) {
        pedirFoto(FALTA_FOTO);
        return;
      }
      setPasso('publicando');
      await acertarOrdem(id, itens);
      const lote = await publicarLote(id);
      fila.limpar();
      setCampos(vazio);
      setErros({});
      setRascunhoId(null);
      setAviso({ tipo: 'info', texto: ANUNCIO_ENVIADO });
      router.push({ pathname: '/lote/[id]', params: { id: lote.id } });
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        irParaPerfil();
        return;
      }
      // 400: o lote está sem foto; a pessoa coloca outra e o envio continua no mesmo lote. Só vem com o envio
      // ligado: se a tela ainda acha que está desligado (foi ligado depois que ela abriu), os botões voltam.
      if (e instanceof ErroApi && e.status === 400) {
        if (fila.desligado) fila.religar();
        pedirFoto(textoDoErro(e));
      } else setAviso({ tipo: 'erro', texto: textoDoErro(e) });
    } finally {
      setPasso(null);
    }
  }

  const campo = (chave: keyof typeof campos, rotulo: string, numerico = false) => (
    <CampoTexto
      rotulo={rotulo}
      value={campos[chave]}
      onChangeText={(v) => setCampos((c) => ({ ...c, [chave]: v }))}
      keyboardType={numerico ? 'decimal-pad' : 'default'}
      editable={!travado}
      erro={erros[chave]}
    />
  );

  return (
    <>
      {ocupado && <ManterTelaLigada />}
      <Texto tipo="titulo">Anunciar lote</Texto>
      {rascunhoId !== null && !ocupado && <Aviso>{DADOS_SALVOS}</Aviso>}
      {campo('titulo', 'Título (ex.: 100 bezerros Nelore desmamados)')}
      <View style={estilos.grupo}>
        <Texto tipo="pequeno" cor="textSecondary">
          Categoria
        </Texto>
        <Opcoes
          lista={CATEGORIAS}
          rotulos={CATEGORIA_ROTULO}
          atual={categoria}
          aoEscolher={setCategoria}
          desabilitado={travado}
        />
      </View>
      {campo('raca', 'Raça')}
      {campo('quantidade', 'Quantidade de cabeças', true)}
      {campo('pesoMedioKg', 'Peso médio (kg)', true)}
      <View style={estilos.grupo}>
        <Texto tipo="pequeno" cor="textSecondary">
          Preço
        </Texto>
        <Opcoes
          lista={UNIDADES_PRECO}
          rotulos={UNIDADE_PRECO_ROTULO}
          atual={unidade}
          aoEscolher={setUnidade}
          desabilitado={travado}
        />
      </View>
      {unidade !== 'a_combinar' && campo('preco', 'Valor (R$)', true)}
      {campo('municipio', 'Município')}
      {campo('uf', 'Estado (UF)')}

      <View style={estilos.secao}>
        <Texto tipo="subtitulo">Fotos e vídeo</Texto>
        {fila.desligado ? (
          <Aviso>{`${fila.desligado} Você pode publicar sem foto.`}</Aviso>
        ) : (
          <>
            <Texto cor="textSecondary">{COMO_COLOCAR}</Texto>
            <DicaFotos />
            {escolha.permissao && <AvisoPermissao permissao={escolha.permissao} />}
            {avisoFotos && <Aviso tipo={avisoFotos.tipo}>{avisoFotos.texto}</Aviso>}
            <BotoesEscolha
              aoEscolher={escolher}
              preparando={escolha.preparando}
              desabilitado={!podeEscolher}
              fotosRestantes={fotosRestantes}
              podeVideo={podeVideo}
              semLugarFoto={`Já tem ${MAX_FOTOS_LOTE} fotos, o máximo do anúncio.`}
              semLugarVideo="Já tem um vídeo. Só cabe um por anúncio."
            />
            {naGrade.length > 0 && (
              <View style={estilos.grade}>
                {naGrade.map((item) => (
                  <CartaoArquivo
                    key={item.chave}
                    item={item}
                    largura={larguraItem}
                    capa={item.chave === capa}
                    podeMexer={podeEscolher}
                    aoUsarComoCapa={() => fila.usarComoCapa(item.chave)}
                    aoTirar={() => fila.remover(item.chave)}
                  />
                ))}
              </View>
            )}
            {noEnvio.length > 0 && (
              <View style={estilos.grupo}>
                {subindo && (
                  <Texto tipo="pequeno" cor="textSecondary">
                    Deixe o app aberto e a tela ligada até terminar o envio.
                  </Texto>
                )}
                {noEnvio.map((item) => (
                  <LinhaEnvio
                    key={item.chave}
                    item={item}
                    aoTentarDeNovo={() => fila.tentarDeNovo(item.chave)}
                    aoRemover={() => fila.remover(item.chave)}
                  />
                ))}
              </View>
            )}
            {fila.itens.length === 0 && <Texto cor="textSecondary">Nenhuma foto escolhida ainda.</Texto>}
          </>
        )}
        {erroFotos && <Texto cor="danger">{erroFotos}</Texto>}
      </View>

      {!subindo && (comErro || paraRepetir) && (
        <Aviso tipo="erro">{comErro ? FOTOS_RECUSADAS : FOTOS_PARA_REPETIR}</Aviso>
      )}
      {faltaPublicar && <Aviso>{FALTA_PUBLICAR}</Aviso>}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <Botao titulo={tituloBotao} onPress={publicar} carregando={ocupado} desabilitado={comErro} />
    </>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 140, flexGrow: 1 },
  carregando: { flex: 1 },
  grupo: { gap: Spacing.two },
  secao: { gap: Spacing.three, marginTop: Spacing.two },
  grade: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.three },
});
