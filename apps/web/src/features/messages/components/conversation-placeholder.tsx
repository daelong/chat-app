export function ConversationPlaceholder({ roomId }: { roomId?: string }) {
  return <div className="text-center">
    <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl rounded-bl-md bg-indigo-600 text-3xl font-bold text-white" aria-hidden="true">C</div>
    <h1 className="text-3xl font-bold tracking-tight">새로운 대화의 시작</h1>
    <p className="mt-4 text-sm leading-7 text-slate-500">웹과 모바일을 연결하는 채팅 서비스의 기본 구성이 준비되었습니다.<br />로그인과 메시지 기능은 다음 단계에서 추가됩니다.</p>
    {roomId && <p className="mt-4 break-all text-xs text-slate-500">요청한 채팅방: {roomId}</p>}
  </div>;
}
