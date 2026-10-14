import * as SecureStore from 'expo-secure-store';

// No celular, o token da sessão fica no armazenamento seguro do aparelho (Keychain/Keystore).
const CHAVE = 'arroba.token';

// Se o armazenamento falhar, o login vale só até fechar o app.
export async function lerTokenSalvo(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CHAVE);
  } catch {
    return null;
  }
}

export async function salvarToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CHAVE, token);
  } catch {}
}

export async function apagarTokenSalvo(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CHAVE);
  } catch {}
}
