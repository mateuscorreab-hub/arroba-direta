import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { UFS, formatarTelefone, perfilSchema, type Eu, type UF } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { CampoTexto } from '@/componentes/campo-texto';
import { Opcoes } from '@/componentes/opcoes';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { ErroApi, textoDoErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';

type Props = {
  usuario: Eu;
  /** Editando um perfil já completo: mostra "Cancelar" em vez de "Sair". */
  editando: boolean;
  aoTerminar: (salvou: boolean) => void;
};

export function FormularioPerfil({ usuario, editando, aoTerminar }: Props) {
  const sessao = useSessao();
  const [nome, setNome] = useState(usuario.nome ?? '');
  const [municipio, setMunicipio] = useState(usuario.municipio ?? '');
  const [uf, setUf] = useState<UF | undefined>(UFS.find((u) => u === usuario.uf));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (salvando) return;
    const r = perfilSchema.safeParse({ nome, municipio, uf });
    if (!r.success) {
      setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErros({});
    setErroGeral(null);
    setSalvando(true);
    try {
      await sessao.atualizarPerfil(r.data);
      aoTerminar(true);
    } catch (e) {
      const porCampo = e instanceof ErroApi ? e.erros : {};
      setErros(porCampo);
      if (Object.keys(porCampo).length === 0) setErroGeral(textoDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={estilos.formulario}>
      <Texto tipo="titulo">{editando ? 'Editar perfil' : 'Complete seu perfil'}</Texto>
      {!editando && (
        <Texto cor="textSecondary">
          Você entrou com o celular {formatarTelefone(usuario.telefone)}. Para anunciar, falta só seu nome e
          onde fica sua propriedade. Os compradores veem esses dados nos seus anúncios.
        </Texto>
      )}
      <CampoTexto
        rotulo="Nome completo"
        value={nome}
        onChangeText={setNome}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        autoCorrect={false}
        editable={!salvando}
        erro={erros.nome}
      />
      <CampoTexto
        rotulo="Município"
        value={municipio}
        onChangeText={setMunicipio}
        autoCapitalize="words"
        autoCorrect={false}
        editable={!salvando}
        erro={erros.municipio}
      />
      <View style={estilos.campo}>
        <Texto tipo="pequeno" cor="textSecondary">
          Estado (UF)
        </Texto>
        <Opcoes lista={UFS} atual={uf} aoEscolher={setUf} />
        {erros.uf && (
          <Texto tipo="pequeno" cor="danger">
            {erros.uf}
          </Texto>
        )}
      </View>
      {erroGeral && <Aviso tipo="erro">{erroGeral}</Aviso>}
      <Botao titulo="Salvar" onPress={salvar} carregando={salvando} />
      {editando ? (
        <Botao titulo="Cancelar" variante="discreto" onPress={() => aoTerminar(false)} desabilitado={salvando} />
      ) : (
        <Botao titulo="Sair" variante="discreto" onPress={sessao.sair} desabilitado={salvando} />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  formulario: { gap: Spacing.three },
  campo: { gap: Spacing.two },
});
