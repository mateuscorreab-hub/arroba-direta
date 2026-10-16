"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Midia } from "@arroba/shared";

function duracao(segundos: number) {
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function rolagem(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function Seta({ direcao }: { direcao: "esquerda" | "direita" }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-6 w-6">
      <path d={direcao === "esquerda" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Fotos e vídeo do lote: desliza com o dedo, pelas setas ou pelas miniaturas. */
export function GaleriaLote({ midias, titulo }: { midias: Midia[]; titulo: string }) {
  const trilho = useRef<HTMLDivElement>(null);
  const miniaturas = useRef<HTMLUListElement>(null);
  const [atual, setAtual] = useState(0);
  const total = midias.length;

  function aoRolar() {
    const el = trilho.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    if (i === atual) return;
    // O vídeo que saiu da tela para de tocar.
    el.querySelectorAll("video").forEach((v) => v.pause());
    setAtual(i);
    // Mantém a miniatura da vez à vista quando a fileira não cabe na tela.
    const lista = miniaturas.current;
    const item = lista?.children[i];
    if (lista && item) {
      const caixa = lista.getBoundingClientRect();
      const m = item.getBoundingClientRect();
      lista.scrollBy({ left: m.left - caixa.left - (caixa.width - m.width) / 2, behavior: rolagem() });
    }
  }

  function irPara(i: number) {
    trilho.current?.scrollTo({ left: i * trilho.current.clientWidth, behavior: rolagem() });
  }

  const botaoSeta =
    "absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-palco/70 text-palco-texto transition disabled:opacity-30";

  return (
    <section aria-label="Fotos e vídeo do lote" className="space-y-3">
      <div className="relative">
        <div
          ref={trilho}
          onScroll={aoRolar}
          className="flex aspect-4/3 snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl bg-palco [scrollbar-width:none]"
        >
          {midias.map((m, i) => (
            <div
              key={m.id}
              role="group"
              aria-label={`${i + 1} de ${total}`}
              className="relative h-full w-full shrink-0 snap-center snap-always"
            >
              {m.tipo === "foto" ? (
                <Image
                  src={m.url}
                  alt={`Foto ${i + 1} de ${total} do lote ${titulo}`}
                  fill
                  className="object-contain"
                  // Carrega a que está na tela e a próxima; as outras só quando chegar perto.
                  loading={i <= atual + 1 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : undefined}
                />
              ) : (
                <video
                  src={m.url}
                  poster={m.miniatura}
                  controls
                  playsInline
                  preload="none"
                  aria-label={`Vídeo do lote ${titulo}`}
                  className="h-full w-full object-contain"
                >
                  <a href={m.url} className="text-palco-texto underline">
                    Abrir o vídeo do lote
                  </a>
                </video>
              )}
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            <p className="pointer-events-none absolute right-3 top-3 rounded-full bg-palco/70 px-3 py-1 text-sm font-semibold text-palco-texto">
              {atual + 1}/{total}
            </p>
            <button
              type="button"
              onClick={() => irPara(atual - 1)}
              disabled={atual === 0}
              aria-label="Anterior"
              className={`${botaoSeta} left-2`}
            >
              <Seta direcao="esquerda" />
            </button>
            <button
              type="button"
              onClick={() => irPara(atual + 1)}
              disabled={atual === total - 1}
              aria-label="Próxima"
              className={`${botaoSeta} right-2`}
            >
              <Seta direcao="direita" />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <ul ref={miniaturas} className="flex gap-2 overflow-x-auto pb-1">
          {midias.map((m, i) => (
            <li key={m.id} className="shrink-0">
              <button
                type="button"
                onClick={() => irPara(i)}
                aria-label={m.tipo === "foto" ? `Ver foto ${i + 1} de ${total}` : `Ver vídeo (${i + 1} de ${total})`}
                aria-current={i === atual}
                className={`relative block h-15 w-20 overflow-hidden rounded-lg border-2 bg-palco transition ${
                  i === atual ? "border-marca" : "border-transparent opacity-75 hover:opacity-100"
                }`}
              >
                <Image src={m.miniatura} alt="" fill className="object-cover" />
                {m.tipo === "video" && (
                  <span className="absolute inset-x-0 bottom-0 bg-palco/70 py-0.5 text-center text-xs font-semibold text-palco-texto">
                    ▶ {m.duracaoSeg ? duracao(m.duracaoSeg) : "Vídeo"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
