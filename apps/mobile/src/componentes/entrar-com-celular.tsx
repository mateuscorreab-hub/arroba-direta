import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { CODIGO_DIGITOS, entrarSchema, formatarTelefone, solicitarCodigoSchema } from '@arroba/shared';

import { Aviso } from '@/componentes/aviso';
import { Botao } from '@/componentes/botao';
import { CampoTexto } from '@/componentes/campo-texto';
import { Texto } from '@/componentes/texto';
import { Spacing } from '@/constants/theme';
import { ErroApi, textoDoErro } from '@/lib/api';
import { mascararTelefone } from '@/lib/formato';
import { useSessao } from '@/lib/sessao';

// Evita que a pessoa gaste os 5 pedidos por hora apertando "Reenviar" sem parar.
const ESPERA_REENVIO_S = 30;

type Envio = { telefone: string; codigoTeste?: string };

/** Login sem senha: o número do celular e depois o código recebido. */
export function EntrarComCelular() {
  const [telefone, setTelefone] = useState('');
  const [envio, setEnvio] = useState<Envio | null>(null);

  if (!envio) return <PassoTelefone telefone={telefone} setTelefone={setTelefone} aoEnviar={setEnvio} />;
  return <PassoCodigo envio={envio} aoReenviar={setEnvio} aoTrocarNumero={() => setEnvio(null)} />;
}

function PassoTelefone({
  telefone,
  setTelefone,
  aoEnviar,
}: {
  telefone: string;
  setTelefone: (v: string) => void;
  aoEnviar: (e: Envio) => void;
}) {
  const sessao = useSessao();
  const [erro, setErro] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function receberCodigo() {
    if (enviando) return;
    const r = solicitarCodigoSchema.safeParse({ telefone });
    if (!r.success) {
      setErro(r.error.issues[0]?.message);
      return;
    }
    setErro(undefined);
    setEnviando(true);
    try {
      const resposta = await sessao.solicitarCodigo(r.data.telefone);
      aoEnviar({ telefone: r.data.telefone, codigoTeste: resposta.codigoTeste });
    } catch (e) {
      setErro(e instanceof ErroApi ? (e.erros.telefone ?? e.message) : textoDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.passo}>
      <Texto tipo="titulo">Entre com seu celular</Texto>
      <Texto cor="textSecondary">Você recebe um código para entrar. Não precisa de senha.</Texto>
      <CampoTexto
        rotulo="Número do celular com DDD"
        placeholder="(67) 99999-0001"
        value={telefone}
        onChangeText={(v) => {
          setTelefone(mascararTelefone(v));
          setErro(undefined);
        }}
        onSubmitEditing={receberCodigo}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        autoCorrect={false}
        returnKeyType="send"
        editable={!enviando}
        erro={erro}
      />
      <Botao titulo="Receber código" onPress={receberCodigo} carregando={enviando} />
    </View>
  );
}

function PassoCodigo({
  envio,
  aoReenviar,
  aoTrocarNumero,
}: {
  envio: Envio;
  aoReenviar: (e: Envio) => void;
  aoTrocarNumero: () => void;
}) {
  const sessao = useSessao();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | undefined>();
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<'entrar' | 'reenviar' | null>(null);
  const [espera, setEspera] = useState(ESPERA_REENVIO_S);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function confirmar() {
    if (ocupado) return;
    const r = entrarSchema.safeParse({ telefone: envio.telefone, codigo });
    if (!r.success) {
      setErro(r.error.issues[0]?.message);
      return;
    }
    setErro(undefined);
    setAviso(null);
    setOcupado('entrar');
    try {
      await sessao.entrar(r.data.telefone, r.data.codigo);
    } catch (e) {
      setErro(e instanceof ErroApi ? (e.erros.codigo ?? e.message) : textoDoErro(e));
      setOcupado(null);
    }
  }

  async function reenviar() {
    if (ocupado || espera > 0) return;
    setErro(undefined);
    setAviso(null);
    setOcupado('reenviar');
    try {
      const resposta = await sessao.solicitarCodigo(envio.telefone);
      aoReenviar({ telefone: envio.telefone, codigoTeste: resposta.codigoTeste });
      setCodigo('');
      setAviso({ tipo: 'info', texto: 'Enviamos um código novo. O anterior não vale mais.' });
      setEspera(ESPERA_REENVIO_S);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: textoDoErro(e) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <View style={estilos.passo}>
      <Texto tipo="titulo">Entre com seu celular</Texto>
      <Texto>
        Digite o código de {CODIGO_DIGITOS} números enviado para{' '}
        <Texto style={estilos.negrito}>{formatarTelefone(envio.telefone)}</Texto>
      </Texto>

      {!envio.codigoTeste && (
        <Texto tipo="pequeno" cor="textSecondary">
          O SMS pode levar até um minuto para chegar. Se não chegar, confira o número ou peça de novo.
        </Texto>
      )}
      {envio.codigoTeste && (
        <Aviso>
          <Texto>Versão de teste: o código aparece aqui. Na versão final ele chega por SMS.</Texto>
          <Texto cor="brand" selectable style={estilos.codigoTeste} accessibilityLabel={`Código ${envio.codigoTeste.split('').join(' ')}`}>
            {envio.codigoTeste}
          </Texto>
        </Aviso>
      )}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <CampoTexto
        rotulo="Código"
        value={codigo}
        onChangeText={(v) => {
          setCodigo(v.replace(/\D/g, '').slice(0, CODIGO_DIGITOS));
          setErro(undefined);
        }}
        onSubmitEditing={confirmar}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        // "sms-otp" deixa o Android sugerir o código do SMS; no navegador o nome padrão é "one-time-code".
        autoComplete={Platform.OS === 'web' ? 'one-time-code' : 'sms-otp'}
        autoCorrect={false}
        autoFocus
        editable={ocupado === null}
        erro={erro}
        style={estilos.entradaCodigo}
      />

      <Botao titulo="Entrar" onPress={confirmar} carregando={ocupado === 'entrar'} desabilitado={ocupado !== null} />
      <Botao
        titulo={espera > 0 ? `Reenviar código (${espera} s)` : 'Reenviar código'}
        variante="secundario"
        onPress={reenviar}
        carregando={ocupado === 'reenviar'}
        desabilitado={ocupado !== null || espera > 0}
      />
      <Botao titulo="Trocar número" variante="discreto" onPress={aoTrocarNumero} desabilitado={ocupado !== null} />
    </View>
  );
}

const estilos = StyleSheet.create({
  passo: { gap: Spacing.three },
  negrito: { fontWeight: '700' },
  codigoTeste: { fontSize: 40, lineHeight: 48, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  entradaCodigo: { fontSize: 28, letterSpacing: 8, textAlign: 'center' },
});
