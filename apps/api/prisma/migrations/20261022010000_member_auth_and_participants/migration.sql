BEGIN;

CREATE TYPE "ParticipantKind" AS ENUM ('MEMBER', 'GUEST');
ALTER TABLE "room_members"
  ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "kind" "ParticipantKind" NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN "display_name" VARCHAR(50),
  ADD COLUMN "left_at" TIMESTAMPTZ(3);

UPDATE "room_members" AS member SET "display_name" = account."display_name"
FROM "users" AS account WHERE member."user_id" = account."id";

-- Preserve historical authors without restoring access for members who left.
INSERT INTO "room_members" ("room_id", "user_id", "display_name", "joined_at", "left_at")
SELECT message."room_id", account."id", account."display_name", MIN(message."created_at"), CURRENT_TIMESTAMP
FROM "messages" AS message
JOIN "users" AS account ON account."id" = message."sender_id"
LEFT JOIN "room_members" AS member ON member."room_id" = message."room_id" AND member."user_id" = account."id"
WHERE member."user_id" IS NULL
GROUP BY message."room_id", account."id", account."display_name";

ALTER TABLE "room_members" DROP CONSTRAINT "room_members_pkey";
ALTER TABLE "room_members"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ALTER COLUMN "display_name" SET NOT NULL,
  ALTER COLUMN "id" DROP DEFAULT,
  ADD CONSTRAINT "room_members_pkey" PRIMARY KEY ("id"),
  ADD CONSTRAINT "room_members_identity_check" CHECK (
    ("kind" = 'MEMBER' AND "user_id" IS NOT NULL) OR
    ("kind" = 'GUEST' AND "user_id" IS NULL AND "role" = 'MEMBER')
  ),
  ADD CONSTRAINT "room_members_display_name_nonempty" CHECK (length(trim("display_name")) > 0);
CREATE UNIQUE INDEX "room_members_room_id_user_id_key" ON "room_members"("room_id", "user_id");
CREATE UNIQUE INDEX "room_members_room_id_id_key" ON "room_members"("room_id", "id");

ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_fkey";
UPDATE "messages" AS message SET "sender_id" = member."id"
FROM "room_members" AS member
WHERE message."room_id" = member."room_id" AND message."sender_id" = member."user_id";
ALTER TABLE "messages" RENAME COLUMN "sender_id" TO "sender_member_id";
ALTER INDEX "messages_room_id_sender_id_client_message_id_key" RENAME TO "messages_room_sender_client_key";
ALTER INDEX "messages_sender_id_idx" RENAME TO "messages_sender_member_id_idx";
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_sender_member_id_fkey"
  FOREIGN KEY ("room_id", "sender_member_id") REFERENCES "room_members"("room_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "member_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "member_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "member_sessions_token_hash_key" ON "member_sessions"("token_hash");
CREATE INDEX "member_sessions_user_id_idx" ON "member_sessions"("user_id");
CREATE INDEX "member_sessions_expires_at_idx" ON "member_sessions"("expires_at");

COMMIT;
