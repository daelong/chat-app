# Chat Platform

Next.js 웹, Expo 모바일, NestJS API를 함께 관리하는 pnpm 모노레포입니다. 원본 설계는 [docs/architecture.md](docs/architecture.md)에 보관했습니다.

현재 작업 범위는 **기술 스택·구조 전환과 실행 가능한 기본 구성**입니다. 로그인과 실제 채팅은 아직 구현 전이며, 화면에도 준비 상태를 표시합니다. Spring Boot/Vite 실행 명령은 더 이상 사용하지 않습니다.

## 구성

| 경로 | 기술과 책임 |
| --- | --- |
| apps/web | Next.js App Router, React, Tailwind CSS, TanStack Query |
| apps/mobile | Expo SDK 57, React Native, Expo Router, TanStack Query |
| apps/api | NestJS 단일 서버, 기능별 모듈, Socket.IO, Prisma |
| packages/contracts | Zod 요청·응답 검증 스키마, REST 경로, 소켓 이벤트 타입 |
| packages/utils | 플랫폼에 의존하지 않는 공통 함수 |
| packages/config | 공통 TypeScript 설정 |
| infra | 로컬 PostgreSQL, API Docker 이미지와 Compose |

웹과 모바일은 각각 components/ui → features → widgets → 페이지 구조를 사용합니다. UI는 플랫폼별로 구현하고 데이터 계약을 공유합니다. 서버는 Controller/Gateway → Service → Repository 구조로 확장하며, 현재 auth/users/rooms/messages에는 모듈 경계만 등록되어 있습니다.

## 현재 동작하는 것

- 웹·모바일 시작 화면과 로그인/대화 화면의 라우트.
- TanStack Query를 이용한 API·DB 연결 상태 조회와 재조회.
- Socket.IO 연결, system:ping 입력 검증과 ack, 화면 종료 시 연결 해제.
- 모바일 앱이 백그라운드로 가면 소켓을 끊고 복귀 시 다시 연결.
- Prisma 모델과 초기 SQL 마이그레이션: users, chat_rooms, room_members, messages.
- 메시지 순서와 재전송 ID의 고유 제약, 1:1 방 direct_key 고유 제약.

아직 구현되지 않은 것: 회원가입·로그인·토큰 발급, 방 생성, 메시지 전송·내역 조회, 멤버십 인증/인가, 메시지 재접속 동기화, 읽음 처리, 파일 첨부와 푸시. 공유 계약에 경로와 타입이 있어도 해당 API가 구현된 것은 아닙니다. 인증 구현 전에는 실제 채팅 이벤트를 공개하지 않습니다.

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
pnpm db:deploy
pnpm dev
~~~

pnpm dev는 웹(3000)과 API(4000)를 함께 실행합니다. 별도 터미널에서 실행하려면 pnpm dev:web, pnpm dev:api를 사용합니다. 초기 마이그레이션 적용은 pnpm db:deploy이며, 스키마를 수정해 새 마이그레이션을 만들 때는 pnpm db:migrate를 사용합니다.

| 대상 | 주소 |
| --- | --- |
| 웹 시작 화면 | http://localhost:3000/chats |
| 로그인 준비 화면 | http://localhost:3000/login |
| API 생존 상태 | http://localhost:4000/api/v1/health |
| DB 준비 상태 | http://localhost:4000/api/v1/health/ready |
| Socket.IO | http://localhost:4000/chat (namespace) |

생존 상태는 API 프로세스의 동작을, 준비 상태는 DB 연결을 확인합니다. DB 연결 실패 시 readiness는 HTTP 503을 반환합니다. 웹의 REST 요청은 Next.js rewrite가 API로 전달하고 Socket.IO는 브라우저에서 API에 직접 연결합니다. 서버 주소를 바꾸면 apps/web/.env.local의 API_INTERNAL_URL과 NEXT_PUBLIC_SOCKET_URL도 맞춰 주세요.

공유 패키지는 실행 전에 빌드됩니다. contracts/utils를 수정한 경우 실행 중인 개발 서버를 종료하고 루트의 개발 명령을 다시 실행해 공유 패키지를 재빌드하세요.

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
pnpm build
pnpm mobile:export
~~~

- typecheck: 공유 패키지·웹·API·모바일 TypeScript 검사.
- test: HTTP/Socket.IO 통합 테스트와 계약 검증. DB 연결 상태는 테스트 대역으로 대체합니다.
- build: 공유 패키지와 API 컴파일, Next.js 프로덕션 빌드.
- mobile:export: 모바일과 Expo 웹 JS 번들 생성. 실제 iOS/Android 네이티브 빌드·기기 테스트는 별도입니다.

GitHub Actions는 깨끗한 PostgreSQL을 띄우고 초기 마이그레이션, 타입 검사, 테스트, 웹/API 빌드와 Expo 번들을 검사합니다. 의존성 잠금 파일을 포함해 변경사항을 커밋해야 CI가 재현됩니다.

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

1. 인증: 이메일 가입·로그인, 웹 HttpOnly 쿠키/CSRF, 모바일 SecureStore, 갱신·로그아웃.
2. 방과 메시지: 멤버십 확인, Repository와 Service, 트랜잭션 안에서 seq 할당·저장, 저장 후 ack.
3. 안정화: 동일 clientMessageId 재시도, messageId 중복 제거, afterSeq 누락분 동기화, 권한·동시성 테스트.
4. 필요에 따라 읽음·그룹·첨부·푸시 기능과 Redis를 도입합니다.

참고: [Expo 모노레포](https://docs.expo.dev/guides/monorepos/), [Prisma + NestJS](https://docs.nestjs.com/recipes/prisma), [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation).
