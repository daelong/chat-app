ALTER TABLE "chat_rooms" ADD COLUMN "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "chat_rooms" r SET "last_activity_at" = COALESCE((SELECT MAX(m.created_at) FROM "messages" m WHERE m.room_id = r.id), r.created_at);
CREATE UNIQUE INDEX "messages_room_id_id_key" ON "messages"("room_id", "id");
CREATE INDEX "chat_rooms_last_activity_at_idx" ON "chat_rooms"("last_activity_at" DESC);
CREATE INDEX "room_members_room_active_idx" ON "room_members"("room_id", "left_at");
CREATE TABLE "attachments" (
  "id" UUID NOT NULL PRIMARY KEY,
  "room_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "filename" VARCHAR(200) NOT NULL,
  "mime_type" VARCHAR(100) NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" > 0 AND "size" <= 10485760),
  "sha256" CHAR(64) NOT NULL,
  CONSTRAINT "attachments_message_fkey" FOREIGN KEY ("room_id", "message_id") REFERENCES "messages"("room_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "attachments_message_id_key" ON "attachments"("message_id");
CREATE UNIQUE INDEX "attachments_object_key_key" ON "attachments"("object_key");
