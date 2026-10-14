# @arroba/mobile

App do Arroba Direta (Expo + React Native + Expo Router), para Android e iOS.

```bash
pnpm dev   # abre o Expo; leia o QR code com o app Expo Go no celular
```

No celular, `localhost` não é a sua máquina: defina `EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:3333` no `.env`.
Enquanto o login não existe, defina `EXPO_PUBLIC_DEV_USUARIO_ID` com o id de um usuário do seed para conseguir anunciar.

Telas: `src/app/(abas)` (Buscar, Anunciar, Perfil) e `src/app/lote/[id].tsx` (detalhe do lote).
