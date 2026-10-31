# 기능 모듈

현재 구현된 기능은 health, 회원 가입·로그인·로그아웃, 내 계정 조회, 회원의 방 생성·조회, 이메일 초대·게스트 입장, 회원·게스트의 메시지 저장·조회·실시간 송수신입니다.

제품 정책은 [이메일 초대와 회원가입 없는 참여 설계](../../../../docs/invitation-flow.md)를 따릅니다. Prisma 모델에서 회원 계정과 방 참여자를 구분하며, 메시지는 같은 방의 참여자를 작성자로 참조합니다. 방 생성은 회원 세션, 초대 관리는 해당 방의 OWNER 회원 세션이 필요합니다.

기능 구현 시 각 폴더에 `*.controller.ts`(HTTP), `*.gateway.ts`(실시간), `*.service.ts`(권한·트랜잭션·규칙), `*.repository.ts`(Prisma 접근)를 추가합니다. 요청 스키마는 `@chat/contracts`에서 가져와 `ZodValidationPipe` 또는 Gateway에서 런타임 검증합니다.

- Auth: scrypt 비밀번호 해시, DB에 해시로 저장하는 7일 회원 세션, 웹 HttpOnly 쿠키, Origin·CSRF 검사, 가입·로그인 요청 제한, 로그아웃 시 세션 삭제. 구글 인가 코드·PKCE 교환, ID 토큰 검증과 회원 생성·로그인, 10분 일회용 state도 처리합니다. Google OAuth 클라이언트 설정이 필요하며 모바일 인증과 세션 갱신은 후속 구현입니다.
- Users: 회원 세션으로 현재 계정과 CSRF 토큰만 응답합니다. 비밀번호 해시와 세션 토큰 원문은 응답하지 않습니다.
- Rooms: 회원 인증 후 생성자만 참여한 GROUP 방을 만듭니다. 목록·상세 조회는 userId, kind=MEMBER, leftAt=null을 만족하는 참여자로 제한합니다. 기존 DIRECT 방은 보존하며, 새 1:1 방 정책은 초대 구현 시 정합니다.
- Invitations: 48시간 일회용 초대, SMTP 발송과 실패·재전송, 취소·만료·사용 상태를 관리합니다. 재전송은 토큰을 교체하며 수락과 행 잠금으로 조정합니다. 수락은 GUEST 참여자·세션을 원자적으로 만듭니다. 로컬은 Mailpit, 실제 메일은 SMTP 설정을 사용합니다.
- Guests: 7일 동안 유효한 방별 HttpOnly 쿠키와 guest_sessions를 사용합니다. 쿠키의 방뿐 아니라 DB의 방·참여자 종류·퇴장·만료도 검사합니다. 회원 전용 API에는 사용할 수 없습니다. 현재 게스트 API는 방과 세션 조회를 제공합니다.
- Messages: RoomAccessService에서 회원·게스트 세션과 현재 참여 권한을 확인합니다. 저장 트랜잭션에서 방 행 잠금·중복 ID 검사·`ChatRoom.lastSeq` 증가·메시지 생성을 처리한 후 ack/방송합니다. 같은 `(roomId, senderMemberId, clientMessageId)`는 같은 내용일 때 기존 메시지를 반환하며 다른 내용은 거부합니다. `BigInt`는 안전한 범위를 확인한 뒤 숫자로 변환합니다. 조회는 반복 가능한 읽기 스냅샷과 순번 커서를 사용합니다.
- MessagesGateway / MessageBroadcaster: 구독 시 Origin·방·세션·CSRF를 검사합니다. 실제 수신 직전에도 각 소켓의 현재 권한을 확인하고 15초마다 구독을 재검사합니다. 단일 서버의 구독만 관리하며 다른 서버의 이벤트 전달은 후속 확장 대상입니다.
- 재접속: `afterSeq` 기반 REST 동기화, `messageId` 중복 제거, 실패 시 동일한 `clientMessageId`로 재전송.

Presence, 푸시, 첨부파일, Redis는 해당 기능을 실제로 도입할 때 모듈과 인프라를 추가합니다.
