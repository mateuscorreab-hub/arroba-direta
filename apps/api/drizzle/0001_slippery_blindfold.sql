CREATE TABLE "codigos_login" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telefone" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"revogada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessoes_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "nome" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "municipio" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "uf" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_login_telefone_idx" ON "codigos_login" USING btree ("telefone","criado_em");