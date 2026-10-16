CREATE TYPE "public"."tipo_mensagem" AS ENUM('texto', 'proposta', 'sistema');--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lote_id" uuid NOT NULL,
	"comprador_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"lido_comprador_em" timestamp with time zone,
	"lido_vendedor_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversas_lote_comprador_unique" UNIQUE("lote_id","comprador_id")
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"autor_id" uuid,
	"tipo" "tipo_mensagem" NOT NULL,
	"texto" text,
	"proposta_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "propostas" ALTER COLUMN "data_embarque" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "conversa_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "autor_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "expira_em" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "respondida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_comprador_id_usuarios_id_fk" FOREIGN KEY ("comprador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_proposta_id_propostas_id_fk" FOREIGN KEY ("proposta_id") REFERENCES "public"."propostas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversas_comprador_idx" ON "conversas" USING btree ("comprador_id","atualizado_em");--> statement-breakpoint
CREATE INDEX "conversas_vendedor_idx" ON "conversas" USING btree ("vendedor_id","atualizado_em");--> statement-breakpoint
CREATE INDEX "mensagens_conversa_idx" ON "mensagens" USING btree ("conversa_id","criado_em");--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "propostas_aberta_por_conversa_idx" ON "propostas" USING btree ("conversa_id") WHERE "propostas"."status" = 'enviada';--> statement-breakpoint
CREATE INDEX "propostas_lote_status_idx" ON "propostas" USING btree ("lote_id","status");