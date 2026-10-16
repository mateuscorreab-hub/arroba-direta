# @arroba/mobile

App do Arroba Direta (Expo + React Native + Expo Router), para Android e iOS.

```bash
pnpm dev   # abre o Expo; leia o QR code com o app Expo Go no celular
```

No celular, `localhost` não é a sua máquina: defina `EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:3333` no `.env`.
Login de teste: na aba Perfil, digite qualquer celular válido com DDD e toque em "Receber código". Com a API em modo de teste (`CODIGO_MODO=teste`, o padrão fora de produção) o código aparece na própria tela, sem SMS.

Para ver o app no navegador, sem celular: `pnpm web` (a versão web usa uma barra de abas simples, em `src/app/(abas)/_layout.web.tsx`).

Telas: `src/app/(abas)` (Buscar, Anunciar, Perfil), `src/app/lote/[id]/index.tsx` (detalhe do lote, com a galeria) e `src/app/lote/[id]/midias.tsx` (fotos e vídeo do lote, só para o vendedor).

## Fotos e vídeo

O vendedor coloca até 10 fotos e 1 vídeo de até 1 minuto. O app pede uma autorização à API, envia o arquivo direto para o armazenamento (com barra de progresso, um arquivo de cada vez) e depois registra no lote. O código fica em `src/lib/escolher-midia.ts` (galeria e câmera), `src/lib/fila-envio.ts` (fila de envio) e `enviarArquivo` em `src/lib/api.ts`.

### Testar em modo local, sem Cloudinary

Sem as credenciais do Cloudinary, a API guarda os arquivos na própria máquina (modo `local`): o app envia para `POST /midias/local` e as fotos são servidas em `/arquivos/...`.

1. Suba a API normalmente (`pnpm dev` na raiz). Não defina `MIDIA_ARMAZENAMENTO` nem as variáveis `CLOUDINARY_*`.
2. Para testar no celular, use o IP da máquina nos dois lados, senão o celular tenta enviar para ele mesmo:
   - na API: `API_URL_PUBLICA=http://<ip-da-maquina>:3333` (é com ela que a API monta o endereço de envio e as URLs das fotos);
   - no app: `EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:3333`.
   No navegador (`pnpm web`) o `localhost` padrão já funciona.
3. Entre, publique um lote na aba Anunciar: o app abre a tela "Fotos e vídeo do lote". Para um lote que já existe, abra o lote e toque em "Fotos e vídeo do lote".
4. Escolha fotos ou um vídeo e acompanhe o envio. A primeira foto vira a capa nos cartões da busca; "Usar como capa" muda a ordem.

Observações:

- O expo-image-picker e o expo-video já vêm no Expo Go. Os textos de permissão em português (`app.json`) só aparecem num build próprio do app (`npx expo run:android` ou EAS).
- Enquanto envia, o app mantém a tela ligada (`expo-keep-awake`, que já vem com o Expo) e pergunta antes de sair da tela por qualquer caminho (Concluir, seta do topo, voltar do Android, gesto do iPhone ou, na web, fechar a aba).
- "Tirar foto" não aparece na web. Na web o navegador pode deixar escolher mais fotos do que cabem: o app usa só as primeiras e avisa.
- Com `MIDIA_ARMAZENAMENTO=desligado` (padrão no Render sem Cloudinary), a tela mostra a mensagem da API e não deixa escolher arquivos.
- No modo local, foto HEIC não aparece no Android nem no navegador. No iPhone o app já pede a foto em JPG.
