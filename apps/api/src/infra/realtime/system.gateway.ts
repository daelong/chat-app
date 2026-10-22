import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { CHAT_NAMESPACE, systemPingSchema, type Ack, type Health } from '@chat/contracts';
import { HealthService } from '../../modules/health/health.service';

// 공개 연결 확인 전용입니다. 인증 없는 채팅방 구독·메시지 처리는 구현하지 않습니다.
@WebSocketGateway({ namespace: CHAT_NAMESPACE })
export class SystemGateway {
  constructor(private readonly health: HealthService) {}

  @SubscribeMessage('system:ping')
  ping(@MessageBody() payload: unknown): Ack<Health> {
    if (!systemPingSchema.safeParse(payload).success) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: '요청 형식을 확인하세요.' } };
    }
    return { ok: true, data: this.health.check() };
  }
}
