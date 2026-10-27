import type { DocumentoLegal as Documento } from "@arroba/shared";

/** Termos de uso e Política de privacidade: o texto vem de @arroba/shared, o mesmo do app. */
export function DocumentoLegal({ documento }: { documento: Documento }) {
  return (
    <article className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{documento.titulo}</h1>
        <p className="text-sm text-suave">Atualizado em {documento.atualizadoEm}</p>
        <p>{documento.introducao}</p>
      </header>
      {documento.secoes.map((secao) => (
        <section key={secao.titulo} className="space-y-3">
          <h2 className="text-xl font-semibold">{secao.titulo}</h2>
          {secao.blocos.map((bloco, i) =>
            typeof bloco === "string" ? (
              <p key={i}>{bloco}</p>
            ) : (
              <ul key={i} className="list-disc space-y-1 pl-6">
                {bloco.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </article>
  );
}
