import type { Metadata } from "next";
import { POLITICA_DE_PRIVACIDADE } from "@arroba/shared";
import { DocumentoLegal } from "@/components/documento-legal";

export const metadata: Metadata = { title: POLITICA_DE_PRIVACIDADE.titulo };

export default function Privacidade() {
  return <DocumentoLegal documento={POLITICA_DE_PRIVACIDADE} />;
}
