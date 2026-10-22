CREATE TYPE "RoomType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" VARCHAR(50) NOT NULL,
  "avatar_url" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "chat_rooms" (
  "id" UUID NOT NULL,
  "type" "RoomType" NOT NULL,
  "name" VARCHAR(100),
  "direct_key" TEXT,
  "last_seq" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_rooms_last_seq_nonnegative" CHECK ("last_seq" >= 0),
  CONSTRAINT "chat_rooms_direct_key_type" CHECK (
    ("type" = 'DIRECT' AND "direct_key" IS NOT NULL) OR
    ("type" = 'GROUP' AND "direct_key" IS NULL)
  )
);
CREATE TABLE "room_members" (
  "room_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
  "last_read_seq" BIGINT NOT NULL DEFAULT 0,
  "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "room_members_pkey" PRIMARY KEY ("room_id", "user_id"),
  CONSTRAINT "room_members_last_read_seq_nonnegative" CHECK ("last_read_seq" >= 0)
);
CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "client_message_id" UUID NOT NULL,
  "seq" BIGINT NOT NULL,
  "body" VARCHAR(4000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_seq_positive" CHECK ("seq" > 0),
  CONSTRAINT "messages_body_nonempty" CHECK (length(trim("body")) > 0)
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "chat_rooms_direct_key_key" ON "chat_rooms"("direct_key");
CREATE INDEX "room_members_user_id_idx" ON "room_members"("user_id");
CREATE UNIQUE INDEX "messages_room_id_seq_key" ON "messages"("room_id", "seq");
CREATE UNIQUE INDEX "messages_room_id_sender_id_client_message_id_key" ON "messages"("room_id", "sender_id", "client_message_id");
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
