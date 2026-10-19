import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Arroba Direta", template: "%s | Arroba Direta" },
  description:
    "Compre e venda gado direto com outros pecuaristas, com documentação em dia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-borda">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 whitespace-nowrap px-4 py-4 sm:gap-6">
            <Link href="/" className="mr-auto text-lg font-bold text-marca sm:mr-0 sm:text-xl">
              Arroba Direta
            </Link>
            <Link href="/lotes" className="text-sm">
              Lotes à venda
            </Link>
            <Link href="/#como-funciona" className="text-sm">
              Como funciona
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-borda py-6 text-center text-sm text-suave">
          Arroba Direta · conectando pecuaristas do Brasil
        </footer>
      </body>
    </html>
  );
}
