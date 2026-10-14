/** Ocupa o lugar da foto quando o lote ainda não tem nenhuma. Preenche o elemento pai. */
export function SemFoto({ rotulo, texto }: { rotulo: string; texto?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-borda/60 p-3 text-center text-suave">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-7 w-7"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="m21 16-5-5-8 8" />
      </svg>
      <span className="font-semibold">{rotulo}</span>
      {texto && <span className="text-sm">{texto}</span>}
    </div>
  );
}
