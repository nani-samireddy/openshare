import { ROOM_STATES, type RoomState } from "@openshare/shared";

type RoomStatusProps = {
  state: RoomState;
  role: "host" | "viewer";
};

export function RoomStatus({ state, role }: RoomStatusProps) {
  const message = getMessage(state, role);

  return (
    <div className="rounded-md border-2 border-ink bg-cream px-4 py-3 text-sm font-bold text-ink shadow-soft">
      {message}
    </div>
  );
}

function getMessage(state: RoomState, role: "host" | "viewer"): string {
  if (state === ROOM_STATES.HOST_SHARING) {
    return role === "host" ? "You are sharing your screen." : "The host is sharing.";
  }

  if (state === ROOM_STATES.HOST_STOPPED) {
    return "The host has stopped sharing.";
  }

  if (state === ROOM_STATES.HOST_DISCONNECTED) {
    return "The host disconnected.";
  }

  return role === "host" ? "Ready when you are. Start sharing to bring viewers in." : "Waiting for the host to start sharing...";
}
