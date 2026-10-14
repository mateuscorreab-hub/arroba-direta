import type { Lote, LoteCriar, Pagina } from '@arroba/shared';

// No Render, a variável chega só com o host (ex.: arroba-api.onrender.com).
const API_URL = comEsquema(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333');

function comEsquema(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

// Provisório até o login por código no celular existir.
const USUARIO_DEV = process.env.EXPO_PUBLIC_DEV_USUARIO_ID;

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${caminho}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(USUARIO_DEV ? { 'x-usuario-id': USUARIO_DEV } : {}),
      ...init?.headers,
    },
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(corpo?.mensagem ?? corpo?.message ?? `Erro ${res.status}`);
  return corpo as T;
}

export function buscarLotes(filtro: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtro)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return requisitar<Pagina<Lote>>(`/lotes?${qs}`);
}

export function obterLote(id: string) {
  return requisitar<Lote>(`/lotes/${id}`);
}

export function criarLote(dados: LoteCriar) {
  return requisitar<Lote>('/lotes', { method: 'POST', body: JSON.stringify(dados) });
}
