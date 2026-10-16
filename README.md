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

- API: `GET /saude`, `GET /lotes` (filtros por categoria, UF, raça, quantidade, preço e raio em km), `GET /lotes/:id`, `POST /lotes` (exige login e perfil completo; validação com mensagens em português; com `?rascunho=1` o lote nasce em rascunho, fora da busca) e `POST /lotes/:id/publicar` (só o vendedor; tira do rascunho e manda para análise, exigindo pelo menos uma foto quando o envio de fotos está ligado).
- Login pelo celular: `POST /auth/codigo` gera um código de 6 números (vale 10 minutos, até 5 pedidos por hora por telefone), `POST /auth/entrar` troca o código por uma sessão de 90 dias (5 tentativas erradas bloqueiam o código) e `POST /auth/sair` encerra a sessão. As rotas logadas usam `Authorization: Bearer <token>`.
- Perfil: `GET /eu` e `PATCH /eu` (nome, município e estado). Só quem tem o perfil completo pode anunciar.
- Envio do código: por enquanto só existe a versão de teste (`CODIGO_MODO=teste`, já configurada no Render), em que o código aparece na tela em vez de chegar por SMS. Nela qualquer pessoa entra com qualquer número, então não use dados reais.
- Fotos e vídeo no anúncio: até 10 fotos (até 10 MB cada) e 1 vídeo de até 1 minuto (até 100 MB) por lote; a primeira foto é a capa nos cartões da busca. O app manda o arquivo direto para o Cloudinary com uma autorização assinada pela API (o segredo da conta nunca sai da API), e a API confere no Cloudinary o tamanho e a duração reais antes de aceitar (vídeo sem duração conhecida é recusado). Rotas (só o vendedor do lote, também no rascunho): `POST /lotes/:id/midias/envio`, `POST /lotes/:id/midias`, `PATCH /lotes/:id/midias/ordem` e `DELETE /lotes/:id/midias/:midiaId`; `GET /midias/estado` (sem login) diz se o envio está ligado. `GET /lotes` traz a `capa` de cada lote e `GET /lotes/:id` traz também as `midias` em ordem.
- Banco: tabelas de usuários, sessões, códigos de login, lotes, mídias, propostas, pedidos, documentos (GTA, nota, atestado, ticket de balança) e avaliações.
- Site: página inicial, lista de lotes com filtros e página de cada lote.
- App: abas Buscar (lista com filtro por categoria), Anunciar (formulário validado) e Perfil, e tela de detalhe do lote.

## Fotos e vídeo: onde ficam os arquivos

A variável `MIDIA_ARMAZENAMENTO` escolhe o armazenamento (`cloudinary`, `local` ou `desligado`). Sem ela, a API usa o Cloudinary se houver as credenciais da conta (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET`, ou tudo numa só em `CLOUDINARY_URL`); no Render, sem elas, o envio fica desligado (o disco de lá é apagado a cada reinício) e o app mostra o aviso; no computador, usa a pasta local. Só parte das três variáveis, ou valor em formato errado, impede a API de subir, e o log diz qual falta.

**Desenvolvimento (local):** os arquivos ficam em `apps/api/uploads` (fora do git) e a própria API faz o papel do Cloudinary (`POST /midias/local` recebe o envio e `GET /arquivos/...` serve os arquivos). Para testar no celular, ponha em `API_URL_PUBLICA` o mesmo endereço do `EXPO_PUBLIC_API_URL` (o IP da sua máquina na rede), senão os links das fotos apontam para `localhost`. No modo local não há conversão: foto HEIC do iPhone não aparece no navegador, e a capa do vídeo é uma imagem fixa.

**Ligar o Cloudinary no Render (plano grátis):**

1. Crie uma conta em cloudinary.com. A conta pode usar "pastas dinâmicas" (o padrão das contas novas): cada lote fica na pasta `arroba/lotes/<id do lote>`.
2. No painel do Cloudinary, abra Settings > API Keys e copie o Cloud name, a API Key e o API Secret.
3. No painel do Render, abra o serviço `arroba-api` > Environment e preencha `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` (o `render.yaml` já cria as três, vazias). Salve: o Render publica de novo sozinho.
4. Confira no log da API a linha "Fotos e vídeo no Cloudinary (conta ...)". Se faltar uma das três ou o valor estiver errado, a API não sobe e o log diz o porquê.

No plano grátis do Cloudinary, foto vai até 10 MB e vídeo até 100 MB (os mesmos limites do app). As versões do vídeo para o app e o site são preparadas logo depois do envio e podem levar alguns minutos para ficar prontas.

## Próximos passos

1. Enviar o código de login por SMS/WhatsApp (`CODIGO_MODO=sms`), com limite de pedidos por IP antes de ligar, e verificação de documento.
2. Localização pelo GPS e rascunho offline. Nas fotos: moderação antes de publicar e limpeza dos arquivos que foram enviados mas nunca registrados e dos rascunhos abandonados (com as fotos deles).
3. Chat e propostas entre comprador e vendedor.
4. Pagamento protegido (Pix com custódia e split) via provedor de pagamento.
5. Checklist de GTA e documentos no pedido.
6. Painel interno de moderação.
