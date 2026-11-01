# 프로젝트 실행·종료 안내서

이 문서는 `/Users/idaehyeon/Documents/chat-app`을 Mac과 VS Code에서 실행하는 방법입니다.

- Node.js **24**, pnpm **10.28.2**를 사용합니다.
- 프론트엔드: Next.js, `http://localhost:3000`
- 백엔드: NestJS, `http://localhost:4000`
- DB: Docker의 PostgreSQL, `localhost:5432`
- 개발용 메일함: Docker의 Mailpit, `http://localhost:8025`
- 파일 저장소: Docker의 RustFS, S3 API `http://localhost:9000`, 관리 화면 `http://localhost:9001`
- DB 조회: DBeaver 또는 Prisma Studio

## 1. 이미 설치한 프로젝트를 다시 켤 때

### 1-1. Docker Desktop 실행

Mac의 응용 프로그램 또는 Spotlight에서 **Docker**를 실행합니다. Docker Desktop 아래쪽에 **Engine running**이 표시될 때까지 기다립니다.

터미널로 열려면 다음 명령을 사용할 수도 있습니다.

```sh
open -a Docker
```

Docker Desktop 창을 여는 것과 PostgreSQL 컨테이너를 켜는 것은 별도 단계입니다. 아래 DB 실행 명령까지 진행하세요.

### 1-2. VS Code 터미널 준비

VS Code에서 프로젝트 폴더를 열고 **터미널 → 새 터미널**을 선택합니다. 다음 명령을 같은 터미널에서 실행합니다.

```sh
cd /Users/idaehyeon/Documents/chat-app

source "$HOME/.nvm/nvm.sh"
nvm use

export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

node --version
pnpm --version
docker --version
```

확인할 값:

- Node.js: `v24.x.x`
- pnpm: `10.28.2`
- Docker: 버전이 출력되고 `command not found`가 없어야 합니다.

`nvm use`는 프로젝트의 `.nvmrc`를 읽어 Node.js 24를 선택합니다. Node.js 25가 출력되면 5장의 해결 방법을 확인하세요.

`source`, `nvm use`, `export PATH`는 현재 터미널에 적용됩니다. 새 터미널에서 명령을 실행할 때도 이 준비 단계를 적용하세요. 매번 입력하지 않으려면 6장의 셸 설정을 참고하세요.

### 1-3. PostgreSQL·개발용 메일함·파일 저장소 실행

프로젝트 루트에서 실행합니다.

```sh
docker compose -f infra/compose.yml up -d --wait postgres mailpit storage
```

이 명령은 PostgreSQL·Mailpit·RustFS를 백그라운드로 실행하고 준비 상태를 기다립니다. 처음 실행하면 이미지를 다운로드하므로 시간이 걸릴 수 있습니다. 이미 실행 중인 컨테이너는 재사용합니다.

상태를 확인합니다.

```sh
docker compose -f infra/compose.yml ps
```

세 서비스가 `Up`이고 PostgreSQL과 RustFS가 `healthy`이면 준비가 완료된 것입니다.

프로젝트에 등록된 개별 실행 명령도 사용할 수 있습니다.

```sh
pnpm db:up
pnpm mail:up
pnpm storage:up
```

`storage:up`은 저장소 준비까지 기다립니다. `db:up`은 준비 완료까지 기다리지 않으므로 `ps`에서 `postgres`가 `healthy`인지 확인한 후 다음 단계로 진행하세요.

### 1-4. DB 테이블 적용

```sh
pnpm db:deploy
```

아직 적용하지 않은 DB 마이그레이션을 실행합니다. 이미 모두 적용했다면 변경 없이 완료됩니다. 기존 프로젝트를 다시 켤 때마다 테이블을 새로 만드는 명령은 아닙니다.

### 1-5. 프론트엔드와 백엔드 실행

```sh
pnpm dev
```

웹과 API를 함께 실행합니다. 이 터미널은 서버가 실행되는 동안 계속 열어 둡니다.

브라우저에서 [로그인 화면](http://localhost:3000/login)을 엽니다. 구글 로그인과 초대 링크 주소가 일치하도록 로컬 접속에는 `localhost:3000`을 사용하세요.

## 2. 접속 주소와 동작 확인

| 대상 | 주소 | 용도 |
| --- | --- | --- |
| 로그인 | http://localhost:3000/login | 회원 로그인 |
| 회원가입 | http://localhost:3000/sign-up | 새 회원 생성 |
| 채팅방 | http://localhost:3000/chats | 로그인 후 내 방 조회·생성 |
| API 생존 상태 | http://localhost:4000/api/v1/health | 백엔드 실행 여부 |
| DB 연결 상태 | http://localhost:4000/api/v1/health/ready | 백엔드에서 DB 연결이 되는지 확인 |
| 개발용 메일함 | http://localhost:8025 | 로컬 초대 이메일 확인 |
| 파일 저장소 관리 | http://localhost:9001 | RustFS 버킷·저장 파일 확인 |
| Prisma Studio | http://localhost:5555 | 별도 실행한 경우 DB 조회 |

DB 연결 상태는 다음 명령으로도 확인할 수 있습니다.

```sh
curl http://localhost:4000/api/v1/health/ready
```

정상 응답:

```json
{"status":"UP","database":"UP"}
```

웹에서 API로 연결되는 경로까지 확인하려면 다음 주소를 사용합니다.

```sh
curl http://localhost:3000/api/v1/health/ready
```

프론트엔드는 백엔드 `4000` 포트로 API 요청을 전달합니다. DB만 켜거나 프론트엔드만 켜면 로그인·방 조회가 정상 동작하지 않습니다.

현재 기본 메일 설정은 `MAIL_MODE=local`입니다. 입력한 이메일의 실제 수신함으로 발송하는 대신 Mailpit에 저장합니다. 초대 메일의 참여 링크는 작동합니다.

RustFS의 로컬 관리 계정은 `chat-local`, 비밀번호는 `chat-local-storage-password`입니다. 개발 환경에서는 첫 파일 전송 시 `chat-attachments` 버킷을 자동 생성합니다. 기존 `apps/api/.env`에 S3 설정이 없어도 로컬 기본값으로 연결됩니다. 파일 업로드가 실패하면 `pnpm storage:up`과 `docker compose -f infra/compose.yml ps storage`를 확인하세요. 계정은 로컬 전용이며 운영에서는 별도 저장소와 비밀값을 설정합니다. 파일은 채팅방의 **파일 보내기**에서 선택하면 즉시 전송됩니다.

## 3. 프론트엔드와 백엔드를 따로 실행하고 싶을 때

두 터미널 모두 1-2의 Node.js·경로 준비를 적용합니다. DB와 Mailpit은 1-3에서 켜 둡니다.

**터미널 A — 백엔드:**

```sh
cd /Users/idaehyeon/Documents/chat-app
pnpm dev:api
```

**터미널 B — 프론트엔드:**

```sh
cd /Users/idaehyeon/Documents/chat-app
pnpm dev:web
```

`pnpm dev`로 이미 둘 다 실행 중이라면 별도 실행 명령을 추가로 실행하지 않습니다. 같은 포트를 사용하므로 충돌할 수 있습니다.

## 4. DB 테이블 보기

### 4-1. Prisma Studio

DB가 켜져 있는 상태에서 새 터미널을 열고 1-2의 환경 준비 후 실행합니다.

```sh
cd /Users/idaehyeon/Documents/chat-app
pnpm --filter @chat/api exec prisma studio --port 5555
```

[http://localhost:5555](http://localhost:5555)에서 테이블을 확인합니다. Studio를 실행한 터미널도 계속 열어 둡니다.

### 4-2. DBeaver

DBeaver에서 새 연결을 만들고 **PostgreSQL**을 선택합니다. 프로젝트 기본 설정은 다음과 같습니다.

| 항목 | 기본값 |
| --- | --- |
| Host | `localhost` |
| Port | `5432` |
| Database | `chat` |
| Username | `chat` |
| Password | `chat_local_password` |
| Schema | `public` |

직접 변경한 설정이 있다면 `apps/api/.env`의 `DATABASE_URL`과 실행 중인 DB의 값을 사용합니다. `5555`는 Prisma Studio 화면 주소이고, DB에 직접 연결할 때는 `5432` 포트를 사용합니다.

DBeaver로 볼 때는 Prisma Studio를 실행할 필요가 없습니다. PostgreSQL 컨테이너만 켜져 있으면 됩니다.

주요 테이블:

- `users`: 회원 계정
- `chat_rooms`: 채팅방
- `room_members`: 방별 회원·게스트 참여자
- `invitations`: 초대와 발송 결과
- `member_sessions`: 회원 로그인 세션
- `guest_sessions`: 방 전용 게스트 세션
- `messages`: 메시지 저장 구조
- `attachments`: 메시지에 연결된 파일 메타데이터 (실제 파일은 RustFS)
- `google_login_attempts`: 진행 중인 구글 로그인 검증 정보

## 5. 실행이 안 될 때

### `docker: command not found`

Docker는 설치됐지만 현재 터미널의 PATH에 실행 파일 경로가 없는 경우입니다.

```sh
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker --version
```

버전이 출력되면 DB 실행 명령을 다시 실행합니다.

```sh
docker compose -f infra/compose.yml up -d --wait postgres mailpit storage
```

### `Cannot connect to the Docker daemon` 또는 Docker 소켓 연결 실패

Docker Desktop을 켜고 **Engine running**이 될 때까지 기다립니다. 실행 파일의 버전이 출력되더라도 엔진이 꺼져 있으면 컨테이너를 실행할 수 없습니다.

```sh
docker info
```

서버 정보를 정상 조회할 수 있으면 컨테이너 실행 명령을 다시 시도합니다.

### `docker-credential-desktop: executable file not found`

Docker 보조 프로그램 경로도 필요합니다. 아래 경로를 적용한 후 다시 시도합니다.

```sh
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

### `Unsupported engine`, Node.js 25가 출력됨

이 프로젝트는 Node.js 24를 사용합니다.

```sh
cd /Users/idaehyeon/Documents/chat-app
source "$HOME/.nvm/nvm.sh"
nvm use
node --version
pnpm --version
```

24 버전이 설치되지 않았다는 메시지가 나오면 다음을 실행합니다.

```sh
nvm install 24
nvm use
```

`nvm: command not found`가 나오면 먼저 위의 `source` 명령을 실행합니다. 이 Mac에는 `$HOME/.nvm/nvm.sh`가 설치되어 있습니다.

### `pnpm: command not found` 또는 pnpm 버전이 다름

먼저 Node.js 24를 선택합니다. 이후에도 pnpm이 없거나 버전이 다르면 다음을 실행합니다.

```sh
npm install -g pnpm@10.28.2
pnpm --version
```

기존 설치가 정상인 프로젝트를 다시 켤 때는 `pnpm install`을 매번 실행할 필요가 없습니다.

### `EADDRINUSE`, `address already in use`, `Port 3000 is in use`

이전에 실행한 서버가 아직 켜져 있거나 다른 프로그램이 같은 포트를 사용 중입니다. 먼저 기존 실행 터미널에서 `Ctrl + C`로 종료하고 다시 실행합니다.

어떤 프로세스가 포트를 사용하는지 확인하려면:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

이미 실행 중인 웹과 API가 정상 응답하면 새로 실행할 필요 없이 브라우저에서 접속하면 됩니다. Next.js가 다른 포트로 실행됐다는 메시지가 나오면 기존 서버를 확인하고 `3000` 포트를 정리하세요. 현재 구글 로그인·초대 링크는 `3000` 주소를 기준으로 설정되어 있습니다.

Docker의 API 컨테이너가 `4000` 포트를 차지하고 있는지도 확인할 수 있습니다.

```sh
docker compose -f infra/compose.yml ps
```

Docker API 대신 로컬 `pnpm dev`를 실행하려는 경우에만 해당 컨테이너를 중지합니다.

```sh
docker compose -f infra/compose.yml stop api
```

### DB 연결 실패, `database: DOWN`, 로그인 시 서버 오류

컨테이너 상태와 DB 준비 상태를 확인합니다.

```sh
docker compose -f infra/compose.yml ps
docker compose -f infra/compose.yml exec -T postgres pg_isready -U chat -d chat
docker compose -f infra/compose.yml logs --tail 50 postgres
```

준비가 되면 마이그레이션을 적용합니다.

```sh
pnpm db:deploy
```

`password authentication failed`라면 `apps/api/.env`의 접속 정보와 기존 DB 비밀번호가 일치하는지 확인합니다. Compose의 환경변수만 바꿔도 이미 만들어진 DB의 비밀번호가 자동으로 바뀌지는 않습니다.

### 테이블이 없다는 오류

DB 컨테이너가 준비된 뒤 다음을 실행합니다.

```sh
pnpm db:deploy
```

Prisma Client 생성 관련 오류라면 다음을 실행한 후 개발 서버를 다시 시작합니다.

```sh
pnpm db:generate
```

### API는 응답하지만 웹에서 로그인·조회가 안 됨

웹을 통한 DB 연결 확인 주소를 엽니다.

```sh
curl http://localhost:3000/api/v1/health/ready
```

웹의 API 대상은 기본적으로 `http://127.0.0.1:4000`입니다. `apps/web/.env.local`을 만들어 주소를 변경했다면 API가 실행 중인 주소와 일치하는지 확인하고 프론트엔드를 재시작합니다.

기본 설정으로는 `apps/web/.env.local`이 없어도 실행할 수 있습니다. 예시 파일은 `apps/web/.env.example`입니다.

### 구글 로그인 버튼이 안 보임

실제 API 설정은 `apps/api/.env`에 넣습니다. `.env.example`은 예시 파일입니다.

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` 세 항목을 함께 설정하고 API를 재시작합니다. 현재 로컬 콜백 주소는 `http://localhost:3000/api/v1/auth/google/callback`입니다. 기존 `.env`를 예시 파일로 덮어쓰지 마세요.

### 초대 메일 발송 실패

로컬 메일함을 실행합니다.

```sh
pnpm mail:up
```

기본 메일 설정은 `MAIL_MODE=local`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURE=false`입니다. `apps/api/.env`에서 값을 바꿨다면 확인하고 API를 재시작합니다. 방의 초대 내역에서 재전송한 뒤 [개발용 메일함](http://localhost:8025)을 확인합니다.

## 6. 새 터미널에서도 Docker 경로 유지하기

1-2의 `export PATH`는 현재 터미널에만 적용됩니다. 사용 중인 셸의 시작 설정 파일에 아래 내용을 추가하면 새 터미널에서도 적용할 수 있습니다.

- Zsh: `~/.zshrc`
- Bash: 일반 대화형 셸은 `~/.bashrc`, 로그인 셸은 `~/.bash_profile`을 읽습니다. VS Code에서 사용하는 Bash 실행 방식에 맞는 파일에 추가합니다.

추가할 내용:

```sh
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

셸 설정을 변경한 후에는 새 터미널을 열어 `docker --version`을 확인합니다. Node.js 버전은 프로젝트 폴더에서 `nvm use`로 선택합니다.

이 안내서가 사용자 홈의 셸 설정을 자동 변경하지는 않습니다.

## 7. 처음 설치하거나 의존성·환경 파일이 없을 때

이미 설치된 이 프로젝트를 다시 켜는 경우에는 보통 1장만 진행하면 됩니다. 처음 내려받은 프로젝트나 `node_modules`가 없는 경우에는 Node.js 24와 pnpm 10.28.2를 준비한 뒤 실행합니다.

```sh
cd /Users/idaehyeon/Documents/chat-app
pnpm install --frozen-lockfile
```

환경 파일이 없는 경우에만 복사합니다. 아래 명령은 이미 있는 파일을 덮어쓰지 않습니다.

```sh
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
fi

if [ ! -f apps/web/.env.local ]; then
  cp apps/web/.env.example apps/web/.env.local
fi

pnpm db:generate
```

그다음 1-3부터 DB·메일함 실행, 마이그레이션, 개발 서버 실행을 진행합니다.

## 8. 종료와 재시작

### 웹·API 종료

`pnpm dev`를 실행한 터미널에서 **Ctrl + C**를 누릅니다. 별도로 실행했다면 각 터미널에서 종료합니다. DB 컨테이너는 계속 실행됩니다.

### 웹·API만 재시작

실행 중인 터미널에서 **Ctrl + C**를 누른 다음:

```sh
pnpm dev
```

DB·Mailpit·파일 저장소가 실행 중이라면 다시 켤 필요는 없습니다. `.env`나 공유 패키지 코드를 변경한 경우에도 개발 서버를 다시 시작합니다.

### Prisma Studio 종료

Studio를 실행한 터미널에서 **Ctrl + C**를 누릅니다. DB와 앱은 계속 사용할 수 있습니다.

### DB·메일함·파일 저장소도 중지

```sh
docker compose -f infra/compose.yml stop postgres mailpit storage
```

컨테이너를 다시 켤 때는 1-3의 `up` 명령을 사용합니다.

Compose의 컨테이너와 네트워크까지 종료하려면 다음 프로젝트 명령을 사용할 수 있습니다. API·Mailpit·RustFS도 포함됩니다.

```sh
pnpm db:down
```

PostgreSQL 데이터는 `postgres_data`, 첨부파일은 `attachments_data` 볼륨에 보관하므로 일반적인 `stop`과 `down` 뒤에도 유지됩니다. 데이터를 유지하려면 볼륨 삭제 옵션이나 Docker Desktop의 볼륨 삭제를 사용하지 마세요.
