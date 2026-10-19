import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Busca os dados ao focar a tela e de novo a cada `intervaloMs` enquanto ela estiver em foco.
 * `buscar` precisa ser estável (useCallback). Não começa uma busca antes de a anterior terminar
 * (internet lenta) e descarta respostas que chegam depois de sair da tela ou de `definir`.
 */
export function useDadosEmFoco<T>(buscar: () => Promise<T>, intervaloMs: number) {
  const [estado, setEstado] = useState<{ dados: T | null; erro: unknown }>({ dados: null, erro: null });
  const geracao = useRef(0);
  const ultimoJson = useRef('');

  // Sem mudança, mantém o mesmo objeto para não redesenhar a tela a cada busca.
  const aplicar = useCallback((dados: T) => {
    const json = JSON.stringify(dados);
    if (json === ultimoJson.current) {
      setEstado((e) => (e.erro ? { ...e, erro: null } : e));
      return;
    }
    ultimoJson.current = json;
    setEstado({ dados, erro: null });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let focada = true;
      let ocupada = false;
      const rodar = async () => {
        if (ocupada) return;
        ocupada = true;
        const minha = geracao.current;
        try {
          const dados = await buscar();
          if (focada && minha === geracao.current) aplicar(dados);
        } catch (erro) {
          if (focada && minha === geracao.current) setEstado((e) => ({ ...e, erro }));
        } finally {
          ocupada = false;
        }
      };
      rodar();
      const relogio = setInterval(rodar, intervaloMs);
      return () => {
        focada = false;
        clearInterval(relogio);
      };
    }, [buscar, intervaloMs, aplicar]),
  );

  /** Busca agora (ex.: "Tentar de novo" ou depois de uma ação). */
  const recarregar = useCallback(async () => {
    const minha = ++geracao.current;
    setEstado((e) => (e.erro ? { ...e, erro: null } : e));
    try {
      const dados = await buscar();
      if (minha === geracao.current) aplicar(dados);
    } catch (erro) {
      if (minha === geracao.current) setEstado((e) => ({ ...e, erro }));
    }
  }, [buscar, aplicar]);

  /** Troca os dados na hora com a resposta de uma ação; buscas já em andamento são ignoradas. */
  const definir = useCallback((atualizar: (atual: T) => T) => {
    geracao.current += 1;
    ultimoJson.current = '';
    setEstado((e) => (e.dados === null ? e : { dados: atualizar(e.dados), erro: null }));
  }, []);

  return { dados: estado.dados, erro: estado.erro, recarregar, definir };
}
