import { z } from 'zod';
import { UFS } from './dominio.js';

/** DDDs em uso no Brasil (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Normaliza um celular brasileiro para o formato E.164 (+55DD9XXXXXXXX).
 * Aceita espaços, parênteses, hífens, o prefixo +55/55 e um zero antes do DDD.
 * Devolve null se não for um celular válido (DDD existente e 9 dígitos começando com 9).
 */
export function normalizarTelefone(entrada: string): string | null {
  let d = entrada.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  else if (d.length === 12 && d.startsWith('0')) d = d.slice(1);
  if (d.length !== 11) return null;
  if (!DDDS.has(Number(d.slice(0, 2))) || d[2] !== '9') return null;
  return `+55${d}`;
}

/** Formata +5567999990001 como (67) 99999-0001 para exibir. */
export function formatarTelefone(e164: string): string {
  const d = e164.replace(/^\+55/, '');
  if (d.length !== 11) return e164;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const telefoneSchema = z
  .string()
  .transform((v, ctx) => {
    const n = normalizarTelefone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Informe um celular com DDD, por exemplo (67) 99999-0001' });
      return z.NEVER;
    }
    return n;
  });

export const solicitarCodigoSchema = z.object({ telefone: telefoneSchema });
export type SolicitarCodigo = z.infer<typeof solicitarCodigoSchema>;

export const CODIGO_DIGITOS = 6;

export const entrarSchema = z.object({
  telefone: telefoneSchema,
  codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 números'),
});
export type Entrar = z.infer<typeof entrarSchema>;

export const perfilSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo').max(80),
  municipio: z.string().trim().min(2, 'Informe o município').max(80),
  uf: z.enum(UFS, { message: 'Escolha o estado' }),
});
export type Perfil = z.infer<typeof perfilSchema>;

/** O usuário logado, como a API devolve em GET /eu. */
export interface Eu {
  id: string;
  telefone: string;
  nome: string | null;
  municipio: string | null;
  uf: string | null;
  verificado: boolean;
  /** Nome, município e UF preenchidos: pode anunciar. */
  perfilCompleto: boolean;
}

export interface RespostaSolicitarCodigo {
  /** Quando o código expira (ISO 8601). */
  expiraEm: string;
  /**
   * Só na versão de teste, sem SMS: o próprio código, para mostrar na tela.
   * Nunca vem preenchido quando o envio é por SMS/WhatsApp.
   */
  codigoTeste?: string;
}

export interface RespostaEntrar {
  token: string;
  usuario: Eu;
}
