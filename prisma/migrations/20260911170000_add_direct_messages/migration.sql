-- Conversa 1:1 entre dois usuários (ver docs/rfc-mensagens-diretas.md),
-- portada do tdc: mesmas colunas de anexo de text_messages, sem @menção e
-- sem reação (fora do escopo do primeiro porte).

-- CreateTable
CREATE TABLE "direct_conversations" (
    "id" TEXT NOT NULL,
    "participant_a_id" TEXT NOT NULL,
    "participant_b_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3),

    CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" VARCHAR(2000),
    "attachment_kind" "attachment_kind",
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "attachment_mime" TEXT,
    "attachment_bytes" INTEGER,
    "attachment_width" INTEGER,
    "attachment_height" INTEGER,
    "attachment_duration_ms" INTEGER,
    "reply_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_conversation_reads" (
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "last_read_message_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "hidden_at" TIMESTAMP(3),

    CONSTRAINT "direct_conversation_reads_pkey" PRIMARY KEY ("user_id","conversation_id")
);

-- CreateIndex
CREATE INDEX "direct_conversations_participant_a_id_last_message_at_idx" ON "direct_conversations"("participant_a_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "direct_conversations_participant_b_id_last_message_at_idx" ON "direct_conversations"("participant_b_id", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "direct_conversations_participant_a_id_participant_b_id_key" ON "direct_conversations"("participant_a_id", "participant_b_id");

-- CreateIndex
CREATE INDEX "direct_messages_conversation_id_created_at_id_idx" ON "direct_messages"("conversation_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "direct_messages_reply_to_id_idx" ON "direct_messages"("reply_to_id");

-- CreateIndex
CREATE INDEX "direct_conversation_reads_conversation_id_idx" ON "direct_conversation_reads"("conversation_id");

-- AddForeignKey
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_participant_a_id_fkey" FOREIGN KEY ("participant_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_participant_b_id_fkey" FOREIGN KEY ("participant_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "direct_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_conversation_reads" ADD CONSTRAINT "direct_conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_conversation_reads" ADD CONSTRAINT "direct_conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
