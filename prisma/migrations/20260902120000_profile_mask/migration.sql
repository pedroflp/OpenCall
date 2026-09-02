-- Máscara de perfil: apelido e foto próprios cobrindo o que vem do Discord.
-- Ver lib/profile/identity.ts (a regra) e docs/rfc-migracao-tdc.md §5.1.
ALTER TABLE "users" ADD COLUMN     "display_name" TEXT,
                    ADD COLUMN     "display_avatar" TEXT,
                    ADD COLUMN     "use_discord_profile" BOOLEAN NOT NULL DEFAULT true;
