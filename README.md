# Chat Platform

Next.js 웹, Expo 모바일, NestJS API를 함께 관리하는 pnpm 모노레포입니다. 원본 설계는 [docs/architecture.md](docs/architecture.md)에 보관했습니다.

핵심 제품 요구사항은 **이메일 초대를 수락하면 회원가입 없이 해당 채팅방에만 참여할 수 있는 것**입니다. **방 생성은 로그인한 회원, 초대 발송은 해당 방의 방장만 가능**합니다. 초대 생성·발송·재전송·취소와 방 전용 게스트 입장이 구현되어 있습니다. 상세 정책은 [docs/invitation-flow.md](docs/invitation-flow.md)에 정리했습니다.

현재 구현 범위는 **웹 회원 인증·구글 로그인, 방 생성·조회, 이메일 초대 관리와 회원가입 없는 게스트 입장**입니다. 구글 로그인과 실제 외부 이메일 발송에는 서비스 설정이 필요합니다. 로컬 초대 메일은 Mailpit에서 확인합니다. 메시지 송수신과 모바일 인증 화면 연결은 아직 구현 전입니다. Spring Boot/Vite 실행 명령은 더 이상 사용하지 않습니다.

## 구성

| 경로 | 기술과 책임 |
| --- | --- |
| apps/web | Next.js App Router, React, Tailwind CSS, TanStack Query |
| apps/mobile | Expo SDK 57, React Native, Expo Router, TanStack Query |
| apps/api | NestJS 단일 서버, 기능별 모듈, Socket.IO, Prisma |
| packages/contracts | Zod 요청·응답 검증 스키마, REST 경로, 소켓 이벤트 타입 |
| packages/utils | 플랫폼에 의존하지 않는 공통 함수 |
| packages/config | 공통 TypeScript 설정 |
| infra | 로컬 PostgreSQL·Mailpit, API Docker 이미지와 Compose |

웹과 모바일은 각각 components/ui → features → widgets → 페이지 구조를 사용합니다. UI는 플랫폼별로 구현하고 데이터 계약을 공유합니다. 서버의 auth/rooms에는 Controller → Service → Repository를 적용했고, users는 인증된 계정 조회를 제공합니다. messages는 모듈 경계만 등록되어 있습니다.

## 현재 구현된 것

- 웹 회원가입과 자동 로그인, 로그인·로그아웃, 새로고침 후 세션 복원.
- 구글 인가 코드 교환, 첫 로그인 시 회원 생성, 재로그인과 기존 회원 세션 사용. 외부 구글 연결은 앱 설정 후 별도 확인이 필요합니다.
- 로그인한 회원의 방 생성, 본인이 참여 중인 방 목록과 상세 조회. 생성자는 OWNER로 등록됩니다.
- 방장의 이메일 초대 발급·상태 조회·취소·재전송. 초대 링크는 48시간 동안 한 번만 수락할 수 있고 재전송 시 교체됩니다.
- SMTP 이메일 템플릿과 로컬 Mailpit 메일함. 방 이름·초대한 사람·참여 버튼을 포함하며 발송 실패와 재시도를 지원합니다.
- 초대 링크에서 표시 이름만 입력하는 게스트 입장, 해당 방으로 제한된 7일 세션과 새로고침 후 복원.
- 모바일 시작 화면과 로그인/대화 준비 화면의 라우트. 모바일 인증은 별도 구현 대상입니다.
- TanStack Query를 이용한 API·DB 연결 상태 조회와 재조회.
- Socket.IO 연결, system:ping 입력 검증과 ack, 화면 종료 시 연결 해제.
- 모바일 앱이 백그라운드로 가면 소켓을 끊고 복귀 시 다시 연결.
- Prisma 모델과 SQL 마이그레이션: users, chat_rooms, room_members, messages, member_sessions.
- 구글 계정 식별용 users.google_id와 10분 동안 유효한 일회용 로그인 요청 google_login_attempts.
- room_members의 독립 ID와 MEMBER/GUEST 구분. 게스트는 user_id 없이 초대 수락 시 생성합니다.
- 메시지는 같은 방의 참여자를 sender_member_id로 참조하며, 순서와 재전송 ID의 고유 제약을 유지합니다.

아직 구현되지 않은 것: 메시지 전송·내역 조회와 소켓 구독 권한 처리, 재접속 동기화, 읽음 처리, 파일 첨부와 푸시. 공유 계약에 경로와 타입이 있어도 해당 API가 구현된 것은 아닙니다. 현재 공개된 소켓 이벤트는 system:ping뿐입니다.

## 회원 인증과 참여 모델

- 신규 비밀번호는 8~15자이며 salt를 포함한 scrypt 해시로 저장합니다. 이전 정책으로 가입한 회원의 긴 비밀번호는 로그인 시 계속 허용합니다. 회원 세션은 7일 동안 유효하며 DB에는 토큰의 SHA-256 해시만 저장합니다.
- 웹은 HttpOnly·SameSite=Lax 쿠키를 사용하며 production에서는 Secure와 __Host- 접두사를 사용합니다. 운영 접속에는 HTTPS가 필요합니다.
- 이메일 가입·로그인, 구글 로그인 시작, 방 생성·로그아웃은 WEB_ORIGINS 검증을 거칩니다. 구글 콜백은 브라우저 쿠키와 일회용 state를 검증합니다. 방 생성·로그아웃에는 세션에 연결된 CSRF 헤더도 필요합니다. 회원 API 응답에는 Cache-Control: no-store를 적용합니다.
- 로그인·가입은 단일 API 프로세스에서 관측한 IP당 15분에 30회로 제한합니다. 여러 서버나 프록시를 운영할 때는 신뢰할 프록시 설정과 공유 제한 저장소를 별도로 구성해야 합니다.
- 가입 성공 시 자동 로그인합니다. 로그인 시 현재 브라우저의 이전 회원 세션을 폐기하고, 로그아웃 시 해당 세션을 즉시 삭제합니다. 자동 갱신·비밀번호 재설정·이메일 소유 확인은 이번 범위에 포함하지 않습니다.
- 새 방은 이름만 입력받아 GROUP으로 만들며, 로그인한 회원을 유일한 초기 참여자로 등록합니다. 임의의 다른 회원 ID나 소유자 ID를 지정할 수 없습니다. 기존 DIRECT 방 데이터는 보존합니다.
- 새 마이그레이션은 기존 회원·방·메시지를 보존하면서 작성자를 방 참여자로 연결합니다. 이미 퇴장한 과거 작성자는 left_at이 설정된 참여자로 보존하여 접근 권한이 되살아나지 않도록 합니다.
- 게스트 세션은 회원 세션과 별도 쿠키·테이블을 사용합니다. 방마다 쿠키를 구분하고 DB의 room_id·참여 상태·만료도 검사합니다. 회원 전용 API에는 사용할 수 없습니다.

## 처음 준비하기

Node.js 24와 pnpm 10.28.2를 사용합니다. DB까지 실행하려면 Docker Desktop 또는 로컬 PostgreSQL 17이 필요합니다. 아래 명령은 저장소 루트에서 실행합니다.

~~~sh
nvm install
nvm use
npm install -g pnpm@10.28.2
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
pnpm db:generate
~~~

환경 파일이 이미 있다면 덮어쓰지 말고 예시 파일과 비교하세요. 기본 API 연결 확인은 DB 없이도 가능하지만 DB 준비 상태는 DOWN으로 표시됩니다. 운영 환경에서는 DATABASE_URL을 반드시 지정해야 합니다. NEXT_PUBLIC_와 EXPO_PUBLIC_ 값은 클라이언트에 공개되므로 비밀값을 넣지 않습니다.

## 개발 서버 실행

~~~sh
pnpm db:up
pnpm mail:up
pnpm db:deploy
pnpm dev
~~~

pnpm dev는 웹(3000)과 API(4000)를 함께 실행합니다. 별도 터미널에서 실행하려면 pnpm dev:web, pnpm dev:api를 사용합니다. 초기 마이그레이션 적용은 pnpm db:deploy이며, 스키마를 수정해 새 마이그레이션을 만들 때는 pnpm db:migrate를 사용합니다.

| 대상 | 주소 |
| --- | --- |
| 웹 시작 화면 | http://localhost:3000/chats |
| 회원가입 | http://localhost:3000/sign-up |
| 로그인 | http://localhost:3000/login |
| 개발용 메일함 | http://localhost:8025 |
| API 생존 상태 | http://localhost:4000/api/v1/health |
| DB 준비 상태 | http://localhost:4000/api/v1/health/ready |
| Socket.IO | http://localhost:4000/chat (namespace) |

생존 상태는 API 프로세스의 동작을, 준비 상태는 DB 연결을 확인합니다. DB 연결 실패 시 readiness는 HTTP 503을 반환합니다. 웹의 REST 요청은 Next.js rewrite가 API로 전달하고 Socket.IO는 브라우저에서 API에 직접 연결합니다. 서버 주소를 바꾸면 apps/web/.env.local의 API_INTERNAL_URL과 NEXT_PUBLIC_SOCKET_URL도 맞춰 주세요.

공유 패키지는 실행 전에 빌드됩니다. contracts/utils를 수정한 경우 실행 중인 개발 서버를 종료하고 루트의 개발 명령을 다시 실행해 공유 패키지를 재빌드하세요.

## 구글 로그인 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들거나 선택하고 Google Auth Platform에서 앱 이름·지원 이메일 등 동의 화면 정보를 설정합니다.
2. OAuth 클라이언트를 '웹 애플리케이션' 유형으로 만들고, 승인된 리디렉션 URI를 정확히 `http://localhost:3000/api/v1/auth/google/callback`으로 등록합니다. 로컬 로그인도 localhost 주소에서 시작합니다.
3. 클라이언트 ID와 Client Secret을 확인합니다. 테스트 사용자 등록이 요구되는 설정에서는 사용할 구글 계정을 등록합니다. 이 구현은 `openid profile` 범위로 계정 ID와 이름만 사용하고 이메일은 수집하지 않습니다.
4. `apps/api/.env`에 아래 값을 설정합니다. 비밀값은 프론트엔드 환경변수나 Git에 넣지 않습니다.

~~~dotenv
GOOGLE_CLIENT_ID=발급받은_클라이언트_ID
GOOGLE_CLIENT_SECRET=발급받은_Client_Secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
~~~

새 마이그레이션은 `pnpm db:deploy`로 적용하고 `pnpm dev`를 다시 실행합니다. 위 세 설정을 함께 지정하면 로그인·가입 화면에 'Google로 로그인'이 표시됩니다. 설정이 없으면 기존 이메일 가입·로그인만 표시됩니다. 운영에서는 WEB_ORIGINS와 리디렉션 URI를 실제 HTTPS 웹 주소로 함께 바꾸고 Google Cloud에도 동일하게 등록합니다.

첫 구글 로그인은 비밀번호와 이메일 없이 회원을 생성합니다. 계정은 ID 토큰의 sub로 식별하고 기존 이메일 계정과 자동 합치지 않습니다. 이메일 가입과 구글 가입은 현재 별도 계정이며, 계정 연결은 후속 기능입니다. 구글 회원도 방을 만들 수 있습니다. 로그아웃은 이 서비스의 세션을 종료하며 구글 자체 로그인 상태는 유지됩니다.

공식 google-auth-library로 ID 토큰의 서명·발급자·수신자·만료를 확인하고 요청의 nonce도 비교합니다. 구글 토큰은 DB·브라우저에 저장하지 않습니다. 요청의 state 해시·PKCE 검증자·만료 시간을 DB에 저장하고 콜백에서 한 번만 소비합니다. 테스트는 구글 응답과 서명 키를 대체하여 인증·취소·실패·재사용·동시 로그인과 방 생성을 검증하며, 실제 구글 계정 로그인은 클라이언트 설정 후 확인해야 합니다.

개발 중 이미 적용한 카카오 마이그레이션은 이력으로 보존하고 다음 마이그레이션에서 구글 모델로 교체했습니다. 활성 코드·API·설정은 구글만 지원합니다. 이전 카카오 계정 데이터가 발견되면 공급자 ID를 잘못 옮기지 않도록 교체 마이그레이션이 중단됩니다.

설정과 API 기준: [Google OpenID Connect 공식 문서](https://developers.google.com/identity/openid-connect/openid-connect).
버튼 아이콘은 [Google 공식 브랜드 리소스](https://developers.google.com/identity/branding-guidelines)에서 제공한 SVG를 사용합니다.

## 이메일 초대와 게스트 입장

1. `pnpm mail:up`으로 개발용 Mailpit 메일함을 실행하고 `pnpm db:deploy`로 새 테이블을 적용합니다.
2. `pnpm dev`로 서버를 시작하고, 회원으로 로그인해 방을 만듭니다.
3. 방 상세의 '이메일로 초대하기'에서 이메일을 입력합니다. 로컬 모드는 외부 메일함으로 보내지 않고 [개발 메일함](http://localhost:8025)에 저장합니다.
4. 메일의 '채팅방 참여하기' 버튼을 누르면 `/invite#token=...` 화면으로 이동합니다. 다른 브라우저나 시크릿 창에서 열어 게스트 입장을 확인할 수 있습니다.
5. 표시 이름을 입력해 참여하면 `/guest/rooms/:roomId`로 이동합니다. 새로고침해도 같은 브라우저에서 7일 동안 복원됩니다. 현재 대화 화면에는 참여 상태를 표시하며 메시지 송수신은 후속 구현입니다.

로컬 개발은 `MAIL_MODE=local`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURE=false`를 사용합니다. 기존 `.env`에 메일 설정이 없으면 개발 서버는 이 기본값을 사용합니다. `pnpm mail:stop`은 메일함만 종료합니다. 로컬 메일은 컨테이너를 다시 만들면 사라질 수 있습니다.

실제 이메일 발송에는 SMTP 서비스를 연결합니다. `apps/api/.env`의 `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`을 서비스에서 받은 값으로 설정하고 API를 재시작합니다. 587 포트는 `SMTP_SECURE=false`로 STARTTLS를 요구하고, 465 포트는 `true`로 TLS 연결합니다. `MAIL_FROM`은 서비스에서 승인한 발신 주소를 사용합니다. `INVITE_WEB_ORIGIN`은 링크를 열 웹 주소이며 `WEB_ORIGINS`에도 있어야 합니다. 운영에서는 둘 다 실제 HTTPS 주소를 지정합니다. 비밀값은 Git과 프론트 환경변수에 넣지 않습니다.

SMTP 서버가 수신자를 접수하면 '메일 서버 접수 완료'로 표시합니다. 실제 수신·반송 여부를 추적하는 웹훅은 포함하지 않습니다. 실패해도 초대는 남으며 재전송하거나 새 링크를 직접 복사할 수 있습니다. 성공 후 재전송은 1분 후부터 가능하고, 실패 시에는 바로 재시도할 수 있습니다. 재전송은 이전 링크를 폐기하고 새 48시간 링크를 발급합니다. 이미 사용·취소된 초대는 재전송할 수 없습니다. 목록에는 최근 100건을 표시합니다.

초대 링크를 여는 것만으로 참여하지 않으며 명시적인 POST 수락에서 참여자·세션을 함께 생성합니다. 같은 초대의 수락·취소·재전송은 DB 행 잠금으로 조정합니다. 이미 참여한 같은 브라우저는 기존 세션으로 복귀하지만, 다른 기기·쿠키 삭제·세션 만료 후에는 새 초대가 필요합니다. 링크 소지자가 참여할 수 있으며 별도의 수신 이메일 소유 확인이나 기존 회원 계정 자동 연결은 하지 않습니다.

발송 구현 참고: [Nodemailer SMTP](https://nodemailer.com/smtp), [Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/).

## 모바일 실행

별도 터미널에서:

~~~sh
pnpm dev:mobile
~~~

Expo SDK 57에 맞는 Expo Go 또는 개발 빌드를 사용합니다. 설치된 Expo Go의 SDK 지원 버전이 다르면 SDK 57용 개발 빌드를 사용하세요. SDK 57의 React/React Native 버전은 Expo 공식 호환 목록에 맞췄습니다.

apps/mobile/.env의 EXPO_PUBLIC_API_URL을 실행 환경에 맞춥니다.

- iOS Simulator: http://localhost:4000
- Android Emulator: http://10.0.2.2:4000
- 실제 기기: http://Mac의-LAN-IP:4000 (같은 Wi-Fi)

실제 기기에서 localhost는 휴대폰 자신을 뜻합니다. API는 기본적으로 0.0.0.0에 바인딩되며, 환경 파일을 바꾼 후 Expo를 다시 시작해야 합니다. SecureStore 래퍼는 향후 인증 정보 저장을 위해 준비되어 있으며 현재 저장되는 토큰은 없습니다. Expo 웹 미리보기를 사용할 경우 해당 주소도 API의 WEB_ORIGINS에 추가하세요.

## 검사와 빌드

AGENTS.md에 따라 에이전트는 명시적인 허가를 받은 경우에만 아래 명령을 실행합니다. 린트/포맷터 자동 실행은 포함하지 않습니다.

~~~sh
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm mobile:export
~~~

- typecheck: 공유 패키지·웹·API·모바일 TypeScript 검사.
- test: HTTP/Socket.IO 기반 테스트, 비밀번호·CSRF·인증 요청 제한과 계약 검증. DB 연결 상태는 테스트 대역으로 대체합니다.
- test:integration: TEST_DATABASE_URL이 가리키는 PostgreSQL에 임시 스키마를 만들어 실제 마이그레이션과 회원·방 API를 검증하고, 끝나면 그 임시 스키마만 제거합니다.
- build: 공유 패키지와 API 컴파일, Next.js 프로덕션 빌드.
- mobile:export: 모바일과 Expo 웹 JS 번들 생성. 실제 iOS/Android 네이티브 빌드·기기 테스트는 별도입니다.

로컬 통합 테스트 예시: TEST_DATABASE_URL을 로컬 PostgreSQL 연결 문자열로 설정한 뒤 pnpm test:integration을 실행합니다. 기본 설정을 사용하는 경우 연결 문자열은 apps/api/.env.example을 참고하세요. 테스트는 기존 public 스키마를 변경하지 않습니다.

GitHub Actions는 깨끗한 PostgreSQL을 띄우고 마이그레이션, 타입 검사, 기본·DB 통합 테스트, 웹/API 빌드와 Expo 번들을 검사하도록 구성되어 있습니다. 의존성 잠금 파일을 포함해 변경사항을 커밋해야 CI가 재현됩니다.

## Docker와 배포

로컬 DB만 시작하려면 pnpm db:up을 사용합니다. API 컨테이너까지 확인하려면:

~~~sh
docker compose -f infra/compose.yml --profile app up --build -d
# 위 API 이미지가 빌드된 뒤 DB 스키마 적용
docker compose -f infra/compose.yml --profile app run --rm api pnpm --filter @chat/api db:deploy
~~~

Compose는 로컬 개발용입니다. 운영에서는 관리형 PostgreSQL, 실제 비밀값, HTTPS, 웹 호스팅과 Socket.IO 프록시, CORS 허용 도메인, 백업/보존 정책을 별도로 설정해야 합니다. Next.js의 API_INTERNAL_URL은 빌드 시 rewrite에 반영되므로 배포 주소를 빌드 전에 지정하세요.

pnpm db:down은 컨테이너를 종료하고 DB 볼륨은 유지합니다. 데이터 삭제를 원하지 않으면 docker compose down -v를 실행하지 마세요.

## 다음 기능 구현

1. 메시지: 회원·게스트의 참여 권한 확인, 트랜잭션 안에서 seq 할당·저장, 저장 후 ack.
2. 안정화: 동일 clientMessageId 재시도, messageId 중복 제거, afterSeq 누락분 동기화.
3. 모바일 인증·참여 화면을 연결하고, 필요에 따라 읽음·그룹·첨부·푸시 기능과 Redis를 도입합니다.

인증 구현 참고: [OWASP 비밀번호 저장](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP CSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

참고: [Expo 모노레포](https://docs.expo.dev/guides/monorepos/), [Prisma + NestJS](https://docs.nestjs.com/recipes/prisma), [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation).
