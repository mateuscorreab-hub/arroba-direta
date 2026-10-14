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
