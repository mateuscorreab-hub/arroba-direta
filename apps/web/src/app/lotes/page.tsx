import type { Metadata } from "next";
import { Suspense } from "react";
import { CATEGORIAS, CATEGORIA_ROTULO, UFS } from "@arroba/shared";
import { LoteCard } from "@/components/lote-card";
import { buscarLotes } from "@/lib/api";

export const metadata: Metadata = { title: "Lotes à venda" };

type Busca = { categoria?: string; uf?: string; raca?: string };

async function Resultados({ searchParams }: { searchParams: Promise<Busca> }) {
  const { categoria, uf, raca } = await searchParams;
  const pagina = await buscarLotes({ categoria, uf, raca });

  if (pagina.itens.length === 0) {
    return <p className="text-suave">Nenhum lote encontrado com esses filtros.</p>;
  }
  return (
    <>
      <p className="text-sm text-suave">{pagina.total} lote(s) encontrado(s)</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pagina.itens.map((l) => (
          <LoteCard key={l.id} lote={l} />
        ))}
      </div>
    </>
  );
}

export default function Lotes({ searchParams }: PageProps<"/lotes">) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Lotes à venda</h1>

      <form className="flex flex-wrap gap-3" action="/lotes">
        <select name="categoria" className="w-full rounded-lg border border-borda bg-cartao px-3 py-2 sm:w-auto">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_ROTULO[c]}
            </option>
          ))}
        </select>
        <select name="uf" className="w-full rounded-lg border border-borda bg-cartao px-3 py-2 sm:w-auto">
          <option value="">Todos os estados</option>
          {UFS.map((uf) => (
            <option key={uf}>{uf}</option>
          ))}
        </select>
        <input
          name="raca"
          placeholder="Raça (ex.: Nelore)"
          className="w-full rounded-lg border border-borda bg-cartao px-3 py-2 sm:w-auto"
        />
        <button className="w-full rounded-lg bg-marca px-4 py-2 font-semibold text-marca-texto sm:w-auto">
          Buscar
        </button>
      </form>

      <Suspense fallback={<p className="text-suave">Carregando lotes…</p>}>
        <Resultados searchParams={searchParams as Promise<Busca>} />
      </Suspense>
    </div>
  );
}
