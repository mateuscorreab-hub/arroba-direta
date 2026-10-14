/** Popula o banco local com dados de exemplo para desenvolvimento. */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://arroba:arroba@localhost:5432/arroba_direta',
});
const db = drizzle(pool, { schema });

const [joao, ana] = await db
  .insert(schema.usuarios)
  .values([
    { telefone: '+5567999990001', nome: 'João da Silva', verificado: true, municipio: 'Campo Grande', uf: 'MS' },
    { telefone: '+5565999990002', nome: 'Ana Souza', verificado: true, municipio: 'Rondonópolis', uf: 'MT' },
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
