// No navegador o token fica no localStorage. Em aba anônima ou com o armazenamento bloqueado,
// guardamos só na memória: o login vale até fechar a página.
const CHAVE = 'arroba.token';
let naMemoria: string | null = null;

export async function lerTokenSalvo(): Promise<string | null> {
  try {
    return window.localStorage.getItem(CHAVE) ?? naMemoria;
  } catch {
    return naMemoria;
  }
}

export async function salvarToken(token: string): Promise<void> {
  naMemoria = token;
  try {
    window.localStorage.setItem(CHAVE, token);
  } catch {}
}

export async function apagarTokenSalvo(): Promise<void> {
  naMemoria = null;
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {}
}
