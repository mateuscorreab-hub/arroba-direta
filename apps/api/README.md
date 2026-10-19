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

Negociação (`src/negociacao/`): conversa entre comprador e vendedor por lote, propostas com contraproposta, aceite e recusa. O aceite trava o lote (`SELECT ... FOR UPDATE`) e cria o pedido, que registra o negócio (o pagamento é direto entre comprador e vendedor); as outras propostas abertas do lote expiram. Toda transação da negociação trava na ordem lote, conversa, proposta, para não haver deadlock. A conversa traz o telefone da outra parte. O telefone do vendedor também sai em `GET /lotes/:id/contato`, que exige login e só responde para lote `ativo` (o próprio vendedor vê sempre); o `GET /lotes/:id`, público, não traz telefone. Número que não é celular válido (as contas de exemplo do seed usam DDD 20) não é mostrado: a conversa traz `telefone: null` e o contato responde 404.

Fotos e vídeo (`src/midias/`): o app pede uma autorização de envio (`POST /lotes/:id/midias/envio`), manda o arquivo direto para o armazenamento e registra a resposta (`POST /lotes/:id/midias`); a API confere a assinatura da resposta e os dados reais do arquivo antes de aceitar. `MIDIA_ARMAZENAMENTO` escolhe `cloudinary` (precisa de `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET`, ou de `CLOUDINARY_URL`), `local` (pasta `MIDIA_PASTA_LOCAL`, padrão `apps/api/uploads`; caminho relativo vale a partir de onde a API roda; links montados com `API_URL_PUBLICA`) ou `desligado`; valor inválido impede a API de subir. A autorização de envio vale 15 minutos para começar o envio; o registro confere só a assinatura da resposta, então um vídeo que termina de subir depois disso é aceito. Os testes do Cloudinary usam um servidor falso local (`CLOUDINARY_API_BASE`).

Anúncio com fotos antes de publicar: o app cria o lote com `POST /lotes?rascunho=1` (status `rascunho`, fora da busca; o parâmetro aceita `1` ou `true`), envia as fotos e o vídeo pelas rotas acima e chama `POST /lotes/:id/publicar`, que passa o lote para `em_analise`. Com o envio ligado, publicar exige pelo menos `MIN_FOTOS_PUBLICAR` fotos (em `packages/shared/src/midias.ts`; o vídeo não conta); com o envio desligado, publica sem foto. Lote que já saiu do rascunho volta como está (200), para o app poder repetir o pedido depois de perder a conexão. `GET /midias/estado` (sem login) diz se o envio está ligado: `{ ligado, mensagem }`.

Meus anúncios (`src/lotes/`): `GET /eu/lotes` traz os lotes de quem fez login, em qualquer situação, do mais novo para o mais antigo. As outras rotas são só do vendedor do lote (`VendedorDoLoteGuard`):

- `PUT /lotes/:id` troca os dados. O corpo é o anúncio inteiro, validado como no `POST /lotes`; o campo opcional que não vier fica em branco. Recusa (409) lote `negociando` ou `vendido`. Salvar sem mudar nada não altera o lote. Com `APROVACAO_LOTES=manual`, o lote `ativo` que muda volta para `em_analise`.
- `POST /lotes/:id/pausar`: de `ativo` ou `em_analise` para `encerrado` (o app chama de "Pausado").
- `POST /lotes/:id/reativar`: de `encerrado` volta a `ativo` (ou `em_analise` com revisão manual), exigindo foto como o publicar.
- `POST /lotes/:id/vendido`: de `ativo`, `em_analise`, `encerrado` ou `negociando` para `vendido`, que é o fim.

As três últimas devolvem o lote como está quando ele já está no destino (o app repete o pedido quando perde a conexão) e respondem 409 com o motivo nos outros casos (rascunho, negócio fechado, vendido). Todas travam o lote como o aceite de proposta. Quando o lote pausa, volta ao ar, é vendido ou tem o gado alterado (categoria, raça, sexo, quantidade, peso, idade ou local), a proposta em aberto expira e todas as conversas do lote recebem uma mensagem do sistema (`avisarMudancaNoLote`, em `src/negociacao/negociacao.service.ts`). O aviso leva o vendedor como `autorId`, para não contar como não lida para ele. Título, descrição e preço pedido não mexem nas propostas, a não ser com revisão manual, em que qualquer mudança no lote `ativo` tira ele da busca e expira a proposta.

Cada proposta guarda o peso médio do lote no momento em que foi feita (`propostas.peso_medio_kg`, migração `0005`), e o valor estimado usa esse peso, mesmo que o vendedor mude o peso do lote depois.

Lote `negociando` ou `vendido` também não aceita mudança nas fotos e no vídeo (409 nas rotas de mídia; o arquivo recusado é apagado do armazenamento).

`GET /lotes/regras` (sem login) diz se há revisão manual (`{ revisaoManual }`), para o app avisar antes de salvar.
