# Chat Platform

Next.js 웹, Expo 모바일, NestJS API를 함께 관리하는 pnpm 모노레포입니다. 원본 설계는 [docs/architecture.md](docs/architecture.md)에 보관했습니다.

프로젝트를 다시 실행하려면 [프로젝트 실행·종료 안내서](docs/local-development.md)를 참고하세요. Docker 경로·Node.js 버전 설정, DB·메일함 실행, 웹/API 시작, DBeaver·Prisma Studio 연결과 오류 해결을 정리했습니다.

핵심 제품 요구사항은 **이메일 초대를 수락하면 회원가입 없이 해당 채팅방에만 참여할 수 있는 것**입니다. **방 생성은 로그인한 회원, 초대 발송은 해당 방의 방장만 가능**합니다. 초대 생성·발송·재전송·취소와 방 전용 게스트 입장이 구현되어 있습니다. 상세 정책은 [docs/invitation-flow.md](docs/invitation-flow.md)에 정리했습니다.

현재 구현 범위는 **웹 회원 인증·구글 로그인, 방 생성·조회, 이메일 초대·게스트 입장, 실시간 채팅, 참여자 관리, 읽음·안 읽은 개수, 파일 전송과 대화 검색**입니다. 구글 로그인과 실제 외부 이메일 발송에는 서비스 설정이 필요합니다. 로컬 초대 메일은 Mailpit, 파일 저장소는 RustFS를 사용합니다. 모바일 인증·대화 화면 연결은 아직 구현 전입니다. Spring Boot/Vite 실행 명령은 더 이상 사용하지 않습니다.

## 구성

| 경로 | 기술과 책임 |
| --- | --- |
| apps/web | Next.js App Router, React, Tailwind CSS, TanStack Query |
| apps/mobile | Expo SDK 57, React Native, Expo Router, TanStack Query |
| apps/api | NestJS 단일 서버, 기능별 모듈, Socket.IO, Prisma |
| packages/contracts | Zod 요청·응답 검증 스키마, REST 경로, 소켓 이벤트 타입 |
| packages/utils | 플랫폼에 의존하지 않는 공통 함수 |
| packages/config | 공통 TypeScript 설정 |
| infra | 로컬 PostgreSQL·Mailpit·RustFS, API Docker 이미지와 Compose |

웹과 모바일은 각각 components/ui → features → widgets → 페이지 구조를 사용합니다. UI는 플랫폼별로 구현하고 데이터 계약을 공유합니다. 서버는 기능별 Controller·Service·Repository를 사용하며, messages는 채팅 권한·저장·실시간 이벤트, attachments는 파일 검증·비공개 저장소 접근을 담당합니다.

## 현재 구현된 것

- 웹 회원가입과 자동 로그인, 로그인·로그아웃, 새로고침 후 세션 복원.
- 구글 인가 코드 교환, 첫 로그인 시 회원 생성, 재로그인과 기존 회원 세션 사용. 외부 구글 연결은 앱 설정 후 별도 확인이 필요합니다.
- 로그인한 회원의 방 생성, 본인이 참여 중인 방 목록과 상세 조회. 생성자는 OWNER로 등록됩니다.
- 방장의 이메일 초대 발급·상태 조회·취소·재전송. 초대 링크는 48시간 동안 한 번만 수락할 수 있고 재전송 시 교체됩니다.
- SMTP 이메일 템플릿과 로컬 Mailpit 메일함. 방 이름·초대한 사람·참여 버튼을 포함하며 발송 실패와 재시도를 지원합니다.
- 초대 링크에서 표시 이름만 입력하는 게스트 입장, 해당 방으로 제한된 7일 세션과 새로고침 후 복원.
- 회원·게스트의 메시지 작성·저장·이전 내역 조회와 실시간 송수신. 작성자 표시·시간·줄바꿈·전송 실패 재시도를 제공합니다.
- 같은 메시지 ID의 재전송 중복 방지, 재연결 시 순번 기반 누락분 복구와 화면 중복 제거.
- 참여자 목록과 회원·게스트·방장 구분, 나가기, 방장의 참여자 내보내기. 방장은 다른 참여자가 모두 나간 뒤 나갈 수 있습니다. 대화 기록은 보존하고 퇴장자의 방·메시지·파일 접근과 소켓 수신은 차단합니다.
- 화면에 보인 메시지까지 읽음 위치 저장, 역순·중복 요청 시 위치 유지, 마지막 읽은 곳 복원과 안 읽은 개수. 본인이 보낸 메시지는 목록의 안 읽은 개수에서 제외합니다.
- 채팅방 목록의 마지막 메시지·시각·안 읽은 배지·최근 대화순 정렬. 별도 회원 소켓 구독으로 열지 않은 방도 갱신하고 조회 주기로 누락분을 복구합니다.
- 이미지·PDF·UTF-8 TXT·ZIP 전송과 다운로드. 한 메시지에 파일 하나, 파일당 10MB이며 확장자·MIME·실제 내용의 형식을 확인합니다. 이미지 미리보기, 전송 실패 재시도와 같은 전송 ID의 중복 방지를 지원합니다.
- 같은 방 안에서 한글·대소문자 구분 없는 부분 문자열 검색, 검색 결과 페이지와 해당 메시지 주변으로 이동. 파일 이름도 검색합니다.
- 모바일 시작 화면과 로그인/대화 준비 화면의 라우트. 모바일 인증은 별도 구현 대상입니다.
- TanStack Query를 이용한 API·DB 연결 상태 조회와 재조회.
- Socket.IO 연결, system:ping 입력 검증과 ack, 화면 종료 시 연결 해제.
- 모바일 앱이 백그라운드로 가면 소켓을 끊고 복귀 시 다시 연결.
- Prisma 모델과 SQL 마이그레이션: users, chat_rooms, room_members, messages, member_sessions.
- 구글 계정 식별용 users.google_id와 10분 동안 유효한 일회용 로그인 요청 google_login_attempts.
- room_members의 독립 ID와 MEMBER/GUEST 구분. 게스트는 user_id 없이 초대 수락 시 생성합니다.
- 메시지는 같은 방의 참여자를 sender_member_id로 참조하며, 순서와 재전송 ID의 고유 제약을 유지합니다.

아직 구현되지 않은 것: 게스트 참여를 회원 계정에 연결, 푸시, 모바일 인증·채팅 연결, 방장 권한 이전. 현재 채팅 이벤트는 room:join, room:leave, message:send, message:new, message:read, message:read-updated, room:participants-updated, chat:access-revoked를 제공하며 목록은 rooms:subscribe와 room:updated를 사용합니다. room:leave는 실시간 구독 해제이며 실제 방 나가기는 REST /leave입니다.

## 파일 저장소와 채팅 정책

로컬에서는 `pnpm storage:up`으로 S3 호환 RustFS를 실행합니다. 파일은 Docker의 `attachments_data` 볼륨, 파일 이름·크기·형식·해시는 PostgreSQL의 `attachments`에 저장합니다. 개발 환경에서는 최초 업로드 시 비공개 `chat-attachments` 버킷을 만듭니다. [RustFS 공식 실행 문서](https://docs.rustfs.com/en/installation/container/docker)를 참고하세요.

파일은 공개 URL이나 presigned URL로 노출하지 않고 회원/게스트별 API를 통과해 내려받습니다. 다운로드·미리보기마다 현재 방의 세션과 참여 권한을 확인합니다. HTML·SVG·실행 파일은 지원하지 않으며 이미지 이외의 파일은 다운로드로 제공합니다. 파일 형식 검사는 바이러스 검사를 대체하지 않으며, 운영 공개 전 악성 파일 검사와 저장 용량·업로드 요청 제한을 추가해야 합니다.

운영은 미리 생성한 비공개 버킷과 `S3_REGION`, `S3_BUCKET`, 필요 시 `S3_ENDPOINT`·`S3_ACCESS_KEY`·`S3_SECRET_KEY`를 설정합니다. AWS에서는 기본 자격 증명 체인/IAM 역할도 사용할 수 있습니다. Compose의 app 프로필은 로컬 저장소를 사용하지만 NODE_ENV=production이므로 최초 버킷은 관리 화면에서 생성해야 합니다. 저장소 접근 키를 NEXT_PUBLIC_ 환경변수에 넣지 않습니다.

메시지 저장과 첨부 메타데이터는 하나의 DB 트랜잭션으로 처리합니다. 저장 실패와 중복 업로드의 임시 오브젝트는 삭제합니다. 저장소 업로드 직후 프로세스가 강제 종료되는 경우의 고아 오브젝트 정리는 운영 후속 작업입니다. 파일 내용 검색·첨부 삭제·바이러스 검사는 이번 범위에 포함하지 않습니다.

읽음은 메시지의 끝부분이 화면에 보일 때만 갱신하고 숨겨진 탭에서는 갱신하지 않습니다. 검색은 방과 순번으로 제한한 PostgreSQL 부분 문자열 조회이며 별도 검색 엔진·전문 검색 인덱스는 아직 사용하지 않습니다. 게스트는 같은 방의 입장 전 대화도 조회·검색할 수 있습니다.

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
5. 표시 이름을 입력해 참여하면 `/guest/rooms/:roomId`로 이동해 대화할 수 있습니다. 새로고침해도 같은 브라우저에서 7일 동안 복원됩니다.

로컬 개발은 `MAIL_MODE=local`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURE=false`를 사용합니다. 기존 `.env`에 메일 설정이 없으면 개발 서버는 이 기본값을 사용합니다. `pnpm mail:stop`은 메일함만 종료합니다. 로컬 메일은 컨테이너를 다시 만들면 사라질 수 있습니다.

실제 이메일 발송에는 SMTP 서비스를 연결합니다. `apps/api/.env`의 `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`을 서비스에서 받은 값으로 설정하고 API를 재시작합니다. 587 포트는 `SMTP_SECURE=false`로 STARTTLS를 요구하고, 465 포트는 `true`로 TLS 연결합니다. `MAIL_FROM`은 서비스에서 승인한 발신 주소를 사용합니다. `INVITE_WEB_ORIGIN`은 링크를 열 웹 주소이며 `WEB_ORIGINS`에도 있어야 합니다. 운영에서는 둘 다 실제 HTTPS 주소를 지정합니다. 비밀값은 Git과 프론트 환경변수에 넣지 않습니다.

SMTP 서버가 수신자를 접수하면 '메일 서버 접수 완료'로 표시합니다. 실제 수신·반송 여부를 추적하는 웹훅은 포함하지 않습니다. 실패해도 초대는 남으며 재전송하거나 새 링크를 직접 복사할 수 있습니다. 성공 후 재전송은 1분 후부터 가능하고, 실패 시에는 바로 재시도할 수 있습니다. 재전송은 이전 링크를 폐기하고 새 48시간 링크를 발급합니다. 이미 사용·취소된 초대는 재전송할 수 없습니다. 목록에는 최근 100건을 표시합니다.

초대 링크를 여는 것만으로 참여하지 않으며 명시적인 POST 수락에서 참여자·세션을 함께 생성합니다. 같은 초대의 수락·취소·재전송은 DB 행 잠금으로 조정합니다. 이미 참여한 같은 브라우저는 기존 세션으로 복귀하지만, 다른 기기·쿠키 삭제·세션 만료 후에는 새 초대가 필요합니다. 링크 소지자가 참여할 수 있으며 별도의 수신 이메일 소유 확인이나 기존 회원 계정 자동 연결은 하지 않습니다.

발송 구현 참고: [Nodemailer SMTP](https://nodemailer.com/smtp), [Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/).

## 메시지와 실시간 채팅

회원은 방 상세, 게스트는 초대받은 방에서 같은 대화 화면을 사용합니다. 현재 참여자는 입장 전 대화를 포함한 해당 방의 전체 내역을 조회할 수 있습니다. 기본 최근 30개를 표시하고 마지막 읽은 위치가 있으면 그 주변과 이후 대화를 복원합니다. '이전 대화 더 보기'와 검색 이동 후의 '사이 대화 더 보기'로 내역을 추가 조회합니다. 메시지는 1~4000자이며 Enter로 전송하고 Shift+Enter로 줄을 바꿉니다. 한글 조합 중 Enter는 전송하지 않습니다.

| 경로 또는 이벤트 | 역할 |
| --- | --- |
| GET /api/v1/rooms/:roomId/messages | 회원의 대화 내역 조회 |
| POST /api/v1/rooms/:roomId/messages | 회원의 메시지 저장·전송 |
| GET /api/v1/guest/rooms/:roomId/messages | 해당 방 게스트의 대화 내역 조회 |
| POST /api/v1/guest/rooms/:roomId/messages | 해당 방 게스트의 메시지 저장·전송 |
| GET /api/v1/rooms/:roomId/participants | 현재 참여자·역할·읽음 위치 조회 |
| POST /api/v1/rooms/:roomId/leave | 실제 방 나가기 |
| POST /api/v1/rooms/:roomId/participants/:memberId/remove | 방장의 참여자 내보내기 |
| POST /api/v1/rooms/:roomId/messages/read | lastReadSeq 저장 |
| GET /api/v1/rooms/:roomId/messages/search | q와 beforeSeq를 이용한 검색 |
| POST /api/v1/rooms/:roomId/files | file·clientMessageId의 multipart 파일 전송 |
| GET /api/v1/rooms/:roomId/files/:id | 파일 다운로드, 이미지 preview=1 |
| room:join / room:leave | 인증된 현재 방의 실시간 구독·해제 |
| message:send / message:new | 저장 후 확인 응답과 실시간 수신 |
| chat:access-revoked | 만료·퇴장·로그아웃으로 구독 권한이 없어진 경우 안내 |

내보내기를 제외한 참여자·나가기·읽음·검색·파일 API는 `/api/v1/guest/rooms/:roomId/...`에서도 동일하게 제공하며 해당 방의 게스트 쿠키를 요구합니다. 쓰기 요청은 Origin·CSRF도 검사합니다.

조회는 beforeSeq, afterSeq, aroundSeq 중 하나와 limit(기본 30, 최대 100)을 받으며, 응답 items는 순번 오름차순입니다. 검색은 q(1~100자), beforeSeq, limit(기본 20, 최대 50)을 받습니다. lastSeq는 같은 DB 스냅샷의 방 순번입니다. 프론트엔드는 실시간 이벤트의 최댓값을 복구 커서로 사용하지 않고, REST에서 확인한 순번부터 누락분을 끝까지 가져와 이벤트 도착 순서가 엇갈려도 메시지를 빠뜨리지 않습니다.

저장은 방 행을 잠근 트랜잭션에서 현재 세션·참여 권한 확인, 중복 ID 확인, 순번 증가와 메시지 생성을 처리합니다. 저장 후에만 전송 완료 응답을 보냅니다. 같은 (방, 작성 참여자, clientMessageId)는 기존 메시지를 반환하고 재방송하지 않습니다. 같은 ID로 내용·첨부를 바꾸면 409를 반환합니다. `20261101000000_chat_features` 마이그레이션은 기존 데이터를 보존하며 attachments와 방의 last_activity_at, 조회 인덱스를 추가합니다.

소켓 구독은 허용된 Origin, 회원/게스트 구분, 방 ID, 세션 쿠키와 CSRF를 확인합니다. 전송할 때와 각 수신자에게 새 메시지를 전달하기 직전에 세션·현재 참여 권한을 DB에서 확인합니다. 유효한 구독도 15초마다 재검사합니다. 다른 방, 만료된 세션, 퇴장한 참여자에게 메시지를 전달하지 않습니다.

연결이 복구되면 재구독하고 REST로 누락분을 가져옵니다. 연결 중에도 보이는 화면에서 10초마다 동기화해 유실된 이벤트를 보완합니다. 소켓 응답을 놓치면 같은 ID로 HTTP 전송을 시도합니다. 실패한 메시지는 '다시 보내기'를 제공하며 일시적인 연결 오류는 복구 후 자동 재시도합니다. 전송 대기열은 현재 화면의 메모리에 있으며, 새로고침·탭 종료 전에 서버 저장이 확인되지 않은 메시지까지 보존하지는 않습니다.

현재 실시간 구독은 단일 API 프로세스에서 관리합니다. 여러 API 서버로 확장할 때는 서버 간 방송과 세션 회수 전달을 위한 공유 구성이 필요합니다. 실시간 전송 특성은 [Socket.IO 전송 보장 문서](https://socket.io/docs/v4/delivery-guarantees/)를 참고하세요.

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
- test:integration: TEST_DATABASE_URL이 가리키는 PostgreSQL에 임시 스키마를 만들어 실제 마이그레이션, 회원·초대·방 API, 메시지 저장·페이지·재연결, 참여자 회수·읽음·목록·검색·첨부 권한과 중복 전송을 검증하고 임시 스키마만 제거합니다. 파일 API 테스트는 저장소를 메모리 대체 구현으로 검증하므로 CI에 별도 S3 서비스는 필요하지 않습니다.
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

1. 필요 시 여러 게스트 참여를 회원 계정에 연결.
2. 모바일 인증·참여·메시지 화면 연결과 푸시.
3. 배포·운영 저장소·백업과 업로드 보호, 실제 확장 시 Redis 도입.

인증 구현 참고: [OWASP 비밀번호 저장](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP CSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

참고: [Expo 모노레포](https://docs.expo.dev/guides/monorepos/), [Prisma + NestJS](https://docs.nestjs.com/recipes/prisma), [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation).
