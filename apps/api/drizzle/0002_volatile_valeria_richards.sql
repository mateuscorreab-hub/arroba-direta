ALTER TABLE "midias" ADD COLUMN "public_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "midias" ADD COLUMN "versao" bigint;--> statement-breakpoint
ALTER TABLE "midias" ADD COLUMN "armazenamento" text NOT NULL;--> statement-breakpoint
ALTER TABLE "midias" ADD COLUMN "largura" integer;--> statement-breakpoint
ALTER TABLE "midias" ADD COLUMN "altura" integer;--> statement-breakpoint
ALTER TABLE "midias" ADD COLUMN "duracao_seg" double precision;--> statement-breakpoint
ALTER TABLE "midias" ADD COLUMN "bytes" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "midias" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "midias_lote_ordem_idx" ON "midias" USING btree ("lote_id","ordem");--> statement-breakpoint
ALTER TABLE "midias" ADD CONSTRAINT "midias_public_id_unique" UNIQUE("public_id");