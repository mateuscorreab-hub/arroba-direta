import { describe, expect, it } from 'vitest';
import { entrarSchema, formatarTelefone, normalizarTelefone, perfilSchema } from './auth.js';

describe('normalizarTelefone', () => {
  it.each([
    ['(67) 99999-0001', '+5567999990001'],
    ['67999990001', '+5567999990001'],
    ['+55 67 99999 0001', '+5567999990001'],
    ['5567999990001', '+5567999990001'],
    ['067 99999-0001', '+5567999990001'],
    ['11 98888-7777', '+5511988887777'],
  ])('aceita %s', (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });

  it.each([
    ['fixo sem o 9', '(67) 3333-4444'],
    ['DDD inválido', '(01) 99999-0001'],
    ['DDD que não existe', '(20) 99999-0001'],
    ['outro DDD que não existe', '(23) 99999-0001'],
    ['curto demais', '9999-0001'],
    ['vazio', ''],
    ['celular sem o 9 inicial', '(67) 89999-0001'],
  ])('recusa %s', (_caso, entrada) => {
    expect(normalizarTelefone(entrada)).toBeNull();
  });
});

describe('formatarTelefone', () => {
  it('formata para exibir', () => {
    expect(formatarTelefone('+5567999990001')).toBe('(67) 99999-0001');
  });
});

describe('schemas de login', () => {
  it('normaliza o telefone ao entrar', () => {
    const r = entrarSchema.parse({ telefone: '(67) 99999-0001', codigo: '123456' });
    expect(r.telefone).toBe('+5567999990001');
  });

  it('recusa código com letras ou tamanho errado', () => {
    expect(entrarSchema.safeParse({ telefone: '67999990001', codigo: '12a456' }).success).toBe(false);
    expect(entrarSchema.safeParse({ telefone: '67999990001', codigo: '12345' }).success).toBe(false);
  });

  it('exige nome, município e UF no perfil', () => {
    expect(perfilSchema.safeParse({ nome: 'João da Silva', municipio: 'Campo Grande', uf: 'MS' }).success).toBe(true);
    expect(perfilSchema.safeParse({ nome: 'Jo', municipio: 'Campo Grande', uf: 'MS' }).success).toBe(false);
    expect(perfilSchema.safeParse({ nome: 'João', municipio: 'Campo Grande', uf: 'XX' }).success).toBe(false);
  });
});
