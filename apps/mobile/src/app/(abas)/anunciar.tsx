import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CATEGORIAS,
  CATEGORIA_ROTULO,
  UNIDADES_PRECO,
  UNIDADE_PRECO_ROTULO,
  loteCriarSchema,
  type Categoria,
  type Eu,
  type UnidadePreco,
} from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { CampoTexto } from '@/componentes/campo-texto';
import { Opcoes } from '@/componentes/opcoes';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, criarLote, textoDoErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

const irParaPerfil = () => router.navigate('/perfil');
const CONFIRA_CAMPOS = 'Confira os campos marcados acima.';

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

/**
 * Primeira versão do formulário de anúncio. Fotos e vídeo vêm logo depois, em /lote/[id]/midias.
 * Próximos passos: localização pelo GPS, sanidade e rascunho salvo offline.
 */
function FormularioLote({ usuario }: { usuario: Eu }) {
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
  const [enviando, setEnviando] = useState(false);

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

  async function enviar() {
    if (enviando) return;
    setAviso(null);
    const r = loteCriarSchema.safeParse({
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
    if (!r.success) {
      setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      setAviso({ tipo: 'erro', texto: CONFIRA_CAMPOS });
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      const lote = await criarLote(r.data);
      setCampos(vazio);
      setAviso({ tipo: 'info', texto: 'Anúncio enviado! Seu lote vai ao ar depois de uma revisão rápida.' });
      router.push({ pathname: '/lote/[id]/midias', params: { id: lote.id, novo: '1' } });
    } catch (e) {
      // 401: a sessão já foi encerrada pela API; leva a pessoa para entrar de novo.
      if (e instanceof ErroApi && e.status === 401) {
        irParaPerfil();
        return;
      }
      const porCampo = e instanceof ErroApi ? e.erros : {};
      setErros(porCampo);
      setAviso({ tipo: 'erro', texto: Object.keys(porCampo).length > 0 ? CONFIRA_CAMPOS : textoDoErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  const campo = (chave: keyof typeof campos, rotulo: string, numerico = false) => (
    <CampoTexto
      rotulo={rotulo}
      value={campos[chave]}
      onChangeText={(v) => setCampos((c) => ({ ...c, [chave]: v }))}
      keyboardType={numerico ? 'decimal-pad' : 'default'}
      editable={!enviando}
      erro={erros[chave]}
    />
  );

  return (
    <>
      <Texto tipo="titulo">Anunciar lote</Texto>
      {campo('titulo', 'Título (ex.: 100 bezerros Nelore desmamados)')}
      <View style={estilos.grupo}>
        <Texto tipo="pequeno" cor="textSecondary">
          Categoria
        </Texto>
        <Opcoes lista={CATEGORIAS} rotulos={CATEGORIA_ROTULO} atual={categoria} aoEscolher={setCategoria} />
      </View>
      {campo('raca', 'Raça')}
      {campo('quantidade', 'Quantidade de cabeças', true)}
      {campo('pesoMedioKg', 'Peso médio (kg)', true)}
      <View style={estilos.grupo}>
        <Texto tipo="pequeno" cor="textSecondary">
          Preço
        </Texto>
        <Opcoes lista={UNIDADES_PRECO} rotulos={UNIDADE_PRECO_ROTULO} atual={unidade} aoEscolher={setUnidade} />
      </View>
      {unidade !== 'a_combinar' && campo('preco', 'Valor (R$)', true)}
      {campo('municipio', 'Município')}
      {campo('uf', 'Estado (UF)')}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <Botao titulo={enviando ? 'Enviando…' : 'Publicar anúncio'} onPress={enviar} carregando={enviando} />
    </>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 140, flexGrow: 1 },
  carregando: { flex: 1 },
  grupo: { gap: Spacing.two },
});
