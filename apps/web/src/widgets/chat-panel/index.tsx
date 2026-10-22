import { CreateRoomForm } from '@/features/rooms/components/create-room-form';
import { RoomDetail } from '@/features/rooms/components/room-detail';
import { ServiceStatus } from '@/features/system/components/service-status';

export function ChatPanel({ roomId }: { roomId?: string }) {
  return <main className="flex min-w-0 flex-1 justify-center px-6 py-12"><div className="w-full max-w-xl">
    {roomId ? <RoomDetail roomId={roomId} /> : <>
      <h1 className="text-3xl font-bold tracking-tight">새로운 대화의 시작</h1>
      <p className="mt-4 leading-7 text-slate-500">함께 이야기할 공간에 이름을 붙여 주세요.</p>
      <CreateRoomForm />
      <details className="mt-8 text-sm text-slate-500"><summary className="cursor-pointer">서비스 연결 상태 확인</summary><ServiceStatus /></details>
    </>}
  </div></main>;
}
