import { ROOM_STATES, type RoomState } from "@openshare/shared";

type RoomStatusProps = {
  state: RoomState;
  role: "host" | "viewer";
  presenterName?: string;
  selfIsPresenter?: boolean;
};

export function RoomStatus({ state, role, presenterName = "Host", selfIsPresenter = role === "host" }: RoomStatusProps) {
  const message = getMessage(state, role, presenterName, selfIsPresenter);

  return (
    <div className="rounded-md border-2 border-ink bg-cream px-4 py-3 text-sm font-bold text-ink shadow-soft">
      {message}
    </div>
  );
}

function getMessage(state: RoomState, role: "host" | "viewer", presenterName: string, selfIsPresenter: boolean): string {
  if (state === ROOM_STATES.HOST_SHARING) {
    return selfIsPresenter ? "You are sharing your screen." : `${presenterName} is sharing.`;
  }

  if (state === ROOM_STATES.HOST_STOPPED) {
    return `${presenterName} has stopped sharing.`;
  }

  if (state === ROOM_STATES.HOST_DISCONNECTED) {
    return "The host disconnected.";
  }

  return selfIsPresenter ? "Ready when you are. Start sharing to bring viewers in." : `Waiting for ${presenterName} to start sharing...`;
}
