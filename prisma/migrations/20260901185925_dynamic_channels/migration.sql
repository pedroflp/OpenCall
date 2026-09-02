-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'CANAL_ACCESS', 'CHANNELS_ACCESS');

-- CreateEnum
CREATE TYPE "channel_type" AS ENUM ('VOICE', 'TEXT');

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "type" "channel_type" NOT NULL,
    "name" TEXT NOT NULL,
    "max_participants" INTEGER,
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "email" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "roles" "user_role"[] DEFAULT ARRAY[]::"user_role"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chat_blocked" BOOLEAN NOT NULL DEFAULT false,
    "is_mobile_downloaded" BOOLEAN NOT NULL DEFAULT false,
    "groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_active_at" TIMESTAMP(3),
    "channel_preferences" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text_color" TEXT NOT NULL,
    "sort_index" INTEGER NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "stream_settings" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_channel_alerts" (
    "channel_id" TEXT NOT NULL,
    "discord_message_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_channel_alerts_pkey" PRIMARY KEY ("channel_id")
);

-- CreateTable
CREATE TABLE "text_messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" VARCHAR(2000),
    "image_key" TEXT,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_bytes" INTEGER,
    "reply_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "text_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_message_mentions" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "text_message_mentions_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "text_channel_reads" (
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "last_read_message_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_channel_reads_pkey" PRIMARY KEY ("user_id","channel_id")
);

-- CreateTable
CREATE TABLE "server_metric_snapshots" (
    "id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "cpu_percent" DOUBLE PRECISION NOT NULL,
    "ram_used_mb" INTEGER NOT NULL,
    "ram_total_mb" INTEGER NOT NULL,
    "disk_used_gb" DOUBLE PRECISION NOT NULL,
    "disk_total_gb" DOUBLE PRECISION NOT NULL,
    "net_rx_bytes" BIGINT NOT NULL,
    "net_tx_bytes" BIGINT NOT NULL,

    CONSTRAINT "server_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_bandwidth_daily" (
    "date" DATE NOT NULL,
    "incoming_bytes" BIGINT NOT NULL,
    "outgoing_bytes" BIGINT NOT NULL,

    CONSTRAINT "server_bandwidth_daily_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "server_plan_info" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "plan_id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "vcpu_count" INTEGER NOT NULL,
    "ram_mb" INTEGER NOT NULL,
    "disk_gb" INTEGER NOT NULL,
    "bandwidth_quota_gb" INTEGER NOT NULL,
    "monthly_cost_usd" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_plan_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_type_sort_index_idx" ON "channels"("type", "sort_index");

-- CreateIndex
CREATE INDEX "text_messages_channel_id_created_at_id_idx" ON "text_messages"("channel_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "text_messages_reply_to_id_idx" ON "text_messages"("reply_to_id");

-- CreateIndex
CREATE INDEX "text_message_mentions_user_id_idx" ON "text_message_mentions"("user_id");

-- CreateIndex
CREATE INDEX "text_channel_reads_channel_id_idx" ON "text_channel_reads"("channel_id");

-- CreateIndex
CREATE INDEX "server_metric_snapshots_captured_at_idx" ON "server_metric_snapshots"("captured_at" DESC);

-- AddForeignKey
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "text_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_message_mentions" ADD CONSTRAINT "text_message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "text_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_message_mentions" ADD CONSTRAINT "text_message_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_channel_reads" ADD CONSTRAINT "text_channel_reads_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
