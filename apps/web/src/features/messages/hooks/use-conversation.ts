"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MAX_ATTACHMENT_SIZE,
  messageSchema,
  sendMessageSchema,
  type ChatParticipant,
  type ChatSocketAuth,
  type Message,
  type SendMessageInput,
} from "@chat/contracts";
import { ApiError, errorMessage } from "@/lib/api-client";
import { createSocketClient } from "@/lib/socket-client";
import {
  getMessages,
  getParticipants,
  markRead,
  postMessage,
  uploadFile,
} from "../api/messages";

export interface PendingMessage {
  clientMessageId: string;
  body: string;
  file?: File;
  status: "sending" | "failed";
  error?: string;
  retryable: boolean;
}
type Connection = "connecting" | "syncing" | "connected" | "offline" | "denied";
interface Actions {
  send(body: string): boolean;
  file(file: File): boolean;
  read(seq: number): void;
  jump(seq: number): void;
  gap(seq: number): void;
  retry(id: string): void;
  older(): void;
  reconnect(): void;
  participants(): void;
}

export function useConversation({ roomId, kind, csrfToken }: ChatSocketAuth) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [participant, setParticipant] = useState<ChatParticipant | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [initialReadSeq, setInitialReadSeq] = useState<number | null>(null);
  const [jumpTarget, setJumpTarget] = useState<{
    seq: number;
    version: number;
  } | null>(null);
  const actions = useRef<Actions | null>(null);

  useEffect(() => {
    let active = true,
      denied = false,
      joined = false,
      joining = false,
      syncing = false,
      syncAgain = false,
      olderBusy = false;
    let cursor: number | null = null;
    let currentParticipant: ChatParticipant | null = null;
    let localRead = 0,
      wantedRead = 0,
      readBusy = false,
      participantBusy = false;
    let readTimer: ReturnType<typeof setTimeout> | undefined;
    const records = new Map<string, Message>();
    const outbox = new Map<string, PendingMessage>();
    const inFlight = new Set<string>();
    const abort = new AbortController();
    const socket = createSocketClient({ roomId, kind, csrfToken });
    setMessages([]);
    setPending([]);
    setParticipant(null);
    setConnection("connecting");
    setLoading(true);
    setHasOlder(false);
    setError("");
    setParticipants([]);
    setInitialReadSeq(null);
    setJumpTarget(null);

    function invalidateRooms() {
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      void queryClient.invalidateQueries({ queryKey: ["room"] });
      void queryClient.invalidateQueries({ queryKey: ["guest-room", roomId] });
    }
    async function refreshParticipants() {
      if (!active || denied || participantBusy) return;
      participantBusy = true;
      try {
        const data = await getParticipants(roomId, kind, abort.signal);
        if (!active || denied) return;
        localRead = Math.max(localRead, data.me.lastReadSeq);
        setParticipants((previous) =>
          data.items.map((item) => ({
            ...item,
            lastReadSeq: Math.max(
              item.lastReadSeq,
              previous.find((old) => old.id === item.id)?.lastReadSeq ?? 0
            ),
          }))
        );
      } catch (cause) {
        failure(cause);
      } finally {
        participantBusy = false;
      }
    }
    async function flushRead() {
      if (
        !active ||
        denied ||
        readBusy ||
        wantedRead <= localRead ||
        document.visibilityState !== "visible"
      )
        return;
      readBusy = true;
      const target = wantedRead;
      try {
        await markRead({ roomId, kind, csrfToken }, target);
        if (!active || denied) return;
        localRead = Math.max(localRead, target);
        invalidateRooms();
        setParticipants((items) =>
          items.map((item) =>
            item.id === currentParticipant?.id
              ? { ...item, lastReadSeq: Math.max(item.lastReadSeq, target) }
              : item
          )
        );
      } catch (cause) {
        failure(cause);
      } finally {
        readBusy = false;
        if (active && !denied && wantedRead > localRead)
          readTimer = setTimeout(() => {
            void flushRead();
          }, 3000);
      }
    }

    function deny(message: string) {
      if (!active || denied) return;
      denied = true;
      joined = false;
      records.clear();
      outbox.clear();
      setMessages([]);
      setPending([]);
      setParticipant(null);
      setConnection("denied");
      setError(message);
      setLoading(false);
      setParticipants([]);
      abort.abort();
      socket.disconnect();
    }
    function failure(cause: unknown) {
      if (!active || denied) return;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        deny(cause.message);
        return;
      }
      setError(errorMessage(cause));
    }
    function merge(items: Message[]) {
      if (!active || denied) return;
      for (const message of items) {
        if (message.roomId !== roomId) continue;
        records.set(message.messageId, message);
        if (message.senderMemberId === currentParticipant?.id)
          outbox.delete(message.clientMessageId);
      }
      setMessages([...records.values()].sort((a, b) => a.seq - b.seq));
      setPending([...outbox.values()]);
    }

    async function transmit(id: string) {
      const draft = outbox.get(id);
      if (!active || denied || !draft || inFlight.has(id)) return;
      inFlight.add(id);
      outbox.set(id, { ...draft, status: "sending", error: undefined });
      setPending([...outbox.values()]);
      const input: SendMessageInput = {
        roomId,
        clientMessageId: id,
        body: draft.body,
      };
      try {
        let message: Message;
        if (draft.file)
          message = await uploadFile(
            { roomId, kind, csrfToken },
            draft.file,
            id
          );
        else if (socket.connected && joined) {
          try {
            const ack = await socket
              .timeout(5000)
              .volatile.emitWithAck("message:send", input);
            if (!ack?.ok)
              throw new ApiError(
                ack?.error.status ?? 500,
                ack?.error.message ?? "전송을 확인하지 못했습니다."
              );
            message = messageSchema.parse(ack.data);
          } catch (cause) {
            if (cause instanceof ApiError) throw cause;
            // ack가 유실돼도 같은 ID를 사용하므로 이미 저장한 메시지가 중복 생성되지 않습니다.
            message = await postMessage(kind, input, csrfToken);
          }
        } else message = await postMessage(kind, input, csrfToken);
        if (!active || denied) return;
        outbox.delete(id);
        merge([message]);
      } catch (cause) {
        if (!active || denied) return;
        if (
          cause instanceof ApiError &&
          [401, 403, 404].includes(cause.status)
        ) {
          failure(cause);
          return;
        }
        // 실시간 이벤트로 이미 저장을 확인한 경우 늦게 도착한 전송 오류는 무시합니다.
        if (outbox.has(id)) {
          outbox.set(id, {
            ...draft,
            status: "failed",
            error: errorMessage(cause),
            retryable: !(cause instanceof ApiError) || cause.status >= 500,
          });
          setPending([...outbox.values()]);
        }
      } finally {
        inFlight.delete(id);
      }
    }

    async function synchronize() {
      if (!active || denied) return;
      if (syncing) {
        syncAgain = true;
        return;
      }
      syncing = true;
      try {
        do {
          syncAgain = false;
          if (cursor === null) {
            const page = await getMessages(
              roomId,
              kind,
              { limit: 30 },
              abort.signal
            );
            if (!active || denied) return;
            currentParticipant = page.participant;
            setParticipant(page.participant);
            localRead = Math.max(localRead, page.participant.lastReadSeq);
            setInitialReadSeq(page.participant.lastReadSeq);
            merge(page.items);
            setHasOlder(page.hasMore);
            cursor = page.lastSeq;
            if (
              page.participant.lastReadSeq > 0 &&
              page.participant.lastReadSeq < page.lastSeq
            ) {
              const resume = await getMessages(
                roomId,
                kind,
                { aroundSeq: page.participant.lastReadSeq, limit: 30 },
                abort.signal
              );
              if (!active || denied) return;
              merge(resume.items);
              setHasOlder(resume.hasMore);
              cursor = resume.items.at(-1)?.seq ?? page.lastSeq;
            }
            setLoading(false);
          }
          while (active && !denied) {
            const page = await getMessages(
              roomId,
              kind,
              { afterSeq: cursor, limit: 100 },
              abort.signal
            );
            if (!active || denied) return;
            currentParticipant = page.participant;
            setParticipant(page.participant);
            merge(page.items);
            if (!page.hasMore) {
              cursor = page.lastSeq;
              break;
            }
            const next = page.items.at(-1)?.seq;
            if (next === undefined || next <= cursor)
              throw new Error("Invalid message cursor");
            cursor = next;
          }
        } while (syncAgain && active && !denied);
        if (!active || denied) return;
        setError("");
        setConnection(joined ? "connected" : "offline");
        void refreshParticipants();
        void flushRead();
        for (const draft of outbox.values())
          if (draft.status === "failed" && draft.retryable)
            void transmit(draft.clientMessageId);
      } catch (cause) {
        failure(cause);
      } finally {
        syncing = false;
        if (active) setLoading(false);
      }
    }

    async function jump(seq: number) {
      try {
        const page = await getMessages(
          roomId,
          kind,
          { aroundSeq: seq, limit: 30 },
          abort.signal
        );
        if (!active || denied) return;
        merge(page.items);
        const earliest = [...records.values()].reduce((minimum, item) => Math.min(minimum, item.seq), Infinity);
        if (page.items[0]?.seq === earliest) setHasOlder(page.hasMore);
        setJumpTarget((old) => ({ seq, version: (old?.version ?? 0) + 1 }));
      } catch (cause) {
        failure(cause);
      }
    }

    async function gap(seq: number) {
      if (!active || denied || olderBusy) return;
      olderBusy = true;
      setLoadingOlder(true);
      try {
        const page = await getMessages(roomId, kind, { afterSeq: seq, limit: 100 }, abort.signal);
        if (active && !denied) merge(page.items);
      } catch (cause) { failure(cause); }
      finally { olderBusy = false; if (active) setLoadingOlder(false); }
    }

    async function older() {
      if (!active || denied || olderBusy || !records.size) return;
      olderBusy = true;
      setLoadingOlder(true);
      try {
        const first = [...records.values()].reduce(
          (minimum, item) => Math.min(minimum, item.seq),
          Infinity
        );
        const page = await getMessages(
          roomId,
          kind,
          { beforeSeq: first, limit: 30 },
          abort.signal
        );
        if (!active || denied) return;
        merge(page.items);
        setHasOlder(page.hasMore);
      } catch (cause) {
        failure(cause);
      } finally {
        olderBusy = false;
        if (active) setLoadingOlder(false);
      }
    }

    async function subscribe() {
      if (!active || denied || joining || !socket.connected) return;
      joining = true;
      try {
        const ack = await socket
          .timeout(5000)
          .emitWithAck("room:join", { roomId });
        if (!active || denied || !socket.connected) return;
        if (!ack?.ok)
          throw new ApiError(
            ack?.error.status ?? 500,
            ack?.error.message ?? "방 연결을 확인하지 못했습니다."
          );
        joined = true;
        currentParticipant = ack.data;
        setParticipant(ack.data);
        setConnection("syncing");
        await synchronize();
      } catch (cause) {
        failure(cause);
        if (active && !denied) setConnection("offline");
      } finally {
        joining = false;
      }
    }
    socket.on("connect", () => {
      void subscribe();
    });
    socket.on("message:new", (input) => {
      const parsed = messageSchema.safeParse(input);
      if (parsed.success) merge([parsed.data]);
    });
    socket.on("message:read-updated", (update) => {
      if (!active || denied || update.roomId !== roomId) return;
      if (update.memberId === currentParticipant?.id)
        localRead = Math.max(localRead, update.lastReadSeq);
      setParticipants((items) =>
        items.map((item) =>
          item.id === update.memberId
            ? {
                ...item,
                lastReadSeq: Math.max(item.lastReadSeq, update.lastReadSeq),
              }
            : item
        )
      );
      invalidateRooms();
    });
    socket.on("room:participants-updated", () => {
      void refreshParticipants();
      invalidateRooms();
    });
    socket.on("chat:access-revoked", () =>
      deny(
        "로그인이 만료되었거나 이 방의 참여 권한이 없습니다. 다시 로그인하거나 새 초대를 요청해 주세요."
      )
    );
    socket.on("disconnect", () => {
      joined = false;
      if (active && !denied) setConnection("offline");
    });
    socket.on("connect_error", () => {
      if (active && !denied) setConnection("offline");
    });
    function reconnect() {
      if (!active || denied) return;
      if (!socket.connected) socket.connect();
      else if (!joined) void subscribe();
      void synchronize();
    }
    function visible() {
      if (document.visibilityState === "visible") reconnect();
    }
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") reconnect();
    }, 10_000);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", visible);
    actions.current = {
      send(body) {
        if (!currentParticipant || denied || !active) return false;
        const input = sendMessageSchema.safeParse({
          roomId,
          clientMessageId: crypto.randomUUID(),
          body,
        });
        if (!input.success) {
          setError("메시지를 1~4000자로 입력해 주세요.");
          return false;
        }
        outbox.set(input.data.clientMessageId, {
          clientMessageId: input.data.clientMessageId,
          body: input.data.body,
          status: "sending",
          retryable: true,
        });
        void transmit(input.data.clientMessageId);
        return true;
      },
      retry(id) {
        void transmit(id);
      },
      older() {
        void older();
      },
      reconnect,
      participants() {
        void refreshParticipants();
      },
      jump(seq) {
        void jump(seq);
      },
      gap(seq) {
        void gap(seq);
      },
      read(seq) {
        if (
          document.visibilityState !== "visible" ||
          !active ||
          denied ||
          seq <= localRead
        )
          return;
        wantedRead = Math.max(wantedRead, seq);
        if (readTimer) clearTimeout(readTimer);
        readTimer = setTimeout(() => {
          void flushRead();
        }, 400);
      },
      file(file) {
        if (!currentParticipant || denied || !active) return false;
        if (!file.size || file.size > MAX_ATTACHMENT_SIZE) {
          setError("파일은 0바이트 초과, 10MB까지 보낼 수 있습니다.");
          return false;
        }
        const id = crypto.randomUUID();
        outbox.set(id, {
          clientMessageId: id,
          body: file.name,
          file,
          status: "sending",
          retryable: true,
        });
        void transmit(id);
        return true;
      },
    };
    socket.connect();
    void synchronize();
    return () => {
      active = false;
      actions.current = null;
      abort.abort();
      clearInterval(poll);
      if (readTimer) clearTimeout(readTimer);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", visible);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [roomId, kind, csrfToken, queryClient]);

  return {
    messages,
    pending,
    participant,
    connection,
    loading,
    loadingOlder,
    hasOlder,
    error,
    participants,
    initialReadSeq,
    jumpTarget,
    sendFile: (file: File) => actions.current?.file(file) ?? false,
    read: (seq: number) => actions.current?.read(seq),
    jump: (seq: number) => actions.current?.jump(seq),
    refreshParticipants: () => actions.current?.participants(),
    loadGap: (seq: number) => actions.current?.gap(seq),
    send: (body: string) => actions.current?.send(body) ?? false,
    retry: (id: string) => actions.current?.retry(id),
    loadOlder: () => actions.current?.older(),
    reconnect: () => actions.current?.reconnect(),
  };
}
