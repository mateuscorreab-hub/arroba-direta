CREATE TYPE "public"."evento_acesso" AS ENUM('entrada', 'uso');--> statement-breakpoint
CREATE TABLE "registros_acesso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"sessao_id" uuid,
	"telefone" text NOT NULL,
	"evento" "evento_acesso" NOT NULL,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registros_acesso" ADD CONSTRAINT "registros_acesso_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_acesso" ADD CONSTRAINT "registros_acesso_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registros_acesso_telefone_idx" ON "registros_acesso" USING btree ("telefone","criado_em");--> statement-breakpoint
CREATE INDEX "registros_acesso_criado_idx" ON "registros_acesso" USING btree ("criado_em");