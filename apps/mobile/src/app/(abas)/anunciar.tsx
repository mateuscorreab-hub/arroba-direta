import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CATEGORIAS,
  CATEGORIA_ROTULO,
  UNIDADES_PRECO,
  UNIDADE_PRECO_ROTULO,
  loteCriarSchema,
  type Categoria,
  type UnidadePreco,
} from '@arroba/shared';

import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { criarLote } from '@/lib/api';

/**
 * Primeira versão do formulário de anúncio.
 * Próximos passos: fotos e vídeo (expo-image-picker), localização pelo GPS,
 * sanidade e rascunho salvo offline.
 */
export default function Anunciar() {
  const tema = useTheme();
  const [categoria, setCategoria] = useState<Categoria>('bezerro');
  const [unidade, setUnidade] = useState<UnidadePreco>('cabeca');
  const [campos, setCampos] = useState({
    titulo: '',
    raca: '',
    quantidade: '',
    pesoMedioKg: '',
    preco: '',
    municipio: '',
    uf: '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

  async function enviar() {
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
      uf: campos.uf.toUpperCase(),
      // TODO: pegar do GPS. Por enquanto, centro aproximado do Brasil.
      lat: -15.78,
      lng: -47.93,
    });
    if (!r.success) {
      setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      await criarLote(r.data);
      Alert.alert('Anúncio enviado', 'Seu lote vai ao ar depois de uma revisão rápida.');
    } catch (e) {
      Alert.alert('Não foi possível enviar', e instanceof Error ? e.message : 'Tente de novo');
    } finally {
      setEnviando(false);
    }
  }

  const campo = (chave: keyof typeof campos, rotulo: string, numerico = false) => (
    <View style={estilos.campo}>
      <Texto tipo="pequeno" cor="textSecondary">
        {rotulo}
      </Texto>
      <TextInput
        value={campos[chave]}
        onChangeText={(v) => setCampos((c) => ({ ...c, [chave]: v }))}
        keyboardType={numerico ? 'decimal-pad' : 'default'}
        style={[
          estilos.entrada,
          { color: tema.text, borderColor: erros[chave] ? tema.danger : tema.border, backgroundColor: tema.backgroundElement },
        ]}
      />
      {erros[chave] && (
        <Texto tipo="pequeno" cor="danger">
          {erros[chave]}
        </Texto>
      )}
    </View>
  );

  const opcoes = <T extends string>(lista: readonly T[], rotulos: Record<T, string>, atual: T, set: (v: T) => void) => (
    <View style={estilos.opcoes}>
      {lista.map((v) => (
        <Pressable
          key={v}
          onPress={() => set(v)}
          style={[estilos.chip, { borderColor: tema.border, backgroundColor: v === atual ? tema.brand : tema.backgroundElement }]}>
          <Texto tipo="pequeno" cor={v === atual ? 'onBrand' : 'text'}>
            {rotulos[v]}
          </Texto>
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tema.background }} edges={['top']}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Texto tipo="titulo">Anunciar lote</Texto>
        {campo('titulo', 'Título (ex.: 100 bezerros Nelore desmamados)')}
        <Texto tipo="pequeno" cor="textSecondary">
          Categoria
        </Texto>
        {opcoes(CATEGORIAS, CATEGORIA_ROTULO, categoria, setCategoria)}
        {campo('raca', 'Raça')}
        {campo('quantidade', 'Quantidade de cabeças', true)}
        {campo('pesoMedioKg', 'Peso médio (kg)', true)}
        <Texto tipo="pequeno" cor="textSecondary">
          Preço
        </Texto>
        {opcoes(UNIDADES_PRECO, UNIDADE_PRECO_ROTULO, unidade, setUnidade)}
        {unidade !== 'a_combinar' && campo('preco', 'Valor (R$)', true)}
        {campo('municipio', 'Município')}
        {campo('uf', 'Estado (UF)')}
        <Pressable
          onPress={enviar}
          disabled={enviando}
          style={[estilos.botao, { backgroundColor: tema.brand, opacity: enviando ? 0.6 : 1 }]}>
          <Texto tipo="destaque" cor="onBrand">
            {enviando ? 'Enviando…' : 'Publicar anúncio'}
          </Texto>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 140 },
  campo: { gap: Spacing.one },
  entrada: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 17 },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  botao: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.two },
});
