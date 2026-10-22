'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createRoomSchema } from '@chat/contracts';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api-client';
import { memberSessionKey, useMemberSession } from '@/features/auth/hooks/use-member-session';
import { createRoom } from '../api/rooms';

export function CreateRoomForm() {
  const [name, setName] = useState('');
  const [validation, setValidation] = useState('');
  const { data: session } = useMemberSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Missing session');
      return createRoom(createRoomSchema.parse({ name }), session.csrfToken);
    },
    onSuccess: async (room) => {
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      router.push('/chats/' + room.id);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) void queryClient.invalidateQueries({ queryKey: memberSessionKey });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!createRoomSchema.safeParse({ name }).success) { setValidation('방 이름을 1~100자로 입력해 주세요.'); return; }
    setValidation('');
    mutation.mutate();
  }
  return <form onSubmit={submit} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
    <h2 className="text-lg font-semibold">새 채팅방 만들기</h2>
    <label htmlFor="room-name" className="mt-5 block text-sm font-medium">방 이름</label>
    <input id="room-name" name="name" value={name} onChange={(event) => setName(event.target.value)}
      required maxLength={100} placeholder="예: 금요일 저녁 모임" disabled={mutation.isPending}
      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
    {(validation || mutation.isError) && <p role="alert" className="mt-3 text-sm text-red-700">{validation || errorMessage(mutation.error)}</p>}
    <Button type="submit" className="mt-5 w-full" disabled={!session || mutation.isPending}>
      {mutation.isPending ? '만드는 중…' : '채팅방 만들기'}
    </Button>
  </form>;
}
