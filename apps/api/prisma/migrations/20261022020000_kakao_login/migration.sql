BEGIN;

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "kakao_id" VARCHAR(30);
CREATE UNIQUE INDEX "users_kakao_id_key" ON "users"("kakao_id");
ALTER TABLE "users" ADD CONSTRAINT "users_login_identity_check"
  CHECK (("email" IS NOT NULL AND "password_hash" IS NOT NULL) OR "kakao_id" IS NOT NULL);

CREATE TABLE "kakao_login_attempts" (
  "token_hash" CHAR(64) PRIMARY KEY,
  "expires_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "kakao_login_attempts_expires_at_idx" ON "kakao_login_attempts"("expires_at");

COMMIT;
