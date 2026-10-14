import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // As fotos já vêm prontas do Cloudinary (tamanho, qualidade e formato) e, no modo local da API,
  // vêm de localhost, que o otimizador do Next recusa. Otimizar de novo no servidor do site
  // (plano grátis do Render) só deixaria as fotos mais lentas.
  images: { unoptimized: true },
  turbopack: {
    // Raiz do monorepo, para o Turbopack achar os pacotes instalados lá.
    root: path.join(import.meta.dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
