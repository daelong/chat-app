'use client';

import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatSocketAuth } from '@chat/contracts';
import { Button } from '@/components/ui/button';
import { useConversation } from '../hooks/use-conversation';

const connectionLabel = { connecting: '연결 중…', syncing: '대화 동기화 중…', connected: '실시간 연결됨', offline: '실시간 연결 대기 · 대화 내역 자동 확인 중', denied: '참여 권한 확인 필요' };
export function Conversation(props: ChatSocketAuth) {
  const chat = useConversation(props);
  const [body, setBody] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const previous = useRef({ first: '', last: '', height: 0 });
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const first = chat.messages[0]?.messageId ?? '';
    const last = chat.messages.at(-1)?.messageId ?? '';
    if (previous.current.first && first !== previous.current.first && last === previous.current.last) {
      element.scrollTop += element.scrollHeight - previous.current.height;
    } else if (stickToBottom.current) element.scrollTop = element.scrollHeight;
    previous.current = { first, last, height: element.scrollHeight };
  }, [chat.messages, chat.pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    stickToBottom.current = true;
    if (chat.send(body)) setBody('');
  }
  const disabled = chat.loading || !chat.participant || chat.connection === 'denied';
  return <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="채팅 대화">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
      <p role="status" className={`text-xs ${chat.connection === 'connected' ? 'text-emerald-700' : 'text-slate-500'}`}>{connectionLabel[chat.connection]}</p>
      {chat.connection !== 'denied' && <button type="button" className="text-xs text-indigo-700 underline" onClick={chat.reconnect}>다시 연결</button>}
    </div>
    {chat.hasOlder && <button type="button" className="w-full border-b border-slate-100 py-3 text-sm text-indigo-700 disabled:opacity-50" disabled={chat.loadingOlder} onClick={chat.loadOlder}>
      {chat.loadingOlder ? '이전 대화 불러오는 중…' : '이전 대화 더 보기'}</button>}
    <div ref={scroll} className="h-[50vh] min-h-72 max-h-[640px] space-y-4 overflow-y-auto px-4 py-5 sm:px-6" style={{ overflowAnchor: 'none' }}
      onScroll={() => { const element = scroll.current; if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}
      role="log" aria-label="메시지 목록" aria-live="polite" aria-relevant="additions text">
      {chat.loading ? <p className="py-12 text-center text-sm text-slate-500">대화를 불러오고 있어요.</p> : !chat.messages.length && !chat.pending.length && chat.connection !== 'denied' &&
        <p className="py-12 text-center text-sm leading-7 text-slate-500">아직 대화가 없어요.<br />첫 메시지를 보내 보세요.</p>}
      {chat.messages.map((message) => {
        const mine = message.senderMemberId === chat.participant?.id;
        return <article key={message.messageId} data-message-id={message.messageId} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
          <p className="mb-1 text-xs text-slate-500">{mine ? '나' : message.senderDisplayName}{message.senderKind === 'GUEST' ? ' · 게스트' : ''}</p>
          <p className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere] ${mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>{message.body}</p>
          <time dateTime={message.createdAt} className="mt-1 text-[11px] text-slate-400">{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time>
        </article>;
      })}
      {chat.pending.map((message) => <article key={message.clientMessageId} className="flex flex-col items-end">
        <p className="mb-1 text-xs text-slate-500">나</p>
        <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900 [overflow-wrap:anywhere]">{message.body}</p>
        {message.status === 'sending' ? <p className="mt-1 text-xs text-slate-500">전송 중…</p> : <div className="mt-2 max-w-[90%] text-right">
          <p role="alert" className="text-xs leading-5 text-red-700">전송을 확인하지 못했어요. {message.error}</p>
          <button type="button" className="mt-1 text-xs font-medium text-indigo-700 underline" onClick={() => chat.retry(message.clientMessageId)}>다시 보내기</button>
        </div>}
      </article>)}
    </div>
    {chat.error && <p role="alert" className="border-t border-slate-100 px-5 py-3 text-sm leading-6 text-red-700">{chat.error}</p>}
    <form onSubmit={submit} className="border-t border-slate-200 p-4">
      <label htmlFor={'message-' + props.roomId} className="sr-only">메시지</label>
      <textarea id={'message-' + props.roomId} value={body} onChange={(event) => setBody(event.target.value)} disabled={disabled} maxLength={4000} rows={3}
        placeholder="메시지를 입력하세요" className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-indigo-500 disabled:bg-slate-50"
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-400">Enter 전송 · Shift+Enter 줄바꿈</p>
        <Button type="submit" disabled={disabled || !body.trim()}>보내기</Button></div>
    </form>
  </section>;
}
