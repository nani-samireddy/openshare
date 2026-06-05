import { useEffect, useMemo, useState } from "react";
import {
  ROOM_STATES,
  SOCKET_EVENTS,
  type RoomJoinAck,
  type RoomRole,
  type RoomStatePayload,
  type ViewerApprovedPayload,
  type ViewerDeniedPayload
} from "@openshare/shared";
import type { Socket } from "socket.io-client";

export type ApprovalState = "idle" | "pending" | "approved" | "denied";

type UseRoomResult = {
  roomState: RoomStatePayload;
  error: string | null;
  approvalState: ApprovalState;
};

type UseRoomOptions = {
  socket: Socket;
  roomId: string;
  role: RoomRole;
  displayName?: string;
  shouldJoin: boolean;
};

export function useRoom({ socket, roomId, role, displayName, shouldJoin }: UseRoomOptions): UseRoomResult {
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
  const [approvalState, setApprovalState] = useState<ApprovalState>(role === "host" ? "approved" : "idle");

  useEffect(() => {
    setRoomState(initialState);
    setError(null);
    setApprovalState(role === "host" ? "approved" : "idle");

    if (!shouldJoin) {
      return;
    }

    function handleState(nextState: RoomStatePayload) {
      if (nextState.roomId === roomId) {
        setRoomState((current) => ({ ...current, ...nextState }));
      }
    }

    function handleApproved(payload: ViewerApprovedPayload) {
      if (payload.roomId === roomId) {
        setApprovalState("approved");
      }
    }

    function handleDenied(payload: ViewerDeniedPayload) {
      if (payload.roomId === roomId) {
        setApprovalState("denied");
        setError(payload.reason);
      }
    }

    socket.on(SOCKET_EVENTS.ROOM_STATE, handleState);
    socket.on(SOCKET_EVENTS.VIEWER_APPROVED, handleApproved);
    socket.on(SOCKET_EVENTS.VIEWER_DENIED, handleDenied);
    socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId, role, displayName }, (result: RoomJoinAck) => {
      if (!result.ok) {
        setError(result.error ?? "Unable to join room");
        setApprovalState("denied");
        return;
      }

      if (result.status === "pending") {
        setApprovalState("pending");
      } else {
        setApprovalState("approved");
      }
    });

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE, handleState);
      socket.off(SOCKET_EVENTS.VIEWER_APPROVED, handleApproved);
      socket.off(SOCKET_EVENTS.VIEWER_DENIED, handleDenied);
    };
  }, [displayName, initialState, role, roomId, shouldJoin, socket]);

  return { roomState, error, approvalState };
}
