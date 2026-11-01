'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatParticipant, ChatSocketAuth } from '@chat/contracts';
import { errorMessage } from '@/lib/api-client';
import { leaveRoom, removeParticipant } from '../api/messages';

export function ParticipantsPanel({ auth, me, participants, refresh }: { auth: ChatSocketAuth; me: ChatParticipant;
  participants: ChatParticipant[]; refresh(): void }) {
  const router = useRouter();
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function leave(id?: string) {
    if (!window.confirm(id ? '이 참여자를 내보낼까요? 이 방의 대화와 파일에 더 이상 접근할 수 없습니다.' : '채팅방을 나갈까요? 다시 참여하려면 새 초대가 필요합니다.')) return;
    setBusy(true); setError('');
    try {
      if (id) { await removeParticipant(auth, id); refresh(); }
      else {
        await leaveRoom(auth);
        await queries.invalidateQueries({ queryKey: ['rooms'] });
        queries.removeQueries({ queryKey: ['guest-room', auth.roomId] });
        router.replace(auth.kind === 'MEMBER' ? '/chats' : '/login');
      }
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <details className="border-b border-slate-100 px-5 py-3">
    <summary className="cursor-pointer text-sm font-medium text-slate-700">참여자 {participants.length}명</summary>
    <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto">
      {participants.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 break-words">{item.displayName}{item.id === me.id ? ' (나)' : ''}
          <span className="ml-2 text-xs text-slate-500">{item.role === 'OWNER' ? '방장' : item.kind === 'GUEST' ? '게스트' : '회원'}</span></span>
        {me.role === 'OWNER' && me.kind === 'MEMBER' && item.id !== me.id && item.role !== 'OWNER' &&
          <button type="button" disabled={busy} className="shrink-0 text-xs text-red-700 underline disabled:opacity-50" onClick={() => { void leave(item.id); }}>내보내기</button>}
      </li>)}
    </ul>
    <div className="mt-4 border-t border-slate-100 pt-3">
      {me.role === 'OWNER' && participants.length > 1 && <p className="mb-2 text-xs text-slate-500">방장은 다른 참여자가 모두 나간 후 나갈 수 있어요.</p>}
      <button type="button" disabled={busy || me.role === 'OWNER' && participants.length > 1} onClick={() => { void leave(); }} className="text-xs text-red-700 underline disabled:opacity-50">채팅방 나가기</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </details>;
}
