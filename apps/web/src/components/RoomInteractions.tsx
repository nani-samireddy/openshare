import { Hand, MessageSquare, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  REACTION_TYPES,
  SOCKET_EVENTS,
  type ChatMessagePayload,
  type ReactionReceivedPayload,
  type ReactionType,
  type RoomRole,
  type RoomViewer
} from "@openshare/shared";
import type { Socket } from "socket.io-client";

const REACTION_LABELS: Record<ReactionType, string> = {
  clap: "👏",
  heart: "❤️",
  thumbs_up: "👍",
  celebrate: "🎉"
};

type RoomInteractionsProps = {
  socket: Socket;
  roomId: string;
  role: RoomRole;
  selfHandRaised: boolean;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  raisedHands: RoomViewer[];
};

export function RoomInteractions({
  socket,
  roomId,
  role,
  selfHandRaised,
  chatEnabled,
  reactionsEnabled,
  raisedHands
}: RoomInteractionsProps) {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [message, setMessage] = useState("");
  const [reactions, setReactions] = useState<ReactionReceivedPayload[]>([]);

  useEffect(() => {
    function handleMessage(payload: ChatMessagePayload) {
      if (payload.roomId === roomId) {
        setMessages((current) => [...current.slice(-49), payload]);
      }
    }

    function handleReaction(payload: ReactionReceivedPayload) {
      if (payload.roomId !== roomId) {
        return;
      }
      setReactions((current) => [...current, payload]);
      window.setTimeout(() => {
        setReactions((current) => current.filter((reaction) => reaction.reactionId !== payload.reactionId));
      }, 2500);
    }

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handleMessage);
    socket.on(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);
    return () => {
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, handleMessage);
      socket.off(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);
    };
  }, [roomId, socket]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || !chatEnabled) {
      return;
    }
    socket.emit(SOCKET_EVENTS.CHAT_SEND, { roomId, text });
    setMessage("");
  }

  function sendReaction(reaction: ReactionType) {
    socket.emit(SOCKET_EVENTS.REACTION_SEND, { roomId, reaction });
  }

  return (
    <section className="relative grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="rounded-md border-[3px] border-ink bg-cream p-4 shadow-sketch">
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink/70">
          <MessageSquare aria-hidden className="h-4 w-4" />
          Room chat
        </p>
        <div className="mt-3 h-40 overflow-y-auto rounded-md border-2 border-ink bg-white p-3">
          {messages.length > 0 ? (
            <div className="flex flex-col gap-2">
              {messages.map((item) => (
                <div key={item.messageId} className="text-sm text-ink">
                  <span className="font-extrabold">{item.senderName}: </span>
                  <span className="font-semibold">{item.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-bold text-ink/60">{chatEnabled ? "No messages yet." : "Chat is disabled."}</p>
          )}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            disabled={!chatEnabled}
            aria-label="Chat message"
            placeholder={chatEnabled ? "Send a message" : "Chat disabled"}
            className="min-h-11 min-w-0 flex-1 rounded-md border-2 border-ink bg-white px-3 text-sm font-bold text-ink disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send message"
            title="Send message"
            disabled={!chatEnabled || !message.trim()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-sun disabled:opacity-50"
          >
            <Send aria-hidden className="h-4 w-4" />
          </button>
        </form>
      </div>

      <div className="rounded-md border-[3px] border-ink bg-sky p-4 shadow-sketch">
        <p className="text-xs font-extrabold uppercase tracking-wider text-cream">Reactions</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {REACTION_TYPES.map((reaction) => (
            <button
              key={reaction}
              type="button"
              aria-label={`Send ${reaction} reaction`}
              disabled={!reactionsEnabled}
              onClick={() => sendReaction(reaction)}
              className="flex aspect-square items-center justify-center rounded-md border-2 border-ink bg-cream text-xl disabled:opacity-50"
            >
              {REACTION_LABELS[reaction]}
            </button>
          ))}
        </div>
        {role === "viewer" ? (
          <button
            type="button"
            aria-pressed={selfHandRaised}
            onClick={() => socket.emit(SOCKET_EVENTS.VIEWER_RAISE_HAND, { roomId, raised: !selfHandRaised })}
            className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-ink text-sm font-extrabold ${
              selfHandRaised ? "bg-coral" : "bg-cream"
            }`}
          >
            <Hand aria-hidden className="h-4 w-4" />
            {selfHandRaised ? "Lower hand" : "Raise hand"}
          </button>
        ) : null}
        {role === "host" && raisedHands.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {raisedHands.map((viewer) => (
              <div key={viewer.viewerId} className="flex items-center justify-between gap-2 rounded-md border-2 border-ink bg-cream px-2 py-2">
                <span className="min-w-0 truncate text-xs font-extrabold text-ink">{viewer.displayName}</span>
                <button
                  type="button"
                  aria-label={`Lower ${viewer.displayName}'s hand`}
                  onClick={() => socket.emit(SOCKET_EVENTS.VIEWER_LOWER_HAND, { roomId, viewerId: viewer.viewerId })}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-coral"
                >
                  <X aria-hidden className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {reactions.map((reaction) => (
          <div key={reaction.reactionId} className="rounded-md border-2 border-ink bg-cream px-3 py-2 text-sm font-extrabold text-ink shadow-sketch">
            <span className="mr-2 text-xl">{REACTION_LABELS[reaction.reaction]}</span>
            {reaction.senderName}
          </div>
        ))}
      </div>
    </section>
  );
}
