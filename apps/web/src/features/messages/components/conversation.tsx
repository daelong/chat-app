'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { API_ROUTES, type ChatSocketAuth } from '@chat/contracts';
import { Button } from '@/components/ui/button';
import { useConversation } from '../hooks/use-conversation';
import { ParticipantsPanel } from './participants-panel';
import { MessageSearch } from './message-search';

const connectionLabel = { connecting: '연결 중…', syncing: '대화 동기화 중…', connected: '실시간 연결됨', offline: '실시간 연결 대기 · 대화 내역 자동 확인 중', denied: '참여 권한 확인 필요' };
export function Conversation(props: ChatSocketAuth) {
  const chat = useConversation(props);
  const [body, setBody] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const previous = useRef({ first: '', last: '', height: 0 });
  const restored = useRef(false);
  const jumped = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const first = chat.messages[0]?.messageId ?? '';
    const last = chat.messages.at(-1)?.messageId ?? '';
    function position(seq: number) {
      const target = element!.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
      if (!target) return false;
      element!.scrollTop += target.getBoundingClientRect().top - element!.getBoundingClientRect().top - 30;
      stickToBottom.current = false; setFollowing(false); return true;
    }
    if (chat.jumpTarget && chat.jumpTarget.version !== jumped.current && position(chat.jumpTarget.seq)) {
      jumped.current = chat.jumpTarget.version;
    } else if (!chat.loading && !restored.current && chat.initialReadSeq !== null) {
      restored.current = true;
      const unread = chat.messages.find((message) => message.seq > chat.initialReadSeq!);
      if (!(chat.initialReadSeq > 0 && unread && position(unread.seq))) element.scrollTop = element.scrollHeight;
    } else if (previous.current.first && first !== previous.current.first && last === previous.current.last) {
      element.scrollTop += element.scrollHeight - previous.current.height;
    } else if (stickToBottom.current) element.scrollTop = element.scrollHeight;
    previous.current = { first, last, height: element.scrollHeight };
  }, [chat.messages, chat.pending, chat.loading, chat.initialReadSeq, chat.jumpTarget]);

  useEffect(() => {
    const element = scroll.current;
    if (!element || chat.loading || chat.connection === 'denied') return;
    const observer = new IntersectionObserver((entries) => {
      if (document.visibilityState !== 'visible') return;
      const visible = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6).map((entry) => Number((entry.target as HTMLElement).dataset.readSeq));
      if (visible.length) chat.read(Math.max(...visible));
    }, { root: element, threshold: 0.6 });
    for (const item of element.querySelectorAll('[data-read-seq]')) observer.observe(item);
    function visible() {
      if (document.visibilityState !== 'visible') return;
      const bounds = element!.getBoundingClientRect();
      const items = [...element!.querySelectorAll<HTMLElement>('[data-read-seq]')].filter((item) => {
        const rect = item.getBoundingClientRect(); return rect.bottom > bounds.top && rect.bottom <= bounds.bottom;
      });
      if (items.length) chat.read(Math.max(...items.map((item) => Number(item.dataset.readSeq))));
    }
    document.addEventListener('visibilitychange', visible);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visible); };
  }, [chat.messages, chat.loading, chat.connection]);

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
    {chat.participant && chat.connection !== 'denied' && <>
      <ParticipantsPanel auth={props} me={chat.participant} participants={chat.participants} refresh={chat.refreshParticipants} />
      <MessageSearch auth={props} onSelect={chat.jump} />
    </>}
    {chat.hasOlder && <button type="button" className="w-full border-b border-slate-100 py-3 text-sm text-indigo-700 disabled:opacity-50" disabled={chat.loadingOlder} onClick={chat.loadOlder}>
      {chat.loadingOlder ? '이전 대화 불러오는 중…' : '이전 대화 더 보기'}</button>}
    <div ref={scroll} className="h-[50vh] min-h-72 max-h-[640px] space-y-4 overflow-y-auto px-4 py-5 sm:px-6" style={{ overflowAnchor: 'none' }}
      onScroll={() => { const element = scroll.current; if (element) { stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; setFollowing(stickToBottom.current); } }}
      role="log" aria-label="메시지 목록" aria-live="polite" aria-relevant="additions text">
      {chat.loading ? <p className="py-12 text-center text-sm text-slate-500">대화를 불러오고 있어요.</p> : !chat.messages.length && !chat.pending.length && chat.connection !== 'denied' &&
        <p className="py-12 text-center text-sm leading-7 text-slate-500">아직 대화가 없어요.<br />첫 메시지를 보내 보세요.</p>}
      {chat.messages.map((message, index) => {
        const mine = message.senderMemberId === chat.participant?.id;
        const unread = chat.participants.filter((item) => item.id !== message.senderMemberId && item.lastReadSeq < message.seq).length;
        const before = chat.messages[index - 1];
        return <Fragment key={message.messageId}>
          {before && message.seq > before.seq + 1 && <button type="button" disabled={chat.loadingOlder} onClick={() => chat.loadGap(before.seq)}
            className="w-full rounded-lg bg-slate-50 py-2 text-xs text-indigo-700 disabled:opacity-50">사이 대화 더 보기</button>}
          <article data-message-id={message.messageId} data-seq={message.seq}
          className={`flex flex-col rounded-lg ${chat.jumpTarget?.seq === message.seq ? 'bg-amber-50 ring-2 ring-amber-300' : ''} ${mine ? 'items-end' : 'items-start'}`}>
          {chat.initialReadSeq !== null && chat.messages.find((item) => item.seq > chat.initialReadSeq!)?.messageId === message.messageId && chat.initialReadSeq < message.seq &&
            <p className="mb-4 w-full border-t border-dashed border-indigo-200 pt-2 text-center text-xs text-indigo-600">여기부터 읽지 않은 메시지</p>}
          <p className="mb-1 text-xs text-slate-500">{mine ? '나' : message.senderDisplayName}{message.senderKind === 'GUEST' ? ' · 게스트' : ''}</p>
          {!message.attachments.length && <p className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere] ${mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>{message.body}</p>}
          {message.attachments.map((file) => <div key={file.id} className="max-w-[90%] rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {file.mimeType.startsWith('image/') && <a href={API_ROUTES.files(props.roomId, props.kind) + '/' + file.id} aria-label={file.filename + ' 다운로드'}>
              <img src={API_ROUTES.files(props.roomId, props.kind) + '/' + file.id + '?preview=1'} alt={file.filename} loading="lazy" className="mb-2 max-h-64 max-w-full rounded-lg object-contain" /></a>}
            <a href={API_ROUTES.files(props.roomId, props.kind) + '/' + file.id} className="block break-all text-sm text-indigo-700 underline" download>{file.filename}</a>
            <p className="mt-1 text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB · 다운로드</p>
          </div>)}
          <time data-read-seq={message.seq} dateTime={message.createdAt} className="mt-1 text-[11px] text-slate-400">{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time>
          {mine && chat.participants.length > 1 && <p className="mt-1 text-[11px] text-indigo-600">{unread ? `안 읽음 ${unread}` : '모두 읽음'}</p>}
        </article></Fragment>;
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
    {!following && <button type="button" className="w-full border-t border-slate-100 py-2 text-xs text-indigo-700" onClick={() => {
      stickToBottom.current = true; setFollowing(true); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    }}>최근 대화로 이동 ↓</button>}
    {chat.error && <p role="alert" className="border-t border-slate-100 px-5 py-3 text-sm leading-6 text-red-700">{chat.error}</p>}
    <form onSubmit={submit} className="border-t border-slate-200 p-4">
      <label htmlFor={'message-' + props.roomId} className="sr-only">메시지</label>
      <textarea id={'message-' + props.roomId} value={body} onChange={(event) => setBody(event.target.value)} disabled={disabled} maxLength={4000} rows={3}
        placeholder="메시지를 입력하세요" className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-indigo-500 disabled:bg-slate-50"
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <input ref={fileInput} type="file" aria-label="첨부파일 선택" className="hidden" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.zip" disabled={disabled}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) { stickToBottom.current = true; chat.sendFile(file); } event.target.value = ''; }} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={disabled} onClick={() => fileInput.current?.click()} className="text-sm text-indigo-700 underline disabled:opacity-50">파일 보내기</button>
        <p className="text-xs text-slate-400">Enter 전송 · Shift+Enter 줄바꿈</p>
        <Button type="submit" disabled={disabled || !body.trim()}>보내기</Button></div>
      <p className="mt-2 text-[11px] text-slate-400">파일당 10MB · JPG, PNG, GIF, WebP, PDF, TXT, ZIP · 선택하면 바로 전송됩니다.</p>
    </form>
  </section>;
}
