import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  FRETES,
  KG_POR_ARROBA,
  UNIDADES_PROPOSTA,
  UNIDADE_PRECO_ROTULO,
  VALIDADE_PROPOSTA_HORAS,
  dataEmbarqueValida,
  formatarReais,
  mascararContato,
  propostaCriarSchema,
  valorTotal,
  type ConversaDetalhe,
  type FretePorConta,
  type LoteResumo,
  type PropostaNegociacao,
  type UnidadeProposta,
} from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { CampoTexto } from '@/componentes/campo-texto';
import { Opcoes } from '@/componentes/opcoes';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { ErroApi, enviarProposta, textoDoErro } from '@/lib/api';
import {
  cabecas,
  dataDoCampo,
  formatarData,
  lerNumero,
  mascararData,
  numeroParaCampo,
  precoDoLote,
} from '@/lib/formato';

const FRETE_OPCAO = { comprador: 'Comprador', vendedor: 'Vendedor' } as const;
const CONFIRA_CAMPOS = 'Confira os campos marcados.';

/** Texto dos campos, com os mesmos nomes que a API usa nos erros. */
type Campos = { preco: string; quantidade: string; quebraPercentual: string; dataEmbarque: string; mensagem: string };

function iniciais(lote: LoteResumo, base: PropostaNegociacao | null): { unidade: UnidadeProposta; campos: Campos } {
  if (base) {
    return {
      unidade: base.unidadePreco,
      campos: {
        preco: numeroParaCampo(base.preco),
        quantidade: String(base.quantidade),
        quebraPercentual: numeroParaCampo(base.quebraPercentual),
        dataEmbarque: formatarData(base.dataEmbarque),
        mensagem: '',
      },
    };
  }
  // Primeira proposta: parte do preço do anúncio, quando ele serve para proposta.
  const u = lote.unidadePreco;
  const doAnuncio = u === 'cabeca' || ((u === 'kg' || u === 'arroba') && lote.pesoMedioKg) ? u : null;
  return {
    unidade: doAnuncio ?? 'cabeca',
    campos: {
      preco: doAnuncio && lote.preco != null ? numeroParaCampo(lote.preco) : '',
      quantidade: String(lote.quantidade),
      quebraPercentual: '0',
      dataEmbarque: '',
      mensagem: '',
    },
  };
}

function quebraDe(unidade: UnidadeProposta, campos: Campos) {
  return unidade === 'cabeca' ? 0 : (lerNumero(campos.quebraPercentual) ?? 0);
}

/** Valor do negócio enquanto a pessoa preenche; null se ainda faltar algo. */
function estimar(unidade: UnidadeProposta, campos: Campos, pesoMedioKg: number | null) {
  const preco = lerNumero(campos.preco);
  const quantidade = lerNumero(campos.quantidade);
  const quebra = quebraDe(unidade, campos);
  if (!preco || !quantidade || !Number.isInteger(quantidade) || !(quebra >= 0 && quebra <= 10)) return null;
  try {
    const valor = valorTotal({
      unidade,
      preco,
      quantidade,
      pesoMedioKg: pesoMedioKg ?? undefined,
      quebraPercentual: quebra,
    });
    return { valor, preco, quantidade, quebra };
  } catch {
    return null;
  }
}

type Props = {
  conversa: ConversaDetalhe;
  /** Proposta usada para preencher o formulário (contraproposta ou a última da conversa). */
  base: PropostaNegociacao | null;
  meuId: string;
  aoEnviar: () => void;
  aoCancelar: () => void;
};

export function FormularioProposta({ conversa, base, meuId, aoEnviar, aoCancelar }: Props) {
  const { lote, outraParte, propostaAberta } = conversa;
  const [inicio] = useState(() => iniciais(lote, base));
  const [unidade, setUnidade] = useState<UnidadeProposta>(inicio.unidade);
  const [frete, setFrete] = useState<FretePorConta | undefined>(base?.fretePorConta);
  const [campos, setCampos] = useState<Campos>(inicio.campos);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const unidades = lote.pesoMedioKg ? UNIDADES_PROPOSTA : (['cabeca'] as const);
  const respondendo = propostaAberta !== null && propostaAberta.autorId !== meuId;
  const estimado = estimar(unidade, campos, lote.pesoMedioKg);
  const vaiOcultar = mascararContato(campos.mensagem).mascarado;

  const limparErro = (campo: string) => {
    if (erros[campo]) setErros(({ [campo]: _, ...resto }) => resto);
    setAviso(null);
  };
  const mudar = (campo: keyof Campos, valor: string) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    limparErro(campo);
  };

  async function enviar() {
    if (enviando) return;
    setAviso(null);
    const dataEmbarque = dataDoCampo(campos.dataEmbarque);
    const r = propostaCriarSchema.safeParse({
      preco: lerNumero(campos.preco),
      unidadePreco: unidade,
      quantidade: lerNumero(campos.quantidade),
      quebraPercentual: quebraDe(unidade, campos),
      fretePorConta: frete,
      dataEmbarque: dataEmbarque ?? '',
      mensagem: campos.mensagem.trim() || undefined,
    });
    const novos: Record<string, string> = {};
    if (!r.success) {
      for (const i of r.error.issues) {
        const campo = String(i.path[0]);
        if (!(campo in novos)) novos[campo] = i.message;
      }
    }
    if (campos.dataEmbarque.trim() === '') novos.dataEmbarque = 'Informe a data de embarque';
    else if (dataEmbarque && !novos.dataEmbarque && !dataEmbarqueValida(dataEmbarque)) {
      novos.dataEmbarque = 'A data de embarque não pode ser antes de hoje';
    }
    if (!novos.quantidade && r.success && r.data.quantidade > lote.quantidade) {
      novos.quantidade = `O lote tem ${cabecas(lote.quantidade)}`;
    }
    if (!r.success || Object.keys(novos).length > 0) {
      setErros(novos);
      setAviso(CONFIRA_CAMPOS);
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await enviarProposta(conversa.id, r.data);
      aoEnviar();
    } catch (e) {
      const porCampo = e instanceof ErroApi ? e.erros : {};
      setErros(porCampo);
      setAviso(Object.keys(porCampo).length > 0 ? CONFIRA_CAMPOS : textoDoErro(e));
      setEnviando(false);
    }
  }

  const erroDe = (campo: string) =>
    erros[campo] ? (
      <Texto tipo="pequeno" cor="danger">
        {erros[campo]}
      </Texto>
    ) : null;

  return (
    <View style={estilos.formulario}>
      <Texto tipo="titulo">{respondendo ? 'Contraproposta' : 'Nova proposta'}</Texto>
      <View style={estilos.grupo}>
        <Texto tipo="subtitulo">{lote.titulo}</Texto>
        <Texto cor="textSecondary">
          Anúncio: {precoDoLote(lote)} · {cabecas(lote.quantidade)}
          {lote.pesoMedioKg ? ` · peso médio ${lote.pesoMedioKg} kg` : ''}
        </Texto>
      </View>

      {propostaAberta && (
        <Aviso>
          {respondendo
            ? `Esta proposta responde à de ${outraParte.nome}, que fica como respondida com contraproposta.`
            : 'Sua proposta anterior, ainda sem resposta, será substituída por esta.'}
        </Aviso>
      )}

      <CampoTexto
        rotulo="Preço (R$)"
        placeholder="Ex.: 2.500,00"
        value={campos.preco}
        onChangeText={(v) => mudar('preco', v)}
        keyboardType="decimal-pad"
        editable={!enviando}
        erro={erros.preco}
      />
      <View style={estilos.grupo}>
        <Texto tipo="pequeno" cor="textSecondary">
          O preço é
        </Texto>
        <Opcoes
          lista={unidades}
          rotulos={UNIDADE_PRECO_ROTULO}
          atual={unidade}
          aoEscolher={(u) => {
            setUnidade(u);
            limparErro('unidadePreco');
          }}
        />
        {!lote.pesoMedioKg && (
          <Texto tipo="pequeno" cor="textSecondary">
            Este lote não tem peso médio, então a proposta é por cabeça.
          </Texto>
        )}
        {erroDe('unidadePreco')}
      </View>
      <CampoTexto
        rotulo={`Quantidade de cabeças (o lote tem ${lote.quantidade})`}
        value={campos.quantidade}
        onChangeText={(v) => mudar('quantidade', v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        editable={!enviando}
        erro={erros.quantidade}
      />
      {unidade !== 'cabeca' && (
        <CampoTexto
          rotulo="Quebra (%), desconto no peso por jejum e transporte"
          value={campos.quebraPercentual}
          onChangeText={(v) => mudar('quebraPercentual', v)}
          keyboardType="decimal-pad"
          editable={!enviando}
          erro={erros.quebraPercentual}
        />
      )}
      <View style={estilos.grupo}>
        <Texto tipo="pequeno" cor="textSecondary">
          Frete por conta de quem?
        </Texto>
        <Opcoes
          lista={FRETES}
          rotulos={FRETE_OPCAO}
          atual={frete}
          aoEscolher={(f) => {
            setFrete(f);
            limparErro('fretePorConta');
          }}
        />
        {erroDe('fretePorConta')}
      </View>
      <CampoTexto
        rotulo="Data de embarque"
        placeholder="dd/mm/aaaa"
        value={campos.dataEmbarque}
        onChangeText={(v) => mudar('dataEmbarque', mascararData(v))}
        keyboardType="number-pad"
        maxLength={10}
        editable={!enviando}
        erro={erros.dataEmbarque}
      />
      <View style={estilos.grupo}>
        <CampoTexto
          rotulo="Mensagem (opcional)"
          placeholder="Ex.: busco na fazenda com meu caminhão"
          value={campos.mensagem}
          onChangeText={(v) => mudar('mensagem', v)}
          multiline
          maxLength={1000}
          editable={!enviando}
          erro={erros.mensagem}
          style={estilos.mensagem}
        />
        {vaiOcultar && !conversa.negocioFechado && (
          <Texto tipo="pequeno" cor="textSecondary">
            Telefone e e-mail ficam ocultos até o negócio fechar.
          </Texto>
        )}
      </View>

      <Aviso>
        {estimado ? (
          <>
            <Texto tipo="destaque" cor="brand">
              Valor estimado: {formatarReais(estimado.valor)}
            </Texto>
            <Texto tipo="pequeno" cor="textSecondary">
              {unidade === 'cabeca'
                ? `${cabecas(estimado.quantidade)} × ${formatarReais(estimado.preco)}`
                : `${cabecas(estimado.quantidade)} com peso médio de ${lote.pesoMedioKg} kg` +
                  (estimado.quebra ? `, com quebra de ${numeroParaCampo(estimado.quebra)}%` : '') +
                  (unidade === 'arroba' ? ` (1 arroba = ${KG_POR_ARROBA} kg)` : '')}
            </Texto>
          </>
        ) : (
          <Texto>Preencha o preço e a quantidade para ver o valor estimado.</Texto>
        )}
      </Aviso>

      <Texto tipo="pequeno" cor="textSecondary">
        A proposta vale por {VALIDADE_PROPOSTA_HORAS} horas. Se {outraParte.nome} aceitar, o negócio fecha nesses
        termos.
      </Texto>
      {aviso ? <Aviso tipo="erro">{aviso}</Aviso> : null}
      <Botao
        titulo={respondendo ? 'Enviar contraproposta' : 'Enviar proposta'}
        onPress={enviar}
        carregando={enviando}
      />
      <Botao titulo="Cancelar" variante="discreto" onPress={aoCancelar} desabilitado={enviando} />
    </View>
  );
}

const estilos = StyleSheet.create({
  formulario: { gap: Spacing.three },
  grupo: { gap: Spacing.two },
  mensagem: { minHeight: 90, textAlignVertical: 'top' },
});
