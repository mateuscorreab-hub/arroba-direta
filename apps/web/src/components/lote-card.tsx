import Image from "next/image";
import Link from "next/link";
import { CATEGORIA_ROTULO, type Lote } from "@arroba/shared";
import { SemFoto } from "@/components/sem-foto";
import { precoDoLote, resumoDoLote } from "@/lib/formato";

export function LoteCard({ lote }: { lote: Lote }) {
  return (
    <Link
      href={`/lotes/${lote.id}`}
      className="flex gap-3 overflow-hidden rounded-xl border border-borda bg-cartao p-3 transition hover:border-marca sm:flex-col sm:gap-0 sm:p-0"
    >
      <div className="relative aspect-4/3 w-32 shrink-0 self-start overflow-hidden rounded-lg sm:w-full sm:rounded-none">
        {lote.capa ? (
          // O título ao lado já diz do que é a foto.
          <Image src={lote.capa} alt="" fill className="object-cover" />
        ) : (
          <SemFoto rotulo={CATEGORIA_ROTULO[lote.categoria]} />
        )}
      </div>
      <div className="min-w-0 flex-1 sm:p-4">
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
      </div>
    </Link>
  );
}
