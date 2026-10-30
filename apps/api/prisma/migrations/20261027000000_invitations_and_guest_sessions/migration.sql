CREATE TYPE "InvitationDeliveryStatus" AS ENUM ('SENDING', 'SENT', 'FAILED');
CREATE TYPE "InvitationDeliveryMode" AS ENUM ('LOCAL', 'SMTP', 'DISABLED');

CREATE TABLE "invitations" (
  "id" UUID NOT NULL,
  "room_id" UUID NOT NULL,
  "inviter_id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "accepted_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "accepted_member_id" UUID,
  "delivery_status" "InvitationDeliveryStatus" NOT NULL,
  "delivery_mode" "InvitationDeliveryMode" NOT NULL,
  "delivery_attempt_id" UUID NOT NULL,
  "last_attempt_at" TIMESTAMPTZ(3) NOT NULL,
  "delivery_error" VARCHAR(200),
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitations_room_id_accepted_member_id_fkey" FOREIGN KEY ("room_id", "accepted_member_id") REFERENCES "room_members"("room_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invitations_acceptance_check" CHECK (("accepted_at" IS NULL) = ("accepted_member_id" IS NULL)),
  CONSTRAINT "invitations_terminal_state_check" CHECK ("accepted_at" IS NULL OR "revoked_at" IS NULL)
);
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE UNIQUE INDEX "invitations_accepted_member_id_key" ON "invitations"("accepted_member_id");
CREATE UNIQUE INDEX "invitations_room_id_accepted_member_id_key" ON "invitations"("room_id", "accepted_member_id");
CREATE INDEX "invitations_room_id_created_at_idx" ON "invitations"("room_id", "created_at");
CREATE INDEX "invitations_inviter_id_last_attempt_at_idx" ON "invitations"("inviter_id", "last_attempt_at");

CREATE TABLE "guest_sessions" (
  "token_hash" CHAR(64) NOT NULL,
  "room_id" UUID NOT NULL,
  "member_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("token_hash"),
  CONSTRAINT "guest_sessions_room_id_member_id_fkey" FOREIGN KEY ("room_id", "member_id") REFERENCES "room_members"("room_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "guest_sessions_member_id_idx" ON "guest_sessions"("member_id");
CREATE INDEX "guest_sessions_expires_at_idx" ON "guest_sessions"("expires_at");
