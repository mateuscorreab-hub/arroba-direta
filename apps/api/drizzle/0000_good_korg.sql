CREATE TYPE "public"."categoria" AS ENUM('bezerro', 'bezerra', 'garrote', 'novilha', 'boi_magro', 'boi_gordo', 'vaca', 'vaca_prenhe', 'touro');--> statement-breakpoint
CREATE TYPE "public"."sexo" AS ENUM('macho', 'femea', 'misto');--> statement-breakpoint
CREATE TYPE "public"."status_lote" AS ENUM('rascunho', 'em_analise', 'ativo', 'negociando', 'vendido', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."status_pedido" AS ENUM('aguardando_pagamento', 'pago', 'documentos_ok', 'embarcado', 'entregue', 'concluido', 'em_disputa', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."status_proposta" AS ENUM('enviada', 'contraproposta', 'aceita', 'recusada', 'expirada');--> statement-breakpoint
CREATE TYPE "public"."unidade_preco" AS ENUM('cabeca', 'kg', 'arroba', 'a_combinar');--> statement-breakpoint
CREATE TABLE "avaliacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"avaliado_id" uuid NOT NULL,
	"nota" integer NOT NULL,
	"comentario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"url" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"categoria" "categoria" NOT NULL,
	"raca" text NOT NULL,
	"sexo" "sexo" NOT NULL,
	"quantidade" integer NOT NULL,
	"idade_media_meses" integer,
	"peso_medio_kg" double precision,
	"unidade_preco" "unidade_preco" NOT NULL,
	"preco" numeric(12, 2),
	"municipio" text NOT NULL,
	"uf" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"disponivel_em" timestamp with time zone,
	"sanidade" jsonb NOT NULL,
	"descricao" text,
	"status" "status_lote" DEFAULT 'em_analise' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lote_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"url" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposta_id" uuid NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"valor_comissao" numeric(14, 2) NOT NULL,
	"status" "status_pedido" DEFAULT 'aguardando_pagamento' NOT NULL,
	"pagamento_externo_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_proposta_id_unique" UNIQUE("proposta_id")
);
--> statement-breakpoint
CREATE TABLE "propostas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lote_id" uuid NOT NULL,
	"comprador_id" uuid NOT NULL,
	"preco" numeric(12, 2) NOT NULL,
	"unidade_preco" "unidade_preco" NOT NULL,
	"quantidade" integer NOT NULL,
	"quebra_percentual" double precision DEFAULT 0 NOT NULL,
	"frete_por_conta" text NOT NULL,
	"data_embarque" timestamp with time zone NOT NULL,
	"mensagem" text,
	"status" "status_proposta" DEFAULT 'enviada' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telefone" text NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"inscricao_estadual" text,
	"verificado" boolean DEFAULT false NOT NULL,
	"municipio" text NOT NULL,
	"uf" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_telefone_unique" UNIQUE("telefone")
);
--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_avaliado_id_usuarios_id_fk" FOREIGN KEY ("avaliado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "midias" ADD CONSTRAINT "midias_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_proposta_id_propostas_id_fk" FOREIGN KEY ("proposta_id") REFERENCES "public"."propostas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_comprador_id_usuarios_id_fk" FOREIGN KEY ("comprador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lotes_busca_idx" ON "lotes" USING btree ("status","categoria","uf");