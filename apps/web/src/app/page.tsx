import Link from "next/link";

const PASSOS = [
  {
    titulo: "Anuncie ou encontre o lote",
    texto: "Fotos, vídeo, peso, raça e sanidade. Busque por região, categoria e distância.",
  },
  {
    titulo: "Negocie com proposta",
    texto: "Combine preço, quantidade, pesagem, quebra, frete e data de embarque pelo app.",
  },
  {
    titulo: "Pagamento protegido",
    texto: "O comprador paga por Pix e o valor só é liberado ao vendedor depois da entrega conferida.",
  },
];

export default function Inicio() {
  return (
    <div className="space-y-16">
      <section className="space-y-4 py-8">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight">
          Gado direto de pecuarista para pecuarista.
        </h1>
        <p className="max-w-xl text-lg text-suave">
          Compre e venda bezerros, garrotes, novilhas e bois com segurança no pagamento,
          GTA em dia e reputação verificada.
        </p>
        <Link
          href="/lotes"
          className="inline-block rounded-lg bg-marca px-5 py-3 font-semibold text-marca-texto"
        >
          Ver lotes à venda
        </Link>
      </section>

      <section id="como-funciona" className="space-y-6">
        <h2 className="text-2xl font-bold">Como funciona</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="rounded-xl border border-borda bg-cartao p-5">
              <p className="text-sm font-bold text-marca">{i + 1}</p>
              <h3 className="mt-1 font-semibold">{p.titulo}</h3>
              <p className="mt-2 text-sm text-suave">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
