ALTER TABLE "codigos_login" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "codigos_login" ADD COLUMN "por_sms" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "codigos_login_ip_idx" ON "codigos_login" USING btree ("ip","criado_em");--> statement-breakpoint
CREATE INDEX "codigos_login_sms_idx" ON "codigos_login" USING btree ("criado_em") WHERE "codigos_login"."por_sms";