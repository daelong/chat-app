'use client';

import { useEffect, useRef, useState } from 'react';
import { messageSchema, sendMessageSchema, type ChatParticipant, type ChatSocketAuth, type Message, type SendMessageInput } from '@chat/contracts';
import { ApiError, errorMessage } from '@/lib/api-client';
import { createSocketClient } from '@/lib/socket-client';
import { getMessages, postMessage } from '../api/messages';

export interface PendingMessage { clientMessageId: string; body: string; status: 'sending' | 'failed'; error?: string; retryable: boolean }
type Connection = 'connecting' | 'syncing' | 'connected' | 'offline' | 'denied';
interface Actions { send(body: string): boolean; retry(id: string): void; older(): void; reconnect(): void }

export function useConversation({ roomId, kind, csrfToken }: ChatSocketAuth) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [participant, setParticipant] = useState<ChatParticipant | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const actions = useRef<Actions | null>(null);

  useEffect(() => {
    let active = true, denied = false, joined = false, joining = false, syncing = false, syncAgain = false, olderBusy = false;
    let cursor: number | null = null;
    let currentParticipant: ChatParticipant | null = null;
    const records = new Map<string, Message>();
    const outbox = new Map<string, PendingMessage>();
    const inFlight = new Set<string>();
    const abort = new AbortController();
    const socket = createSocketClient({ roomId, kind, csrfToken });
    setMessages([]); setPending([]); setParticipant(null); setConnection('connecting'); setLoading(true); setHasOlder(false); setError('');

    function deny(message: string) {
      if (!active || denied) return;
      denied = true; joined = false;
      records.clear(); outbox.clear();
      setMessages([]); setPending([]); setParticipant(null); setConnection('denied'); setError(message); setLoading(false);
      abort.abort(); socket.disconnect();
    }
    function failure(cause: unknown) {
      if (!active || denied) return;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { deny(cause.message); return; }
      setError(errorMessage(cause));
    }
    function merge(items: Message[]) {
      if (!active || denied) return;
      for (const message of items) {
        if (message.roomId !== roomId) continue;
        records.set(message.messageId, message);
        if (message.senderMemberId === currentParticipant?.id) outbox.delete(message.clientMessageId);
      }
      setMessages([...records.values()].sort((a, b) => a.seq - b.seq));
      setPending([...outbox.values()]);
    }

    async function transmit(id: string) {
      const draft = outbox.get(id);
      if (!active || denied || !draft || inFlight.has(id)) return;
      inFlight.add(id);
      outbox.set(id, { ...draft, status: 'sending', error: undefined });
      setPending([...outbox.values()]);
      const input: SendMessageInput = { roomId, clientMessageId: id, body: draft.body };
      try {
        let message: Message;
        if (socket.connected && joined) {
          try {
            const ack = await socket.timeout(5000).volatile.emitWithAck('message:send', input);
            if (!ack?.ok) throw new ApiError(ack?.error.status ?? 500, ack?.error.message ?? '전송을 확인하지 못했습니다.');
            message = messageSchema.parse(ack.data);
          } catch (cause) {
            if (cause instanceof ApiError) throw cause;
            // ack가 유실돼도 같은 ID를 사용하므로 이미 저장한 메시지가 중복 생성되지 않습니다.
            message = await postMessage(kind, input, csrfToken);
          }
        } else message = await postMessage(kind, input, csrfToken);
        if (!active || denied) return;
        outbox.delete(id); merge([message]);
      } catch (cause) {
        if (!active || denied) return;
        if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { failure(cause); return; }
        // 실시간 이벤트로 이미 저장을 확인한 경우 늦게 도착한 전송 오류는 무시합니다.
        if (outbox.has(id)) {
          outbox.set(id, { ...draft, status: 'failed', error: errorMessage(cause), retryable: !(cause instanceof ApiError) || cause.status >= 500 });
          setPending([...outbox.values()]);
        }
      } finally { inFlight.delete(id); }
    }

    async function synchronize() {
      if (!active || denied) return;
      if (syncing) { syncAgain = true; return; }
      syncing = true;
      try {
        do {
          syncAgain = false;
          if (cursor === null) {
            const page = await getMessages(roomId, kind, { limit: 30 }, abort.signal);
            if (!active || denied) return;
            currentParticipant = page.participant; setParticipant(page.participant);
            merge(page.items); setHasOlder(page.hasMore); cursor = page.lastSeq; setLoading(false);
          }
          while (active && !denied) {
            const page = await getMessages(roomId, kind, { afterSeq: cursor, limit: 100 }, abort.signal);
            if (!active || denied) return;
            currentParticipant = page.participant; setParticipant(page.participant); merge(page.items);
            if (!page.hasMore) { cursor = page.lastSeq; break; }
            const next = page.items.at(-1)?.seq;
            if (next === undefined || next <= cursor) throw new Error('Invalid message cursor');
            cursor = next;
          }
        } while (syncAgain && active && !denied);
        if (!active || denied) return;
        setError(''); setConnection(joined ? 'connected' : 'offline');
        for (const draft of outbox.values()) if (draft.status === 'failed' && draft.retryable) void transmit(draft.clientMessageId);
      } catch (cause) { failure(cause); }
      finally { syncing = false; if (active) setLoading(false); }
    }

    async function older() {
      if (!active || denied || olderBusy || !records.size) return;
      olderBusy = true; setLoadingOlder(true);
      try {
        const first = [...records.values()].reduce((minimum, item) => Math.min(minimum, item.seq), Infinity);
        const page = await getMessages(roomId, kind, { beforeSeq: first, limit: 30 }, abort.signal);
        if (!active || denied) return;
        merge(page.items); setHasOlder(page.hasMore);
      } catch (cause) { failure(cause); }
      finally { olderBusy = false; if (active) setLoadingOlder(false); }
    }

    async function subscribe() {
      if (!active || denied || joining || !socket.connected) return;
      joining = true;
      try {
        const ack = await socket.timeout(5000).emitWithAck('room:join', { roomId });
        if (!active || denied || !socket.connected) return;
        if (!ack?.ok) throw new ApiError(ack?.error.status ?? 500, ack?.error.message ?? '방 연결을 확인하지 못했습니다.');
        joined = true; currentParticipant = ack.data; setParticipant(ack.data); setConnection('syncing');
        await synchronize();
      } catch (cause) { failure(cause); if (active && !denied) setConnection('offline'); }
      finally { joining = false; }
    }
    socket.on('connect', () => { void subscribe(); });
    socket.on('message:new', (input) => {
      const parsed = messageSchema.safeParse(input);
      if (parsed.success) merge([parsed.data]);
    });
    socket.on('chat:access-revoked', () => deny('로그인이 만료되었거나 이 방의 참여 권한이 없습니다. 다시 로그인하거나 새 초대를 요청해 주세요.'));
    socket.on('disconnect', () => { joined = false; if (active && !denied) setConnection('offline'); });
    socket.on('connect_error', () => { if (active && !denied) setConnection('offline'); });
    function reconnect() {
      if (!active || denied) return;
      if (!socket.connected) socket.connect();
      else if (!joined) void subscribe();
      void synchronize();
    }
    function visible() { if (document.visibilityState === 'visible') reconnect(); }
    const poll = setInterval(() => { if (document.visibilityState === 'visible') reconnect(); }, 10_000);
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', visible);
    actions.current = {
      send(body) {
        if (!currentParticipant || denied || !active) return false;
        const input = sendMessageSchema.safeParse({ roomId, clientMessageId: crypto.randomUUID(), body });
        if (!input.success) { setError('메시지를 1~4000자로 입력해 주세요.'); return false; }
        outbox.set(input.data.clientMessageId, { clientMessageId: input.data.clientMessageId, body: input.data.body, status: 'sending', retryable: true });
        void transmit(input.data.clientMessageId); return true;
      },
      retry(id) { void transmit(id); }, older() { void older(); }, reconnect,
    };
    socket.connect(); void synchronize();
    return () => {
      active = false; actions.current = null; abort.abort(); clearInterval(poll);
      window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', visible);
      socket.removeAllListeners(); socket.disconnect();
    };
  }, [roomId, kind, csrfToken]);

  return { messages, pending, participant, connection, loading, loadingOlder, hasOlder, error,
    send: (body: string) => actions.current?.send(body) ?? false, retry: (id: string) => actions.current?.retry(id),
    loadOlder: () => actions.current?.older(), reconnect: () => actions.current?.reconnect() };
}
