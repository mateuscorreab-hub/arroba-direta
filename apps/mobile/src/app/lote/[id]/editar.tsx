import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { LOTE_NAO_ALTERA, type Lote } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { CamposLote, baseDoLote, useCamposLote, valoresDoLote } from '@/componentes/campos-lote';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, editarLote, obterLote, obterRegrasAnuncio, textoDoErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

const CONFIRA_CAMPOS = 'Confira os campos marcados acima.';
const MUDAR_GADO = 'Se você mudar a categoria, a raça, a quantidade, o peso ou o local';

/** Volta para a tela do lote, que recarrega ao aparecer; aberta por link, troca esta tela pela do lote. */
function voltarParaOLote(id: string) {
  router.dismissTo({ pathname: '/lote/[id]', params: { id } });
}

const irParaPerfil = () => router.dismissTo('/perfil');

export default function EditarLote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tema = useTheme();
  const sessao = useSessao();
  const [lote, setLote] = useState<Lote | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    let ativo = true;
    obterLote(id).then(
      (l) => {
        if (ativo) setLote(l);
      },
      (e: unknown) => {
        if (ativo) setErro(textoDoErro(e));
      },
    );
    return () => {
      ativo = false;
    };
  }, [id]);
  // Só ao abrir: recarregar no meio da edição apagaria o que a pessoa digitou.
  useEffect(carregar, [carregar]);

  let conteudo;
  if (sessao.carregando || (!lote && !erro)) {
    conteudo = <ActivityIndicator size="large" color={tema.brand} style={estilos.carregando} />;
  } else if (sessao.erro) {
    conteudo = (
      <>
        <Aviso tipo="erro">{`Não foi possível carregar seu perfil. ${sessao.erro}`}</Aviso>
        <Botao titulo="Tentar de novo" onPress={sessao.tentarDeNovo} />
      </>
    );
  } else if (!lote) {
    conteudo = (
      <>
        <Aviso tipo="erro">{erro}</Aviso>
        <Botao
          titulo="Tentar de novo"
          onPress={() => {
            setErro(null);
            carregar();
          }}
        />
      </>
    );
  } else if (!sessao.usuario) {
    conteudo = (
      <>
        <Texto cor="textSecondary">Para editar o anúncio, entre com o celular de quem anunciou o lote.</Texto>
        <Botao titulo="Entrar com celular" onPress={irParaPerfil} />
      </>
    );
  } else if (sessao.usuario.id !== lote.vendedor.id) {
    conteudo = <Aviso>Só o vendedor pode alterar este anúncio.</Aviso>;
  } else if (LOTE_NAO_ALTERA[lote.status]) {
    conteudo = (
      <>
        <Aviso>{LOTE_NAO_ALTERA[lote.status]}</Aviso>
        <Botao titulo="Voltar ao anúncio" variante="secundario" onPress={() => voltarParaOLote(lote.id)} />
      </>
    );
  } else {
    conteudo = <FormularioEdicao key={lote.id} lote={lote} />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: tema.background }}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <View style={estilos.coluna}>{conteudo}</View>
    </ScrollView>
  );
}

function FormularioEdicao({ lote }: { lote: Lote }) {
  const form = useCamposLote(valoresDoLote(lote));
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Com revisão manual, salvar o lote no ar tira ele da busca. Sem a resposta, avisa só o que vale sempre.
  const [revisaoManual, setRevisaoManual] = useState(false);

  useEffect(() => {
    let ativo = true;
    obterRegrasAnuncio().then(
      (r) => {
        if (ativo) setRevisaoManual(r.revisaoManual);
      },
      () => {},
    );
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar() {
    if (salvando) return;
    setAviso(null);
    const dados = form.validar(baseDoLote(lote));
    if (!dados) {
      setAviso(CONFIRA_CAMPOS);
      return;
    }
    setSalvando(true);
    try {
      await editarLote(lote.id, dados);
      voltarParaOLote(lote.id);
    } catch (e) {
      // 401: a sessão já foi encerrada pela API; leva a pessoa para entrar de novo.
      if (e instanceof ErroApi && e.status === 401) {
        irParaPerfil();
        return;
      }
      const porCampo = e instanceof ErroApi ? e.erros : {};
      form.setErros(porCampo);
      setAviso(Object.keys(porCampo).length > 0 ? CONFIRA_CAMPOS : textoDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  let avisoAntes: string | null = null;
  if (lote.status === 'ativo') {
    avisoAntes = revisaoManual
      ? 'Ao salvar uma mudança, o anúncio sai da busca e passa por uma nova revisão. Quem já conversa com você ' +
        'sobre este lote recebe um aviso, e a proposta em aberto deixa de valer.'
      : `${MUDAR_GADO}, quem já conversa com você sobre este lote recebe um aviso, e a proposta em aberto deixa de valer.`;
  } else if (lote.status === 'encerrado') {
    avisoAntes = `${MUDAR_GADO}, quem já conversa com você sobre este lote recebe um aviso.`;
  }

  return (
    <>
      <Texto tipo="titulo">Editar anúncio</Texto>
      {avisoAntes && <Aviso>{avisoAntes}</Aviso>}
      <CamposLote form={form} travado={salvando} />
      <Texto tipo="pequeno" cor="textSecondary">
        As fotos e o vídeo você muda em &quot;Fotos e vídeo do lote&quot;, na tela do anúncio.
      </Texto>
      {aviso && <Aviso tipo="erro">{aviso}</Aviso>}
      <Botao titulo={salvando ? 'Salvando…' : 'Salvar alterações'} onPress={salvar} carregando={salvando} />
      <Botao titulo="Cancelar" variante="discreto" onPress={() => voltarParaOLote(lote.id)} desabilitado={salvando} />
    </>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, paddingBottom: Spacing.five, flexGrow: 1 },
  coluna: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: Spacing.three, flexGrow: 1 },
  carregando: { flex: 1 },
});
