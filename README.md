# Arroba Direta

Marketplace para pecuaristas do Brasil comprarem e venderem gado direto, com pagamento protegido e documentação em dia.
A estruturação do produto (MVP, fluxos, GTA, pagamento, roadmap) está no documento de estruturação do projeto.

## Estrutura

| Pasta | O que é | Tecnologia |
|---|---|---|
| `apps/mobile` | App Android e iOS | Expo, React Native, Expo Router |
| `apps/web` | Site público (vitrine de lotes, SEO) | Next.js, Tailwind |
| `apps/api` | API e banco de dados | NestJS, Drizzle ORM, PostgreSQL |
| `packages/shared` | Regras e tipos usados por todos (categorias, validação de anúncio, cálculo por arroba, comissão) | TypeScript, Zod |

## Como rodar

Pré-requisitos: Node 22+, pnpm 10 (`corepack enable`) e Docker (para o banco).

```bash
pnpm install
cp .env.example .env
pnpm db:up          # sobe o Postgres no Docker
pnpm build          # compila o pacote compartilhado
pnpm db:migrate     # cria as tabelas
pnpm db:seed        # cria lotes de exemplo
pnpm dev            # API em :3333, site em :3000 e Expo para o app
```

## Comandos

```bash
pnpm typecheck      # checagem de tipos em tudo
pnpm lint           # lint em tudo
pnpm test           # testes unitários
pnpm --filter @arroba/api test:e2e   # testes da API contra o banco
```

## O que já funciona

- API: `GET /saude`, `GET /lotes` (filtros por categoria, UF, raça, quantidade, preço e raio em km), `GET /lotes/:id`, `POST /lotes` (validação com mensagens em português).
- Banco: tabelas de usuários, lotes, mídias, propostas, pedidos, documentos (GTA, nota, atestado, ticket de balança) e avaliações.
- Site: página inicial, lista de lotes com filtros e página de cada lote.
- App: abas Buscar (lista com filtro por categoria), Anunciar (formulário validado) e Perfil, e tela de detalhe do lote.

## Próximos passos

1. Login por código no celular (SMS/WhatsApp) e verificação de documento.
2. Fotos e vídeo no anúncio, localização pelo GPS, rascunho offline.
3. Chat e propostas entre comprador e vendedor.
4. Pagamento protegido (Pix com custódia e split) via provedor de pagamento.
5. Checklist de GTA e documentos no pedido.
6. Painel interno de moderação.
