import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { duracaoVideoAceita, envioMidiaSchema, type Midia, type RespostaUpload } from '@arroba/shared';

import { ErroApi, enviarArquivo, pedirEnvioMidia, registrarMidia, textoDoErro } from '@/lib/api';
import { medirArquivo, type ArquivoEscolhido } from '@/lib/escolher-midia';
import { duracaoTexto } from '@/lib/formato';

export type ItemEnvio = {
  chave: string;
  arquivo: ArquivoEscolhido;
  estado: 'esperando' | 'enviando' | 'registrando' | 'erro';
  /** De 0 a 1. */
  progresso: number;
  erro?: string;
  /** Falha de conexão ou do servidor. Arquivo fora do limite ou lote cheio não adianta repetir. */
  podeTentarDeNovo?: boolean;
};

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

/**
 * Envia um arquivo de cada vez (na internet fraca, vários juntos disputam o sinal e todos demoram):
 * pede a autorização à API, manda o arquivo direto para o armazenamento e registra no lote.
 * Cada mídia registrada entra em setMidias.
 */
export function useFilaEnvio(loteId: string, setMidias: Dispatch<SetStateAction<Midia[]>>) {
  const [itens, setItens] = useState<ItemEnvio[]>([]);
  const [desligado, setDesligado] = useState<string | null>(null);
  const tarefas = useRef(new Map<string, Tarefa>());
  const fila = useRef<string[]>([]);
  const rodando = useRef(false);
  const encerrado = useRef(false);
  const contador = useRef(0);

  useEffect(() => {
    encerrado.current = false;
    const lista = tarefas.current;
    let ativo = true;
    // Descobre ao abrir a tela se o envio está desligado nesta versão, antes de a pessoa escolher os arquivos.
    // Pedir a autorização não grava nada; se o lote já estiver cheio (409), a tela já mostra isso.
    pedirEnvioMidia(loteId, { tipo: 'foto', mime: 'image/jpeg', tamanho: 1 }).catch((e: unknown) => {
      if (ativo && e instanceof ErroApi && e.status === 503) setDesligado(e.message);
    });
    return () => {
      // Saiu da tela: para o que estiver enviando.
      ativo = false;
      encerrado.current = true;
      for (const t of lista.values()) t.controle?.abort();
    };
  }, [loteId]);

  function atualizar(chave: string, mudanca: Partial<ItemEnvio>) {
    setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }

  function falhar(chave: string, erro: string, podeTentarDeNovo: boolean) {
    if (!podeTentarDeNovo) tarefas.current.delete(chave);
    atualizar(chave, { estado: 'erro', erro, podeTentarDeNovo });
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
    }
  }

  async function enviarUm(chave: string, tarefa: Tarefa) {
    const { arquivo } = tarefa;
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
          falhar(chave, problema, false);
          return;
        }
        const envio = await pedirEnvioMidia(loteId, { tipo: arquivo.tipo, mime: arquivo.mime, tamanho });
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
      const midia = await registrarMidia(loteId, {
        tipo: arquivo.tipo,
        publicId: resposta.public_id,
        versao: resposta.version,
        assinatura: resposta.signature,
      });
      tarefas.current.delete(chave);
      setItens((l) => l.filter((i) => i.chave !== chave));
      setMidias((l) => (l.some((m) => m.id === midia.id) ? l : [...l, midia]));
    } catch (e) {
      if (!continua()) return;
      const status = e instanceof ErroApi ? e.status : 0;
      if (status === 503 && etapa === 'pedido') {
        desligar(textoDoErro(e));
        return;
      }
      // No envio direto, 401 é do Cloudinary (autorização vencida), não da sessão.
      if (status === 401 && etapa !== 'envio') {
        falhar(chave, 'Sua sessão terminou. Entre de novo para enviar.', false);
        return;
      }
      const temporario = status === 0 || status === 408 || status === 429 || status >= 500;
      if (etapa === 'pedido') {
        const porCampo = e instanceof ErroApi ? (e.erros.mime ?? e.erros.tamanho) : undefined;
        falhar(chave, porCampo ?? textoDoErro(e), temporario);
      } else if (etapa === 'envio') {
        // Inclui autorização vencida no meio de um envio lento: tentar de novo pede outra.
        falhar(chave, textoDoErro(e), true);
      } else {
        // Sem conexão: basta registrar de novo. 400 "Envio inválido. Tente de novo." (assinatura): o arquivo vai
        // de novo. Os outros 400 são limite (ex.: vídeo de mais de 1 minuto) e repetir só gastaria internet.
        const repetirEnvio = status === 400 && /tente de novo/i.test(textoDoErro(e));
        if (status === 400) tarefa.resposta = undefined;
        falhar(chave, textoDoErro(e), temporario || repetirEnvio);
      }
    } finally {
      tarefa.controle = undefined;
    }
  }

  function desligar(mensagem: string) {
    setDesligado(mensagem);
    tarefas.current.clear();
    fila.current = [];
    setItens([]);
  }

  return {
    itens,
    /** Mensagem da API quando o envio de fotos e vídeos não está ligado. */
    desligado,
    adicionar(arquivos: ArquivoEscolhido[]) {
      const novos = arquivos.map((arquivo): ItemEnvio => {
        contador.current += 1;
        const chave = `envio-${contador.current}`;
        const problema = problemaDoArquivo(arquivo);
        if (problema) return { chave, arquivo, estado: 'erro', progresso: 0, erro: problema };
        tarefas.current.set(chave, { arquivo });
        fila.current.push(chave);
        return { chave, arquivo, estado: 'esperando', progresso: 0 };
      });
      setItens((l) => [...l, ...novos]);
      void rodar();
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
      setItens((l) => l.filter((i) => i.chave !== chave));
    },
  };
}
