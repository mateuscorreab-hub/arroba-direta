import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import type { Eu, Perfil, RespostaSolicitarCodigo } from '@arroba/shared';

import * as api from '@/lib/api';
import { apagarTokenSalvo, lerTokenSalvo, salvarToken } from '@/lib/token-salvo';

type Sessao = {
  usuario: Eu | null;
  carregando: boolean;
  /** Tinha login salvo mas não deu para carregar o perfil (ex.: sem internet). */
  erro: string | null;
  tentarDeNovo: () => void;
  /** telefone já normalizado (+55DD9XXXXXXXX). */
  solicitarCodigo: (telefone: string) => Promise<RespostaSolicitarCodigo>;
  entrar: (telefone: string, codigo: string) => Promise<void>;
  atualizarPerfil: (dados: Perfil) => Promise<void>;
  sair: () => void;
};

const ContextoSessao = createContext<Sessao | null>(null);

type Estado = { usuario: Eu | null; carregando: boolean; erro: string | null };
const SEM_SESSAO: Estado = { usuario: null, carregando: false, erro: null };

function esquecerToken() {
  api.definirToken(null);
  apagarTokenSalvo();
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ ...SEM_SESSAO, carregando: true });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    api.quandoPerderSessao(() => {
      esquecerToken();
      setEstado(SEM_SESSAO);
    });
    return () => api.quandoPerderSessao(null);
  }, []);

  useEffect(() => {
    let ativo = true;
    lerTokenSalvo()
      .then(async (token) => {
        if (!token) return null;
        api.definirToken(token);
        return api.obterEu();
      })
      .then(
        (usuario) => {
          if (ativo) setEstado({ usuario, carregando: false, erro: null });
        },
        (e: unknown) => {
          if (!ativo) return;
          // 401 já limpou a sessão (quandoPerderSessao); o resto é falha de rede ou do servidor.
          if (e instanceof api.ErroApi && e.status === 401) return;
          setEstado({
            usuario: null,
            carregando: false,
            erro: e instanceof Error ? e.message : 'Não foi possível carregar seu perfil.',
          });
        },
      );
    return () => {
      ativo = false;
    };
  }, [versao]);

  const valor: Sessao = {
    ...estado,
    tentarDeNovo() {
      setEstado((s) => ({ ...s, carregando: true, erro: null }));
      setVersao((v) => v + 1);
    },
    solicitarCodigo(telefone) {
      return api.solicitarCodigo({ telefone });
    },
    async entrar(telefone, codigo) {
      const { token, usuario } = await api.entrar({ telefone, codigo });
      api.definirToken(token);
      await salvarToken(token);
      setEstado({ usuario, carregando: false, erro: null });
    },
    async atualizarPerfil(dados) {
      const usuario = await api.atualizarPerfil(dados);
      setEstado((s) => ({ ...s, usuario }));
    },
    sair() {
      const token = api.tokenDaSessao();
      esquecerToken();
      setEstado(SEM_SESSAO);
      // Revoga no servidor sem prender a pessoa esperando; se falhar, o token expira sozinho.
      if (token) api.sair(token).catch(() => {});
    },
  };

  return <ContextoSessao value={valor}>{children}</ContextoSessao>;
}

export function useSessao(): Sessao {
  const sessao = use(ContextoSessao);
  if (!sessao) throw new Error('useSessao precisa estar dentro de <ProvedorSessao>');
  return sessao;
}
