-- AlterTable
ALTER TABLE "users" ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "banned_by_id" TEXT;
