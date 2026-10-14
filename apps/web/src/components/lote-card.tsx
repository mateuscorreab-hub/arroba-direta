import Link from "next/link";
import type { Lote } from "@arroba/shared";
import { precoDoLote, resumoDoLote } from "@/lib/formato";

export function LoteCard({ lote }: { lote: Lote }) {
  return (
    <Link
      href={`/lotes/${lote.id}`}
      className="block rounded-xl border border-borda bg-cartao p-4 transition hover:border-marca"
    >
      <p className="text-sm text-suave">
        {lote.municipio}/{lote.uf}
        {lote.distanciaKm !== undefined && ` · ${lote.distanciaKm} km`}
      </p>
      <h3 className="mt-1 text-lg font-semibold">{lote.titulo}</h3>
      <p className="mt-1 text-sm">{resumoDoLote(lote)}</p>
      <p className="mt-3 text-lg font-bold text-marca">{precoDoLote(lote)}</p>
      <p className="mt-2 text-sm text-suave">
        {lote.vendedor.nome}
        {lote.vendedor.verificado && " · ✓ verificado"}
      </p>
    </Link>
  );
}
