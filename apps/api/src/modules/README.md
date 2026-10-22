# 기능 모듈

현재 구현된 기능은 `health`입니다. `auth`, `users`, `rooms`, `messages`는 후속 기능을 위한 모듈 경계만 등록되어 있습니다. 로그인·채팅 API는 아직 공개되지 않습니다.

기능 구현 시 각 폴더에 `*.controller.ts`(HTTP), `*.gateway.ts`(실시간), `*.service.ts`(권한·트랜잭션·규칙), `*.repository.ts`(Prisma 접근)를 추가합니다. 요청 스키마는 `@chat/contracts`에서 가져와 `ZodValidationPipe` 또는 Gateway에서 런타임 검증합니다.

- Auth: 비밀번호 해시, 웹 HttpOnly 쿠키와 CSRF 방어, 모바일 보안 저장소 기반 인증, 갱신·로그아웃.
- Rooms: 사용자 인증과 멤버십 확인, 1:1 참여자 쌍 `directKey` 생성 및 중복 처리.
- Messages: 모든 조회·구독·전송 시 멤버십 확인. 트랜잭션 안에서 `ChatRoom.lastSeq`를 증가시키고 메시지를 저장한 후 ack/방송. 같은 `(roomId, senderId, clientMessageId)`는 기존 메시지를 반환. `BigInt`는 안전한 범위인지 확인한 뒤 계약의 숫자로 변환.
- 재접속: `afterSeq` 기반 REST 동기화, `messageId` 중복 제거, 실패 시 동일한 `clientMessageId`로 재전송.

Presence, 푸시, 첨부파일, Redis는 해당 기능을 실제로 도입할 때 모듈과 인프라를 추가합니다.
