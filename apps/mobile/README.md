# @arroba/mobile

App do Arroba Direta (Expo + React Native + Expo Router), para Android e iOS.

```bash
pnpm dev   # abre o Expo; leia o QR code com o app Expo Go no celular
```

No celular, `localhost` não é a sua máquina: defina `EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:3333` no `.env`.
Login de teste: na aba Perfil, digite qualquer celular válido com DDD e toque em "Receber código". Com a API em modo de teste (`CODIGO_MODO=teste`, o padrão fora de produção) o código aparece na própria tela, sem SMS.

Para ver o app no navegador, sem celular: `pnpm web` (a versão web usa uma barra de abas simples, em `src/app/(abas)/_layout.web.tsx`).

Telas: `src/app/(abas)` (Buscar, Anunciar, Conversas, Perfil), `src/app/lote/[id].tsx` (detalhe do lote, com os botões de negociação), `src/app/conversa/[id]/index.tsx` (conversa com mensagens e propostas) e `src/app/conversa/[id]/proposta.tsx` (formulário de proposta e contraproposta).

## Testar a negociação

São necessárias duas contas: a do vendedor e a do comprador. No navegador, use uma janela normal e outra anônima (cada uma guarda o próprio login).

1. Suba a API com `APROVACAO_LOTES=automatica`, para o lote anunciado já entrar na busca (por exemplo, `APROVACAO_LOTES=automatica pnpm --filter @arroba/api dev`). Com `manual`, o padrão, o lote fica em análise e não aceita conversa. A versão de teste no Render já usa `automatica`.
2. Na primeira janela, entre com um celular, complete o perfil e anuncie um lote na aba Anunciar.
3. Na outra janela, entre com outro celular, complete o perfil, abra o lote em Buscar e toque em "Conversar com o vendedor" ou "Fazer proposta".
4. Volte à primeira janela: a conversa aparece na aba Conversas, com a proposta para aceitar, recusar ou responder com contraproposta.

A conversa aberta se atualiza a cada 5 segundos, e a lista de conversas a cada 15 segundos. Telefones e e-mails escritos nas mensagens ficam ocultos até o negócio fechar; depois do aceite, cada lado vê o telefone do outro no topo da conversa.
