'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createInvitationSchema, type Invitation } from '@chat/contracts';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { createInvitation, getInvitations, resendInvitation, revokeInvitation } from '../api/invitations';

const statusLabel: Record<Invitation['status'], string> = { PENDING: '참여 대기', ACCEPTED: '참여 완료', EXPIRED: '만료됨', REVOKED: '취소됨' };
function deliveryLabel(invitation: Invitation) {
  if (invitation.deliveryStatus === 'FAILED') return '발송 실패';
  if (invitation.deliveryStatus === 'SENDING') return '발송 확인 중';
  return invitation.deliveryMode === 'LOCAL' ? '개발 메일함에 도착' : '메일 서버 접수 완료';
}
const date = (value: string) => new Date(value).toLocaleString('ko-KR');

export function InvitationManager({ roomId, csrfToken }: { roomId: string; csrfToken: string }) {
  const [email, setEmail] = useState('');
  const [validation, setValidation] = useState('');
  const [freshLink, setFreshLink] = useState<{ id: string; url: string } | null>(null);
  const [copyNotice, setCopyNotice] = useState('');
  const queryClient = useQueryClient();
  const queryKey = ['invitations', roomId];
  const invitations = useQuery({ queryKey, queryFn: ({ signal }) => getInvitations(roomId, signal), retry: false, refetchInterval: 10_000 });
  const mutation = useMutation({
    mutationFn: async (action: { type: 'create' | 'resend' | 'revoke'; id?: string; email?: string }) => {
      if (action.type === 'revoke') { await revokeInvitation(roomId, action.id!, csrfToken); return null; }
      return action.type === 'create' ? createInvitation(roomId, action.email!, csrfToken) : resendInvitation(roomId, action.id!, csrfToken);
    },
    onSuccess: async (result, action) => {
      setFreshLink(result ? { id: result.invitation.id, url: result.invitationUrl } : null);
      setCopyNotice('');
      if (action.type === 'create') setEmail('');
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ['room'] });
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = createInvitationSchema.safeParse({ email });
    if (!input.success) { setValidation('초대할 이메일 주소를 확인해 주세요.'); return; }
    setValidation('');
    mutation.mutate({ type: 'create', email: input.data.email });
  }
  const activeLink = freshLink && invitations.data?.some((item) => item.id === freshLink.id && item.status === 'PENDING') ? freshLink : null;
  return <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="이메일 초대 관리">
    <h2 className="text-lg font-semibold">이메일로 초대하기</h2>
    <p className="mt-2 text-sm leading-6 text-slate-500">받는 사람은 회원가입 없이 이름만 입력하면 이 방에 참여할 수 있어요. 초대는 48시간 동안 한 번만 사용할 수 있습니다.</p>
    <form onSubmit={submit} className="mt-5">
      <label htmlFor="invite-email" className="text-sm font-medium">초대할 이메일</label>
      <input id="invite-email" name="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={mutation.isPending}
        placeholder="friend@example.com" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500" />
      <Button type="submit" className="mt-3 w-full" disabled={mutation.isPending}>{mutation.isPending ? '처리 중…' : '초대 보내기'}</Button>
    </form>
    {(validation || mutation.isError) && <p role="alert" className="mt-3 text-sm text-red-700">{validation || errorMessage(mutation.error)}</p>}
    {activeLink && <div className="mt-4 rounded-xl bg-indigo-50 p-4">
      <p className="text-sm font-medium">새 초대 링크가 만들어졌어요.</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">복사한 링크도 한 번만 사용할 수 있어요. 재전송하면 이전 링크는 사용할 수 없습니다.</p>
      <input aria-label="새 초대 링크" value={activeLink.url} readOnly className="mt-3 w-full rounded border border-indigo-200 bg-white p-2 text-xs" onFocus={(event) => event.target.select()} />
      <button type="button" className="mt-3 text-sm font-medium text-indigo-700 underline" onClick={() => {
        void navigator.clipboard.writeText(activeLink.url).then(() => setCopyNotice('링크를 복사했어요.'), () => setCopyNotice('위 링크를 선택해 복사해 주세요.'));
      }}>링크 복사</button>
      {copyNotice && <p role="status" className="mt-2 text-xs">{copyNotice}</p>}
    </div>}
    <div className="mt-7 flex items-center justify-between"><h3 className="text-sm font-semibold">최근 초대 내역</h3>
      <button type="button" className="text-xs text-indigo-700 underline" disabled={invitations.isFetching} onClick={() => { void invitations.refetch(); }}>새로고침</button></div>
    {invitations.isPending && <p role="status" className="mt-4 text-sm text-slate-500">초대를 불러오고 있어요.</p>}
    {invitations.isError && <p role="alert" className="mt-4 text-sm text-red-700">{errorMessage(invitations.error)}</p>}
    {invitations.data?.length === 0 && <p className="mt-4 text-sm text-slate-500">아직 보낸 초대가 없어요.</p>}
    <ul className="mt-3 space-y-3">{invitations.data?.map((invitation) => <li key={invitation.id} className="rounded-xl border border-slate-200 p-4">
      <p className="break-all text-sm font-medium">{invitation.email}</p>
      <p className="mt-2 text-xs text-slate-600">{statusLabel[invitation.status]} · {deliveryLabel(invitation)}</p>
      <p className="mt-2 text-xs text-slate-500">만료: {date(invitation.expiresAt)}</p>
      {invitation.deliveryStatus === 'FAILED' && <p role="alert" className="mt-2 text-xs leading-5 text-red-700">{invitation.deliveryError}</p>}
      {invitation.deliveryMode === 'LOCAL' && invitation.deliveryStatus === 'SENT' && <p className="mt-2 text-xs leading-5 text-slate-600">로컬 테스트 메일입니다. <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="text-indigo-700 underline">개발 메일함 열기</a>에서 확인하세요.</p>}
      {['PENDING', 'EXPIRED'].includes(invitation.status) && <div className="mt-3 flex flex-wrap gap-4">
        <button type="button" className="text-xs font-medium text-indigo-700 underline disabled:opacity-50" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: 'resend', id: invitation.id })}>재전송</button>
        <button type="button" className="text-xs font-medium text-red-700 underline disabled:opacity-50" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: 'revoke', id: invitation.id })}>초대 취소</button>
      </div>}
    </li>)}</ul>
    <p className="mt-4 text-xs leading-5 text-slate-500">최근 100건을 표시합니다. 메일 서버 접수 후에도 실제 수신은 메일함에서 확인해 주세요. 발송 성공 후 재전송은 1분 뒤부터 가능합니다.</p>
  </section>;
}
