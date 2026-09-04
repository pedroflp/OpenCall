-- Anexo de qualquer arquivo no chat (ver docs/rfc-anexos-de-arquivo.md e
-- ADR-0012): as quatro colunas de imagem viram as colunas genéricas de anexo.
--
-- RENAME, não colunas novas: renomear é mudança só de catálogo (instantânea, o
-- Postgres não reescreve a tabela) e deixa UMA representação do anexo, em vez
-- de duas que toda leitura teria que reconciliar.

CREATE TYPE "attachment_kind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'FILE');

ALTER TABLE "text_messages" RENAME COLUMN "image_key" TO "attachment_key";
ALTER TABLE "text_messages" RENAME COLUMN "image_width" TO "attachment_width";
ALTER TABLE "text_messages" RENAME COLUMN "image_height" TO "attachment_height";
ALTER TABLE "text_messages" RENAME COLUMN "image_bytes" TO "attachment_bytes";

ALTER TABLE "text_messages" ADD COLUMN "attachment_kind" "attachment_kind",
                            ADD COLUMN "attachment_mime" TEXT,
                            ADD COLUMN "attachment_name" TEXT,
                            ADD COLUMN "attachment_duration_ms" INTEGER;

-- Todo anexo que existe hoje é imagem, e o mime sai da extensão da chave (a
-- rota de upload sempre gravou a extensão a partir do Content-Type farejado dos
-- bytes, então ela é confiável). `attachment_name` fica nulo de propósito: o
-- nome original nunca esteve no Postgres, só na metadata do objeto no R2 — a UI
-- cai no nome derivado da chave.
UPDATE "text_messages"
SET "attachment_kind" = 'IMAGE',
    "attachment_mime" = CASE
      WHEN "attachment_key" LIKE '%.png'  THEN 'image/png'
      WHEN "attachment_key" LIKE '%.jpg'  THEN 'image/jpeg'
      WHEN "attachment_key" LIKE '%.webp' THEN 'image/webp'
      WHEN "attachment_key" LIKE '%.gif'  THEN 'image/gif'
      ELSE 'application/octet-stream'
    END
WHERE "attachment_key" IS NOT NULL;
