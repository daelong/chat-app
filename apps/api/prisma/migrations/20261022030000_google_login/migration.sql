BEGIN;

-- 이미 적용된 마이그레이션 이력은 유지합니다. 공급자가 다른 ID를 구글 ID로 옮기지 않습니다.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "kakao_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Existing Kakao accounts require an explicit account migration before removing Kakao login';
  END IF;
END $$;

ALTER TABLE "users" DROP CONSTRAINT "users_login_identity_check";
ALTER TABLE "users" DROP COLUMN "kakao_id";
ALTER TABLE "users" ADD COLUMN "google_id" VARCHAR(255);
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
ALTER TABLE "users" ADD CONSTRAINT "users_login_identity_check"
  CHECK (("email" IS NOT NULL AND "password_hash" IS NOT NULL) OR "google_id" IS NOT NULL);

DROP TABLE "kakao_login_attempts";
CREATE TABLE "google_login_attempts" (
  "token_hash" CHAR(64) PRIMARY KEY,
  "code_verifier" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "google_login_attempts_expires_at_idx" ON "google_login_attempts"("expires_at");

COMMIT;
