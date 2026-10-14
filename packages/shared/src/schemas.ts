import { z } from 'zod';
import { CATEGORIAS, SEXOS, UFS, UNIDADES_PRECO, VACINAS } from './dominio.js';

export const sanidadeSchema = z.object({
  vacinas: z.array(z.enum(VACINAS)).default([]),
  vermifugado: z.boolean().default(false),
  observacoes: z.string().max(1000).optional(),
});
export type Sanidade = z.infer<typeof sanidadeSchema>;

export const loteCriarSchema = z
  .object({
    titulo: z.string().min(5).max(120),
    categoria: z.enum(CATEGORIAS),
    raca: z.string().min(2).max(60),
    sexo: z.enum(SEXOS),
    quantidade: z.number().int().min(1).max(10000),
    idadeMediaMeses: z.number().int().min(0).max(240).optional(),
    pesoMedioKg: z.number().positive().max(1500).optional(),
    unidadePreco: z.enum(UNIDADES_PRECO),
    preco: z.number().positive().optional(),
    municipio: z.string().min(2).max(80),
    uf: z.enum(UFS),
    lat: z.number().min(-34).max(6),
    lng: z.number().min(-74).max(-28),
    disponivelEm: z.coerce.date().optional(),
    sanidade: sanidadeSchema.default({ vacinas: [], vermifugado: false }),
    descricao: z.string().max(4000).optional(),
  })
  .refine((l) => l.unidadePreco === 'a_combinar' || l.preco !== undefined, {
    message: 'informe o preço ou escolha "a combinar"',
    path: ['preco'],
  })
  .refine(
    (l) => !['kg', 'arroba'].includes(l.unidadePreco) || l.pesoMedioKg !== undefined,
    { message: 'peso médio é obrigatório para preço por kg ou arroba', path: ['pesoMedioKg'] },
  );
export type LoteCriar = z.infer<typeof loteCriarSchema>;

export const loteFiltroSchema = z.object({
  categoria: z.enum(CATEGORIAS).optional(),
  uf: z.enum(UFS).optional(),
  raca: z.string().optional(),
  quantidadeMin: z.coerce.number().int().positive().optional(),
  precoMax: z.coerce.number().positive().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  raioKm: z.coerce.number().positive().max(3000).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(20),
});
export type LoteFiltro = z.infer<typeof loteFiltroSchema>;

/** Formato público de um lote, como a API devolve. */
export interface Lote extends Omit<LoteCriar, 'disponivelEm'> {
  id: string;
  status: string;
  disponivelEm: string | null;
  criadoEm: string;
  distanciaKm?: number;
  vendedor: { id: string; nome: string; verificado: boolean; municipio: string; uf: string };
}

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

// Mensagens de validação em português em todo o sistema.
z.config(z.locales.pt());
