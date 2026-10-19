# @arroba/mobile

App do Arroba Direta (Expo + React Native + Expo Router), para Android e iOS.

```bash
pnpm dev   # abre o Expo; leia o QR code com o app Expo Go no celular
```

No celular, `localhost` não é a sua máquina: defina `EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:3333` no `.env`.
Login de teste: na aba Perfil, digite qualquer celular válido com DDD e toque em "Receber código". Com a API em modo de teste (`CODIGO_MODO=teste`, o padrão fora de produção) o código aparece na própria tela, sem SMS.

Para ver o app no navegador, sem celular: `pnpm web` (a versão web usa uma barra de abas simples, em `src/app/(abas)/_layout.web.tsx`).

Telas: `src/app/(abas)` (Buscar, Anunciar, Conversas, Perfil), `src/app/lote/[id]/index.tsx` (detalhe do lote, com a galeria e os botões de negociação), `src/app/lote/[id]/midias.tsx` (para mudar as fotos e o vídeo depois de publicar, só para o vendedor), `src/app/conversa/[id]/index.tsx` (conversa com mensagens e propostas) e `src/app/conversa/[id]/proposta.tsx` (formulário de proposta e contraproposta).

## Testar a negociação

São necessárias duas contas: a do vendedor e a do comprador. No navegador, use uma janela normal e outra anônima (cada uma guarda o próprio login).

1. Suba a API com `APROVACAO_LOTES=automatica`, para o lote anunciado já entrar na busca (por exemplo, `APROVACAO_LOTES=automatica pnpm --filter @arroba/api dev`). Com `manual`, o padrão, o lote fica em análise e não aceita conversa. A versão de teste no Render já usa `automatica`.
2. Na primeira janela, entre com um celular, complete o perfil e anuncie um lote na aba Anunciar (com pelo menos uma foto).
3. Na outra janela, entre com outro celular, complete o perfil, abra o lote em Buscar e toque em "Conversar pelo app" ou "Fazer proposta". O telefone do vendedor e o botão "Chamar no WhatsApp" aparecem logo acima.
4. Volte à primeira janela: a conversa aparece na aba Conversas, com a proposta para aceitar, recusar ou responder com contraproposta.

A conversa aberta se atualiza a cada 5 segundos, e a lista de conversas a cada 15 segundos. O topo da conversa mostra o telefone da outra parte e o link "Chamar no WhatsApp". Na tela do lote, só quem fez login vê o telefone do vendedor (`GET /lotes/:id/contato`).

## Fotos e vídeo

O vendedor coloca até 10 fotos e 1 vídeo de até 1 minuto. O app pede uma autorização à API, envia o arquivo direto para o armazenamento (com barra de progresso, um arquivo de cada vez) e depois registra no lote. O código fica em `src/lib/escolher-midia.ts` (galeria e câmera), `src/lib/fila-envio.ts` (fila de envio) e `enviarArquivo` em `src/lib/api.ts`. As peças de tela usadas no Anunciar e na tela de edição ficam em `src/componentes` (`botoes-escolha`, `linha-envio`, `cartao-arquivo`, `aviso-permissao`, `manter-tela-ligada`, `dica-fotos`) e `src/hooks/use-escolha-midia.ts`.

As fotos entram no próprio formulário de Anunciar, antes de publicar:

1. Ao abrir, o app consulta `GET /midias/estado`. Com o envio ligado, o anúncio precisa de pelo menos uma foto (`MIN_FOTOS_PUBLICAR`, em `packages/shared/src/midias.ts`; mude lá para 0 se quiser deixar a foto opcional). O vídeo é opcional. Com o envio desligado, o formulário mostra a mensagem da API e publica sem foto.
2. A pessoa escolhe as fotos e o vídeo; eles aparecem numa grade. A primeira foto é a capa ("Usar como capa" troca); "Tirar" tira da lista. Arquivo fora do limite aparece com o problema e não vai.
3. Ao tocar "Publicar anúncio", o app cria o lote em rascunho (`POST /lotes?rascunho=1`, fora da busca), envia os arquivos na ordem da grade e chama `POST /lotes/:id/publicar`, que manda o lote para a revisão. Durante o envio os campos ficam travados, a tela fica ligada e a aba Anunciar pode ficar em segundo plano (troca de aba não para o envio).
4. Se algum arquivo falhar por conexão, os outros continuam e o botão vira "Tentar enviar de novo": um toque manda de novo todos os que falharam e já publica. Arquivo recusado (com defeito ou fora do limite) precisa ser removido; com o rascunho criado, a pessoa ainda pode escolher outros arquivos, que vão para o mesmo lote. Os campos ficam travados (não há rota para editar o lote) e o formulário explica isso. Falha de rede ao criar ou publicar repete só o passo que faltou.
5. Se o envio foi ligado na API depois que a aba abriu (o formulário achava que estava desligado), o 400 do `POST /lotes/:id/publicar` traz de volta os botões de foto.
6. Depois de publicar, o app abre a página do lote, que mostra ao vendedor que o anúncio está em revisão (ele só aparece na busca depois).

Depois de publicado, o vendedor muda as fotos pela página do lote, no botão "Fotos e vídeo do lote".

### Testar em modo local, sem Cloudinary

Sem as credenciais do Cloudinary, a API guarda os arquivos na própria máquina (modo `local`): o app envia para `POST /midias/local` e as fotos são servidas em `/arquivos/...`.

1. Suba a API normalmente (`pnpm dev` na raiz). Não defina `MIDIA_ARMAZENAMENTO` nem as variáveis `CLOUDINARY_*`.
2. Para testar no celular, use o IP da máquina nos dois lados, senão o celular tenta enviar para ele mesmo:
   - na API: `API_URL_PUBLICA=http://<ip-da-maquina>:3333` (é com ela que a API monta o endereço de envio e as URLs das fotos);
   - no app: `EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:3333`.
   No navegador (`pnpm web`) o `localhost` padrão já funciona.
3. Entre e, na aba Anunciar, preencha o lote, escolha fotos (e, se quiser, um vídeo) e toque em "Publicar anúncio". O botão mostra "Enviando fotos… (1 de 3)" e cada arquivo tem sua barra de progresso; no fim o app abre a página do lote. Para um lote que já existe, abra o lote e toque em "Fotos e vídeo do lote".
4. A primeira foto vira a capa nos cartões da busca; "Usar como capa" muda a ordem (no formulário, antes de enviar; na tela "Fotos e vídeo do lote", depois).
5. Para ver o caminho de erro, desligue a API (ou a internet) no meio do envio: os arquivos que falharam mostram "Tentar de novo" e "Remover", o botão principal vira "Tentar enviar de novo" e o anúncio continua em rascunho até todos subirem.

Observações:

- O expo-image-picker e o expo-video já vêm no Expo Go. Os textos de permissão em português (`app.json`) só aparecem num build próprio do app (`npx expo run:android` ou EAS).
- Enquanto envia, o app mantém a tela ligada (`expo-keep-awake`, que já vem com o Expo). Na tela "Fotos e vídeo do lote" ele pergunta antes de sair por qualquer caminho (Concluir, seta do topo, voltar do Android, gesto do iPhone ou, na web, fechar a aba); no Anunciar, na web, pergunta antes de fechar a aba com o anúncio pela metade.
- "Tirar foto" não aparece na web. Na web o navegador pode deixar escolher mais fotos do que cabem: o app usa só as primeiras e avisa.
- Com `MIDIA_ARMAZENAMENTO=desligado` (padrão no Render sem Cloudinary), o Anunciar mostra a mensagem da API e publica sem foto, e a tela "Fotos e vídeo do lote" não deixa escolher arquivos.
- No modo local, foto HEIC não aparece no Android nem no navegador. No iPhone o app já pede a foto em JPG.
