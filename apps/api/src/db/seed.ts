/** Popula o banco local com dados de exemplo para desenvolvimento. */
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://arroba:arroba@localhost:5432/arroba_direta',
});
const db = drizzle(pool, { schema });

// DDD 20 não existe: ninguém consegue entrar pelo login nas contas verificadas de exemplo.
const TELEFONE_JOAO = '+5520999990001';
const TELEFONE_ANA = '+5520999990002';

// Bancos populados antes usavam telefones válidos: troca pelos novos para não duplicar contas e lotes.
// Depois da troca o telefone antigo é uma conta comum de quem entrar com ele, e não pode ser trocado de novo.
for (const [antigo, novo] of [
  ['+5567999990001', TELEFONE_JOAO],
  ['+5565999990002', TELEFONE_ANA],
]) {
  const [jaTrocado] = await db
    .select({ id: schema.usuarios.id })
    .from(schema.usuarios)
    .where(eq(schema.usuarios.telefone, novo));
  if (jaTrocado) continue;
  const [trocado] = await db
    .update(schema.usuarios)
    .set({ telefone: novo })
    .where(eq(schema.usuarios.telefone, antigo))
    .returning({ id: schema.usuarios.id });
  if (trocado) {
    await db
      .update(schema.sessoes)
      .set({ revogadaEm: new Date() })
      .where(and(eq(schema.sessoes.usuarioId, trocado.id), isNull(schema.sessoes.revogadaEm)));
  }
}

const [joao, ana] = await db
  .insert(schema.usuarios)
  .values([
    { telefone: TELEFONE_JOAO, nome: 'João da Silva', verificado: true, municipio: 'Campo Grande', uf: 'MS' },
    { telefone: TELEFONE_ANA, nome: 'Ana Souza', verificado: true, municipio: 'Rondonópolis', uf: 'MT' },
  ])
  .onConflictDoNothing()
  .returning();

if (joao && ana) {
  await db.insert(schema.lotes).values([
    {
      vendedorId: joao.id,
      titulo: '120 bezerros Nelore desmamados',
      categoria: 'bezerro',
      raca: 'Nelore',
      sexo: 'macho',
      quantidade: 120,
      idadeMediaMeses: 8,
      pesoMedioKg: 210,
      unidadePreco: 'cabeca',
      preco: 2600,
      municipio: 'Campo Grande',
      uf: 'MS',
      lat: -20.47,
      lng: -54.62,
      sanidade: { vacinas: ['raiva', 'clostridioses'], vermifugado: true },
      status: 'ativo',
    },
    {
      vendedorId: joao.id,
      titulo: '60 novilhas Angus x Nelore',
      categoria: 'novilha',
      raca: 'Angus x Nelore',
      sexo: 'femea',
      quantidade: 60,
      idadeMediaMeses: 18,
      pesoMedioKg: 330,
      unidadePreco: 'kg',
      preco: 13.5,
      municipio: 'Sidrolândia',
      uf: 'MS',
      lat: -20.93,
      lng: -54.96,
      sanidade: { vacinas: ['brucelose', 'raiva', 'clostridioses'], vermifugado: true },
      status: 'ativo',
    },
    {
      vendedorId: ana.id,
      titulo: '45 bois magros Nelore',
      categoria: 'boi_magro',
      raca: 'Nelore',
      sexo: 'macho',
      quantidade: 45,
      idadeMediaMeses: 24,
      pesoMedioKg: 390,
      unidadePreco: 'arroba',
      preco: 310,
      municipio: 'Rondonópolis',
      uf: 'MT',
      lat: -16.47,
      lng: -54.64,
      sanidade: { vacinas: ['raiva'], vermifugado: true },
      status: 'ativo',
    },
  ]);
}

await pool.end();
console.log('Seed concluído.');
