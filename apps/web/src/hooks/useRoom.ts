import { useEffect, useMemo, useState } from "react";
import { ROOM_STATES, SOCKET_EVENTS, type RoomRole, type RoomStatePayload } from "@openshare/shared";
import type { Socket } from "socket.io-client";

type UseRoomResult = {
  roomState: RoomStatePayload;
  error: string | null;
};

export function useRoom(socket: Socket, roomId: string, role: RoomRole): UseRoomResult {
  const initialState = useMemo<RoomStatePayload>(
    () => ({
      roomId,
      state: ROOM_STATES.WAITING_FOR_HOST,
      viewerCount: 0,
      isHostPresent: false,
      isSharing: false
    }),
    [roomId]
  );
  const [roomState, setRoomState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoomState(initialState);
    setError(null);

    function handleState(nextState: RoomStatePayload) {
      if (nextState.roomId === roomId) {
        setRoomState((current) => ({ ...current, ...nextState }));
      }
    }

    socket.on(SOCKET_EVENTS.ROOM_STATE, handleState);
    socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId, role }, (result: { ok: boolean; error?: string }) => {
      if (!result.ok) {
        setError(result.error ?? "Unable to join room");
      }
    });

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE, handleState);
    };
  }, [initialState, role, roomId, socket]);

  return { roomState, error };
}
