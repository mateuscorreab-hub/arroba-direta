# @arroba/mobile

App do Arroba Direta (Expo + React Native + Expo Router), para Android e iOS.

```bash
pnpm dev   # abre o Expo; leia o QR code com o app Expo Go no celular
```

No celular, `localhost` não é a sua máquina: defina `EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:3333` no `.env`.
Login de teste: na aba Perfil, digite qualquer celular válido com DDD e toque em "Receber código". Com a API em modo de teste (`CODIGO_MODO=teste`, o padrão fora de produção) o código aparece na própria tela, sem SMS.

Para ver o app no navegador, sem celular: `pnpm web` (a versão web usa uma barra de abas simples, em `src/app/(abas)/_layout.web.tsx`).

Telas: `src/app/(abas)` (Buscar, Anunciar, Perfil) e `src/app/lote/[id].tsx` (detalhe do lote).
