import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { duracaoVideoAceita, envioMidiaSchema, type EstadoMidias, type Midia, type RespostaUpload } from '@arroba/shared';

import {
  ErroApi,
  enviarArquivo,
  obterEstadoMidias,
  pedirEnvioMidia,
  registrarMidia,
  textoDoErro,
} from '@/lib/api';
import { medirArquivo, type ArquivoEscolhido } from '@/lib/escolher-midia';
import { duracaoTexto } from '@/lib/formato';

export type ItemEnvio = {
  chave: string;
  arquivo: ArquivoEscolhido;
  /**
   * pronto: escolhido no formulário de Anunciar, esperando o lote existir. enviado: já está no lote (só no
   * formulário; na tela de edição o arquivo enviado sai da lista e entra nas mídias).
   */
  estado: 'pronto' | 'esperando' | 'enviando' | 'registrando' | 'enviado' | 'erro';
  /** De 0 a 1. */
  progresso: number;
  erro?: string;
  /** Falha de conexão ou do servidor. Arquivo fora do limite ou lote cheio não adianta repetir. */
  podeTentarDeNovo?: boolean;
  /** Fora do limite de tamanho, tipo ou duração (problemaDoArquivo): não vai para o lote. */
  foraDoLimite?: boolean;
  /** A mídia registrada no lote, quando enviado. */
  midia?: Midia;
};

/** Como terminou enviar(). */
export type ResultadoEnvio = 'ok' | 'com-erro' | 'desligado' | 'sem-sessao' | 'cancelado';

type Tarefa = { arquivo: ArquivoEscolhido; resposta?: RespostaUpload; controle?: AbortController };
type Etapa = 'pedido' | 'envio' | 'registro';

/** Mensagem do problema que impede o envio, ou null se o arquivo está dentro dos limites. */
export function problemaDoArquivo(a: ArquivoEscolhido, tamanho = a.tamanho): string | null {
  if (a.tipo === 'video' && a.duracaoSeg !== null && !duracaoVideoAceita(a.duracaoSeg)) {
    return `O vídeo tem ${duracaoTexto(a.duracaoSeg)}. Escolha um vídeo de até 1 minuto.`;
  }
  if (tamanho === null) return null;
  const r = envioMidiaSchema.safeParse({ tipo: a.tipo, mime: a.mime, tamanho });
  return r.success ? null : (r.error.issues[0]?.message ?? 'Este arquivo não pode ser enviado.');
}

function mensagemDesligado(e: EstadoMidias): string | null {
  return e.ligado ? null : (e.mensagem ?? 'O envio de fotos e vídeos não está ligado agora.');
}

/**
 * Envia um arquivo de cada vez (na internet fraca, vários juntos disputam o sinal e todos demoram):
 * pede a autorização à API, manda o arquivo direto para o armazenamento e registra no lote.
 *
 * Com loteId (tela de edição), cada arquivo vai assim que é escolhido e, registrado, sai da lista e entra em
 * setMidias. Com loteId null (formulário de Anunciar, o lote ainda não existe), os arquivos ficam prontos até
 * enviar(id), que manda todos na ordem da lista (a primeira foto vira a capa); os registrados ficam na lista.
 */
export function useFilaEnvio(loteId: string | null, setMidias?: Dispatch<SetStateAction<Midia[]>>) {
  const automatico = loteId !== null;
  const [itens, setItens] = useState<ItemEnvio[]>([]);
  const [desligado, setDesligado] = useState<string | null>(null);
  // Cópia da lista para quem precisa dela sem esperar a tela atualizar (enviar diz como terminou).
  const lista = useRef<ItemEnvio[]>([]);
  const tarefas = useRef(new Map<string, Tarefa>());
  const fila = useRef<string[]>([]);
  const lote = useRef(loteId);
  const rodando = useRef(false);
  const aoEsvaziar = useRef<(() => void)[]>([]);
  const encerrado = useRef(false);
  const semSessao = useRef(false);
  const foiDesligado = useRef(false);
  const contador = useRef(0);

  useEffect(() => {
    encerrado.current = false;
    if (loteId) lote.current = loteId;
    const lista = tarefas.current;
    return () => {
      // Saiu da tela: para o que estiver enviando.
      encerrado.current = true;
      for (const t of lista.values()) t.controle?.abort();
    };
  }, [loteId]);

  useEffect(() => {
    let ativo = true;
    // Ao abrir a tela, antes de a pessoa escolher os arquivos. Sem resposta, fica sem saber: se o envio estiver
    // desligado, o primeiro pedido de envio volta 503 e a fila desliga.
    obterEstadoMidias().then(
      (e) => {
        if (ativo) setDesligado(mensagemDesligado(e));
      },
      () => {},
    );
    return () => {
      ativo = false;
    };
  }, []);

  function mudar(f: (l: ItemEnvio[]) => ItemEnvio[]) {
    lista.current = f(lista.current);
    setItens(lista.current);
  }

  function atualizar(chave: string, mudanca: Partial<ItemEnvio>) {
    mudar((l) => l.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }

  function falhar(chave: string, erro: string, podeTentarDeNovo: boolean, foraDoLimite = false) {
    if (!podeTentarDeNovo) tarefas.current.delete(chave);
    atualizar(chave, { estado: 'erro', erro, podeTentarDeNovo, foraDoLimite });
  }

  async function rodar() {
    if (rodando.current) return;
    rodando.current = true;
    try {
      while (fila.current.length > 0 && !encerrado.current) {
        const chave = fila.current.shift()!;
        const tarefa = tarefas.current.get(chave);
        if (tarefa) await enviarUm(chave, tarefa);
      }
    } finally {
      rodando.current = false;
      const esperando = aoEsvaziar.current;
      aoEsvaziar.current = [];
      for (const avisar of esperando) avisar();
    }
  }

  function esperarFila() {
    return new Promise<void>((resolve) => {
      if (rodando.current) aoEsvaziar.current.push(resolve);
      else resolve();
    });
  }

  async function enviarUm(chave: string, tarefa: Tarefa) {
    const { arquivo } = tarefa;
    const loteDoEnvio = lote.current;
    if (!loteDoEnvio) return;
    const continua = () => !encerrado.current && tarefas.current.get(chave) === tarefa;
    let etapa: Etapa = 'pedido';
    try {
      let resposta = tarefa.resposta;
      if (!resposta) {
        atualizar(chave, { estado: 'enviando', progresso: 0, erro: undefined });
        const tamanho = arquivo.tamanho ?? (await medirArquivo(arquivo.uri));
        if (tamanho === null) {
          falhar(chave, 'Não foi possível ler este arquivo. Escolha de novo.', false);
          return;
        }
        const problema = problemaDoArquivo(arquivo, tamanho);
        if (problema) {
          falhar(chave, problema, false, true);
          return;
        }
        const envio = await pedirEnvioMidia(loteDoEnvio, { tipo: arquivo.tipo, mime: arquivo.mime, tamanho });
        if (!continua()) return;
        etapa = 'envio';
        tarefa.controle = new AbortController();
        resposta = await enviarArquivo(
          envio,
          arquivo,
          (progresso) => atualizar(chave, { progresso }),
          tarefa.controle.signal,
        );
        tarefa.resposta = resposta;
      }
      if (!continua()) return;
      etapa = 'registro';
      atualizar(chave, { estado: 'registrando', progresso: 1 });
      const midia = await registrarMidia(loteDoEnvio, {
        tipo: arquivo.tipo,
        publicId: resposta.public_id,
        versao: resposta.version,
        assinatura: resposta.signature,
      });
      tarefas.current.delete(chave);
      if (automatico) mudar((l) => l.filter((i) => i.chave !== chave));
      else atualizar(chave, { estado: 'enviado', progresso: 1, midia });
      setMidias?.((l) => (l.some((m) => m.id === midia.id) ? l : [...l, midia]));
    } catch (e) {
      if (!continua()) return;
      const status = e instanceof ErroApi ? e.status : 0;
      if (status === 503 && etapa === 'pedido') {
        desligar(textoDoErro(e));
        return;
      }
      // No envio direto, 401 é do Cloudinary (autorização vencida), não da sessão.
      if (status === 401 && etapa !== 'envio') {
        semSessao.current = true;
        falhar(chave, 'Sua sessão terminou. Entre de novo para enviar.', false);
        return;
      }
      const temporario = status === 0 || status === 408 || status === 429 || status >= 500;
      if (etapa === 'pedido') {
        const porCampo = e instanceof ErroApi ? (e.erros.mime ?? e.erros.tamanho) : undefined;
        falhar(chave, porCampo ?? textoDoErro(e), temporario);
      } else if (etapa === 'envio') {
        // Autorização vencida ou inválida (401, ou 4xx que diz "Tente de novo") se resolve pedindo outra. Os outros
        // 4xx são recusa do próprio arquivo (grande demais, com defeito): repetir só gastaria internet.
        const recusado = status >= 400 && status < 500 && !temporario && status !== 401 && !/tente de novo/i.test(textoDoErro(e));
        falhar(chave, textoDoErro(e), !recusado);
      } else {
        // Sem conexão: basta registrar de novo. 400 que manda tentar ou enviar de novo (assinatura, arquivo que não
        // chegou): o arquivo vai de novo. Os outros 400 são limite (ex.: vídeo de mais de 1 minuto).
        const repetirEnvio = status === 400 && /(tente|envie) de novo/i.test(textoDoErro(e));
        if (status === 400) tarefa.resposta = undefined;
        falhar(chave, textoDoErro(e), temporario || repetirEnvio);
      }
    } finally {
      tarefa.controle = undefined;
    }
  }

  function desligar(mensagem: string) {
    foiDesligado.current = true;
    setDesligado(mensagem);
    tarefas.current.clear();
    fila.current = [];
    mudar((l) => l.filter((i) => i.estado === 'enviado'));
  }

  return {
    itens,
    /** Mensagem da API quando o envio de fotos e vídeos não está ligado (GET /midias/estado ou 503 no envio). */
    desligado,
    /** A lista como está agora, para usar logo depois de um await (a da tela pode estar atrasada). */
    listaAtual: () => lista.current,
    adicionar(arquivos: ArquivoEscolhido[]) {
      const novos = arquivos.map((arquivo): ItemEnvio => {
        contador.current += 1;
        const chave = `envio-${contador.current}`;
        const problema = problemaDoArquivo(arquivo);
        if (problema) return { chave, arquivo, estado: 'erro', progresso: 0, erro: problema, foraDoLimite: true };
        tarefas.current.set(chave, { arquivo });
        if (automatico) fila.current.push(chave);
        return { chave, arquivo, estado: automatico ? 'esperando' : 'pronto', progresso: 0 };
      });
      mudar((l) => [...l, ...novos]);
      if (automatico) void rodar();
    },
    /**
     * Manda para o lote o que está pronto e o que falhou mas pode ir de novo, na ordem da lista, e espera a fila
     * esvaziar.
     */
    async enviar(id: string): Promise<ResultadoEnvio> {
      lote.current = id;
      semSessao.current = false;
      foiDesligado.current = false;
      const vai = (i: ItemEnvio) =>
        i.estado === 'pronto' || (i.estado === 'erro' && !!i.podeTentarDeNovo && tarefas.current.has(i.chave));
      const chaves = new Set(lista.current.filter(vai).map((i) => i.chave));
      for (const chave of chaves) if (!fila.current.includes(chave)) fila.current.push(chave);
      mudar((l) =>
        l.map((i): ItemEnvio => (chaves.has(i.chave) ? { ...i, estado: 'esperando', progresso: 0, erro: undefined } : i)),
      );
      void rodar();
      await esperarFila();
      // Sessão perdida derruba a tela (encerrado); quem chamou ainda precisa saber para levar a pessoa a entrar.
      if (semSessao.current) return 'sem-sessao';
      if (encerrado.current) return 'cancelado';
      if (foiDesligado.current) return 'desligado';
      return lista.current.some((i) => i.estado === 'erro' && !i.foraDoLimite) ? 'com-erro' : 'ok';
    },
    /** A API mostrou que o envio está ligado (foi ligado depois que a tela abriu): a escolha de arquivos volta. */
    religar() {
      foiDesligado.current = false;
      setDesligado(null);
    },
    tentarDeNovo(chave: string) {
      if (!tarefas.current.has(chave) || fila.current.includes(chave)) return;
      atualizar(chave, { estado: 'esperando', progresso: 0, erro: undefined });
      fila.current.push(chave);
      void rodar();
    },
    /** Tira da fila; se estiver enviando, cancela. */
    remover(chave: string) {
      tarefas.current.get(chave)?.controle?.abort();
      tarefas.current.delete(chave);
      fila.current = fila.current.filter((c) => c !== chave);
      mudar((l) => l.filter((i) => i.chave !== chave));
    },
    /** Passa o arquivo para o começo da lista (a primeira foto é a capa). */
    usarComoCapa(chave: string) {
      mudar((l) => {
        const item = l.find((i) => i.chave === chave);
        return item ? [item, ...l.filter((i) => i !== item)] : l;
      });
    },
    /** Esvazia a lista depois que o anúncio foi publicado. */
    limpar() {
      for (const t of tarefas.current.values()) t.controle?.abort();
      tarefas.current.clear();
      fila.current = [];
      mudar(() => []);
    },
  };
}
