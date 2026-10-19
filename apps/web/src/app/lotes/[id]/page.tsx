import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CATEGORIA_ROTULO, VACINAS, type StatusLote } from "@arroba/shared";
import { GaleriaLote } from "@/components/galeria-lote";
import { SemFoto } from "@/components/sem-foto";
import { ErroApi, obterLote } from "@/lib/api";
import { precoDoLote, resumoDoLote } from "@/lib/formato";

const VACINA_ROTULO: Record<(typeof VACINAS)[number], string> = {
  brucelose: "Brucelose",
  raiva: "Raiva",
  clostridioses: "Clostridioses",
  ibr_bvd: "IBR/BVD",
  leptospirose: "Leptospirose",
};

// Fora da busca o lote ainda abre por link (compartilhado antes, por exemplo); a página diz que não está à venda.
const INDISPONIVEL: Partial<Record<StatusLote, string>> = {
  vendido: "Este lote já foi vendido.",
  negociando: "Este lote já tem negócio fechado.",
  encerrado: "O vendedor pausou este anúncio. Ele pode voltar mais tarde.",
  rascunho: "Este anúncio ainda não foi publicado.",
  em_analise: "Este anúncio ainda está em revisão.",
};

async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lote = await obterLote(id).catch((e) => {
    if (e instanceof ErroApi && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  });

  const ficha: [string, string][] = [
    ["Categoria", CATEGORIA_ROTULO[lote.categoria]],
    ["Raça", lote.raca],
    ["Quantidade", `${lote.quantidade} cabeças`],
    ["Idade média", lote.idadeMediaMeses ? `${lote.idadeMediaMeses} meses` : "Não informada"],
    ["Peso médio", lote.pesoMedioKg ? `${lote.pesoMedioKg} kg` : "Não informado"],
    ["Local", `${lote.municipio}/${lote.uf}`],
    [
      "Vacinas",
      lote.sanidade.vacinas.map((v) => VACINA_ROTULO[v]).join(", ") || "Não informadas",
    ],
    ["Vermifugado", lote.sanidade.vermifugado ? "Sim" : "Não informado"],
  ];

  const midias = lote.midias ?? [];
  const indisponivel = INDISPONIVEL[lote.status];

  return (
    <article className="space-y-6">
      {indisponivel && (
        <p role="status" className="rounded-xl border border-marca bg-cartao p-4 font-semibold">
          {indisponivel}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          {midias.length > 0 ? (
            <GaleriaLote midias={midias} titulo={lote.titulo} />
          ) : (
            <div className="aspect-video overflow-hidden rounded-xl lg:aspect-4/3">
              <SemFoto
                rotulo={CATEGORIA_ROTULO[lote.categoria]}
                texto="O vendedor ainda não colocou fotos deste lote."
              />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div>
            <p className="text-sm text-suave">{resumoDoLote(lote)}</p>
            <h1 className="mt-1 text-3xl font-bold">{lote.titulo}</h1>
            <p className="mt-3 text-2xl font-bold text-marca">{precoDoLote(lote)}</p>
          </div>

          <dl className="grid gap-x-8 gap-y-3 rounded-xl border border-borda bg-cartao p-5 sm:grid-cols-2">
            {ficha.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-suave">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {lote.descricao && <p className="whitespace-pre-line">{lote.descricao}</p>}

      <div className="rounded-xl border border-borda bg-cartao p-5">
        <p className="font-semibold">
          {lote.vendedor.nome}
          {lote.vendedor.verificado && <span className="text-marca"> · ✓ verificado</span>}
        </p>
        <p className="text-sm text-suave">
          {lote.vendedor.municipio}/{lote.vendedor.uf}
        </p>
        <p className="mt-3 text-sm">
          Para ver o telefone do vendedor, conversar ou fazer uma proposta, entre no app Arroba
          Direta com o número do seu celular.
        </p>
      </div>
    </article>
  );
}

export default function LotePagina({ params }: PageProps<"/lotes/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/lotes" className="text-sm text-marca">
        ← Voltar aos lotes
      </Link>
      <Suspense fallback={<p className="text-suave">Carregando lote…</p>}>
        <Detalhe params={params} />
      </Suspense>
    </div>
  );
}
