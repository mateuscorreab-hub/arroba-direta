ALTER TABLE "propostas" ADD COLUMN "peso_medio_kg" double precision;--> statement-breakpoint
-- Até aqui o lote não podia ser editado: o peso de hoje é o mesmo de quando cada proposta foi feita.
UPDATE "propostas" SET "peso_medio_kg" = "lotes"."peso_medio_kg" FROM "lotes" WHERE "propostas"."lote_id" = "lotes"."id";
