import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  formatarTelefone,
  type ContatoVendedor as Contato,
  type Lote,
  type PapelNegociacao,
} from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErroApi, obterContatoVendedor, textoDoErro } from '@/lib/api';
import { DICA_SEGURANCA, abrirLink, whatsAppDoLote } from '@/lib/contato';

/** Telefone do vendedor e botão do WhatsApp, para quem fez login. */
export function ContatoVendedor({ lote }: { lote: Lote }) {
  const tema = useTheme();
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<{ chave: string; contato?: Contato; erro?: unknown } | null>(null);
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);
  const chave = `${lote.id}:${tentativa}`;

  useEffect(() => {
    let ativo = true;
    obterContatoVendedor(lote.id).then(
      (contato) => ativo && setEstado({ chave, contato }),
      (erro) => ativo && setEstado({ chave, erro }),
    );
    return () => {
      ativo = false;
    };
  }, [lote.id, chave]);

  // Resposta de outro lote ou de outra tentativa ainda não vale para esta.
  const atual = estado?.chave === chave ? estado : null;
  if (!atual) return <ActivityIndicator color={tema.brand} />;
  if (!atual.contato) {
    // 404 e 409 não mudam tentando de novo: lote de exemplo, ou que saiu da busca depois de a tela abrir.
    if (atual.erro instanceof ErroApi && (atual.erro.status === 404 || atual.erro.status === 409)) {
      return <Aviso>{atual.erro.message}</Aviso>;
    }
    return (
      <>
        <Aviso tipo="erro">{`Não foi possível carregar o telefone do vendedor. ${textoDoErro(atual.erro)}`}</Aviso>
        <Botao titulo="Tentar de novo" variante="secundario" onPress={() => setTentativa((t) => t + 1)} />
      </>
    );
  }

  const { nome, telefone } = atual.contato;
  const abrir = async (url: string) => {
    setErroAbrir(null);
    if (!(await abrirLink(url))) setErroAbrir(`Não foi possível abrir. Anote o número: ${formatarTelefone(telefone)}.`);
  };
  return (
    <View style={estilos.bloco}>
      <Pressable
        onPress={() => abrir(`tel:${telefone}`)}
        accessibilityRole="link"
        accessibilityHint="Liga para o vendedor">
        <Texto cor="textSecondary">Telefone de {nome}</Texto>
        <Texto tipo="destaque" cor="brand" selectable>
          {formatarTelefone(telefone)}
        </Texto>
      </Pressable>
      {erroAbrir ? <Aviso tipo="erro">{erroAbrir}</Aviso> : null}
      <Botao titulo="Chamar no WhatsApp" onPress={() => abrir(whatsAppDoLote(telefone, lote.titulo))} />
      <Texto tipo="pequeno" cor="textSecondary">
        {DICA_SEGURANCA.comprador}
      </Texto>
    </View>
  );
}

/** Telefone da outra parte no topo da conversa: toque liga, e o link abre o WhatsApp. */
export function LinhaContato({
  telefone,
  nome,
  titulo,
  papel,
}: {
  telefone: string;
  nome: string;
  titulo: string;
  papel: PapelNegociacao;
}) {
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);
  const abrir = async (url: string) => {
    setErroAbrir(null);
    if (!(await abrirLink(url))) setErroAbrir(`Não foi possível abrir. Anote o número: ${formatarTelefone(telefone)}.`);
  };
  return (
    <>
      <View style={estilos.linha}>
        <Pressable onPress={() => abrir(`tel:${telefone}`)} accessibilityRole="link" accessibilityHint={`Liga para ${nome}`}>
          <Texto tipo="pequeno" style={estilos.negrito} selectable>
            {formatarTelefone(telefone)}
          </Texto>
        </Pressable>
        <Pressable
          onPress={() => abrir(whatsAppDoLote(telefone, titulo, papel))}
          accessibilityRole="link"
          accessibilityHint={`Abre o WhatsApp com ${nome}`}>
          <Texto tipo="pequeno" cor="brand" style={estilos.negrito}>
            Chamar no WhatsApp
          </Texto>
        </Pressable>
      </View>
      {erroAbrir ? <Aviso tipo="erro">{erroAbrir}</Aviso> : null}
    </>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: Spacing.three },
  linha: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: Spacing.one },
  negrito: { fontWeight: '700' },
});
