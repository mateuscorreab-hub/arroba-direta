# @arroba/api

API do Arroba Direta (NestJS + Drizzle + PostgreSQL).

```bash
pnpm dev            # http://localhost:3333
pnpm db:generate    # gera migration a partir de src/db/schema.ts
pnpm db:migrate     # aplica migrations
pnpm db:seed        # dados de exemplo
pnpm test:e2e       # testes contra o banco (rode migrate e seed antes)
```

O schema do banco fica em `src/db/schema.ts`. A busca por distância usa haversine em SQL; quando o volume crescer, migrar para PostGIS (a imagem do `docker-compose.yml` já tem a extensão).

Login (`src/auth/`): `POST /auth/codigo` gera o código e `POST /auth/entrar` o troca por um token, usado em `Authorization: Bearer <token>`. A variável `CODIGO_MODO` diz como o código chega ao usuário; hoje só existe `teste` (o código volta na resposta e o app mostra na tela). Sem ela a API usa `teste`, exceto com `NODE_ENV=production`, em que não sobe.

Anúncios: `APROVACAO_LOTES` diz se o lote criado em `POST /lotes` fica `em_analise` (`manual`, o padrão) ou já sai `ativo` (`automatica`, usado na versão de teste). Valor inválido impede a API de subir.

Negociação (`src/negociacao/`): conversa entre comprador e vendedor por lote, propostas com contraproposta, aceite e recusa. O aceite trava o lote (`SELECT ... FOR UPDATE`) e cria o pedido; as outras propostas abertas do lote expiram. Toda transação da negociação trava na ordem lote, conversa, proposta, para não haver deadlock. Antes do negócio fechar, telefones e e-mails nas mensagens viram "[contato oculto]" e o telefone da outra parte não é enviado.

Fotos e vídeo (`src/midias/`): o app pede uma autorização de envio (`POST /lotes/:id/midias/envio`), manda o arquivo direto para o armazenamento e registra a resposta (`POST /lotes/:id/midias`); a API confere a assinatura da resposta e os dados reais do arquivo antes de aceitar. `MIDIA_ARMAZENAMENTO` escolhe `cloudinary` (precisa de `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET`, ou de `CLOUDINARY_URL`), `local` (pasta `MIDIA_PASTA_LOCAL`, padrão `apps/api/uploads`; caminho relativo vale a partir de onde a API roda; links montados com `API_URL_PUBLICA`) ou `desligado`; valor inválido impede a API de subir. A autorização de envio vale 15 minutos para começar o envio; o registro confere só a assinatura da resposta, então um vídeo que termina de subir depois disso é aceito. Os testes do Cloudinary usam um servidor falso local (`CLOUDINARY_API_BASE`).

Anúncio com fotos antes de publicar: o app cria o lote com `POST /lotes?rascunho=1` (status `rascunho`, fora da busca; o parâmetro aceita `1` ou `true`), envia as fotos e o vídeo pelas rotas acima e chama `POST /lotes/:id/publicar`, que passa o lote para `em_analise`. Com o envio ligado, publicar exige pelo menos `MIN_FOTOS_PUBLICAR` fotos (em `packages/shared/src/midias.ts`; o vídeo não conta); com o envio desligado, publica sem foto. Lote que já saiu do rascunho volta como está (200), para o app poder repetir o pedido depois de perder a conexão. `GET /midias/estado` (sem login) diz se o envio está ligado: `{ ligado, mensagem }`.
