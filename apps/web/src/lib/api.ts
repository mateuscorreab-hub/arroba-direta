import type { Lote, Pagina } from "@arroba/shared";

// No Render, a variável chega só com o host (ex.: arroba-api.onrender.com).
const API_URL = comEsquema(process.env.API_URL ?? "http://localhost:3333");

function comEsquema(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

export class ErroApi extends Error {
  constructor(public status: number) {
    super(`API respondeu ${status}`);
  }
}

async function get<T>(caminho: string): Promise<T> {
  const res = await fetch(`${API_URL}${caminho}`);
  if (!res.ok) throw new ErroApi(res.status);
  return res.json() as Promise<T>;
}

export function buscarLotes(filtro: Record<string, string | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(filtro).filter((e): e is [string, string] => !!e[1]),
  );
  return get<Pagina<Lote>>(`/lotes?${qs}`);
}

export function obterLote(id: string) {
  return get<Lote>(`/lotes/${id}`);
}
