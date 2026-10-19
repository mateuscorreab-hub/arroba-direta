import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  CATEGORIAS,
  CATEGORIA_ROTULO,
  UNIDADES_PRECO,
  UNIDADE_PRECO_ROTULO,
  loteCriarSchema,
  type Categoria,
  type Lote,
  type LoteCriar,
  type Sanidade,
  type Sexo,
  type UnidadePreco,
} from '@arroba/shared';

import { CampoTexto } from '@/componentes/campo-texto';
import { Opcoes } from '@/componentes/opcoes';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';

type Textos = {
  titulo: string;
  raca: string;
  quantidade: string;
  pesoMedioKg: string;
  preco: string;
  municipio: string;
  uf: string;
};

export type ValoresLote = { textos: Textos; categoria: Categoria; unidade: UnidadePreco };

/** O que vai para a API mas não aparece no formulário. */
export type BaseLote = {
  lat: number;
  lng: number;
  sexo?: Sexo;
  idadeMediaMeses?: number;
  disponivelEm?: string;
  sanidade?: Sanidade;
  descricao?: string;
};

const FEMEAS: readonly Categoria[] = ['bezerra', 'novilha', 'vaca', 'vaca_prenhe'];
const sexoDa = (categoria: Categoria): Sexo => (FEMEAS.includes(categoria) ? 'femea' : 'macho');
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
const texto = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

/** Formulário em branco, com o município e o estado do perfil. */
export function valoresEmBranco(municipio = '', uf = ''): ValoresLote {
  return {
    textos: { titulo: '', raca: '', quantidade: '', pesoMedioKg: '', preco: '', municipio, uf },
    categoria: 'bezerro',
    unidade: 'cabeca',
  };
}

/** Formulário preenchido com o lote, para editar. */
export function valoresDoLote(l: Lote): ValoresLote {
  return {
    textos: {
      titulo: l.titulo,
      raca: l.raca,
      quantidade: String(l.quantidade),
      pesoMedioKg: texto(l.pesoMedioKg),
      preco: texto(l.preco),
      municipio: l.municipio,
      uf: l.uf,
    },
    categoria: l.categoria,
    unidade: l.unidadePreco,
  };
}

/** O que o formulário de edição não mostra, tirado do lote para não se perder no PUT. */
export function baseDoLote(l: Lote): BaseLote {
  return {
    lat: l.lat,
    lng: l.lng,
    sexo: l.sexo,
    idadeMediaMeses: l.idadeMediaMeses,
    disponivelEm: l.disponivelEm ?? undefined,
    sanidade: l.sanidade,
    descricao: l.descricao,
  };
}

/** Estado dos campos do anúncio, igual no Anunciar e no Editar. */
export function useCamposLote(inicial: ValoresLote) {
  const [textos, setTextos] = useState(inicial.textos);
  const [categoria, setCategoria] = useState(inicial.categoria);
  const [unidade, setUnidade] = useState(inicial.unidade);
  const [erros, setErros] = useState<Record<string, string>>({});

  /** Monta o lote para a API por cima de `base`. Marca os campos errados e devolve null se houver algum. */
  function validar(base: BaseLote): LoteCriar | null {
    const r = loteCriarSchema.safeParse({
      ...base,
      titulo: textos.titulo,
      categoria,
      raca: textos.raca,
      // Com a categoria de antes, fica o sexo do lote (pode ser "misto"); se mudou, vem da categoria.
      sexo: base.sexo && categoria === inicial.categoria ? base.sexo : sexoDa(categoria),
      quantidade: num(textos.quantidade),
      pesoMedioKg: num(textos.pesoMedioKg),
      unidadePreco: unidade,
      preco: unidade === 'a_combinar' ? undefined : num(textos.preco),
      municipio: textos.municipio,
      uf: textos.uf.trim().toUpperCase(),
    });
    setErros(r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
    return r.success ? r.data : null;
  }

  /** Volta os textos ao começo. A categoria e a unidade do preço ficam, para o próximo anúncio. */
  function limparTextos() {
    setTextos(inicial.textos);
    setErros({});
  }

  return { textos, setTextos, categoria, setCategoria, unidade, setUnidade, erros, setErros, validar, limparTextos };
}

export type FormLote = ReturnType<typeof useCamposLote>;

/** Os campos do anúncio: título, categoria, raça, quantidade, peso, preço e local. */
export function CamposLote({ form, travado }: { form: FormLote; travado: boolean }) {
  const campo = (chave: keyof Textos, rotulo: string, numerico = false) => (
    <CampoTexto
      rotulo={rotulo}
      value={form.textos[chave]}
      onChangeText={(v) => form.setTextos((c) => ({ ...c, [chave]: v }))}
      keyboardType={numerico ? 'decimal-pad' : 'default'}
      editable={!travado}
      erro={form.erros[chave]}
    />
  );

  return (
    <>
      {campo('titulo', 'Título (ex.: 100 bezerros Nelore desmamados)')}
      <View style={estilos.grupo}>
        <Texto tipo="pequeno" cor="textSecondary">
          Categoria
        </Texto>
        <Opcoes
          lista={CATEGORIAS}
          rotulos={CATEGORIA_ROTULO}
          atual={form.categoria}
          aoEscolher={form.setCategoria}
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
          atual={form.unidade}
          aoEscolher={form.setUnidade}
          desabilitado={travado}
        />
      </View>
      {form.unidade !== 'a_combinar' && campo('preco', 'Valor (R$)', true)}
      {campo('municipio', 'Município')}
      {campo('uf', 'Estado (UF)')}
    </>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: Spacing.two },
});
