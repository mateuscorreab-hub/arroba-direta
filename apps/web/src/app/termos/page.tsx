import type { Metadata } from "next";
import { TERMOS_DE_USO } from "@arroba/shared";
import { DocumentoLegal } from "@/components/documento-legal";

export const metadata: Metadata = { title: TERMOS_DE_USO.titulo };

export default function Termos() {
  return <DocumentoLegal documento={TERMOS_DE_USO} />;
}
