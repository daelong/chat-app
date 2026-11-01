'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatSocketAuth, Message } from '@chat/contracts';
import { errorMessage } from '@/lib/api-client';
import { searchMessages } from '../api/messages';

export function MessageSearch({ auth, onSelect }: { auth: ChatSocketAuth; onSelect(seq: number): void }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searched, setSearched] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search(append = false) {
    const q = append ? searched : term.trim();
    if (!q) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const page = await searchMessages(auth, q, append ? results.at(-1)?.seq : undefined, controller.signal);
      if (controller.signal.aborted) return;
      setResults((old) => append ? [...old, ...page.items] : page.items); setMore(page.hasMore); setSearched(q);
    } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void search(); }
  return <details className="border-b border-slate-100 px-5 py-3">
    <summary className="cursor-pointer text-sm font-medium text-slate-700">대화 검색</summary>
    <form className="mt-3 flex gap-2" onSubmit={submit}>
      <input aria-label="대화 검색어" value={term} maxLength={100} onChange={(event) => setTerm(event.target.value)} placeholder="이 방의 메시지·파일 이름 검색"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button type="submit" disabled={busy || !term.trim()} className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">검색</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {searched && <p role="status" className="mt-3 text-xs text-slate-500">‘{searched}’ 검색 결과 {results.length}개{more ? ' 이상' : ''}</p>}
    <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
      {results.map((message) => <li key={message.messageId}><button type="button" onClick={() => onSelect(message.seq)}
        className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-indigo-50">
        <span className="block text-xs text-slate-500">{message.senderDisplayName} · {new Date(message.createdAt).toLocaleString('ko-KR')}</span>
        <span className="mt-1 line-clamp-2 break-words">{message.body}</span><span className="mt-1 block text-xs text-indigo-700">이 대화로 이동</span>
      </button></li>)}
    </ul>
    {more && <button type="button" disabled={busy} onClick={() => { void search(true); }} className="mt-3 text-sm text-indigo-700 underline disabled:opacity-50">검색 결과 더 보기</button>}
  </details>;
}
