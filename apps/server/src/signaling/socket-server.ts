import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import {
  ROOM_ACCESS_MODES,
  SOCKET_EVENTS,
  type ClientAnswerPayload,
  type ClientIceCandidatePayload,
  type ClientOfferPayload,
  type RoomAccessModePayload,
  type RoomJoinAck,
  type RoomJoinPayload,
  type ViewerApprovalBulkPayload
} from "@openshare/shared";
import type { RoomStore } from "../rooms/room-store.js";

type SignalingOptions = {
  clientOrigins: string[];
  roomStore: RoomStore;
};

function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function createSocketServer(httpServer: HttpServer, options: SignalingOptions): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: options.clientOrigins
    }
  });

  const { roomStore } = options;

  function emitRoomState(roomId: string): void {
    io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.ROOM_STATE, roomStore.getState(roomId));
  }

  function admitViewer(roomId: string, requestId: string, hostSocketId?: string): void {
    const { room, viewerId, viewer } = roomStore.approveViewer(roomId, requestId);
    socketFor(io, viewer.socketId)?.join(roomChannel(room.id));
    io.to(viewer.socketId).emit(SOCKET_EVENTS.VIEWER_APPROVED, { roomId: room.id, viewerId });
    io.to(viewer.socketId).emit(SOCKET_EVENTS.ROOM_STATE, roomStore.getState(room.id, viewerId));
    emitRoomState(room.id);

    const hostTarget = hostSocketId ?? roomStore.getHostSocketId(room.id);
    if (hostTarget) {
      io.to(hostTarget).emit(SOCKET_EVENTS.VIEWER_JOINED, {
        roomId: room.id,
        viewerId,
        displayName: viewer.displayName
      });
    }
  }

  function denyViewer(roomId: string, requestId: string, reason: string): void {
    const deniedViewer = roomStore.denyViewer(roomId, requestId);
    io.to(deniedViewer.socketId).emit(SOCKET_EVENTS.VIEWER_DENIED, {
      roomId,
      reason
    });
  }

  function processAllPending(roomId: string, action: "approve" | "deny", hostSocketId?: string): void {
    const room = roomStore.requireRoom(roomId);
    const requestIds = Array.from(room.pendingViewers.keys());
    for (const requestId of requestIds) {
      if (action === "approve") {
        admitViewer(roomId, requestId, hostSocketId);
      } else {
        denyViewer(roomId, requestId, "The host declined your request.");
      }
    }
  }

  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.ROOM_JOIN, (payload: RoomJoinPayload, ack?: (result: RoomJoinAck) => void) => {
      try {
        if (payload.role === "host") {
          const room = roomStore.joinHost(payload.roomId, socket.id);
          socket.join(roomChannel(room.id));
          socket.emit(SOCKET_EVENTS.ROOM_STATE, roomStore.getState(room.id));
          for (const pendingViewer of room.pendingViewers.values()) {
            socket.emit(SOCKET_EVENTS.VIEWER_REQUESTED, {
              roomId: room.id,
              requestId: pendingViewer.requestId,
              displayName: pendingViewer.displayName
            });
          }
          emitRoomState(room.id);
          ack?.({ ok: true, status: "joined" });
          return;
        }

        const { room, requestId } = roomStore.requestViewerJoin(payload.roomId, socket.id, payload.displayName ?? "");
        if (room.accessMode === ROOM_ACCESS_MODES.OPEN) {
          admitViewer(room.id, requestId);
          ack?.({ ok: true, status: "joined" });
          return;
        }

        socket.emit(SOCKET_EVENTS.ROOM_STATE, roomStore.getState(room.id));
        const hostSocketId = roomStore.getHostSocketId(room.id);
        if (hostSocketId) {
          io.to(hostSocketId).emit(SOCKET_EVENTS.VIEWER_REQUESTED, {
            roomId: room.id,
            requestId,
            displayName: payload.displayName?.trim() || "Viewer"
          });
        }

        ack?.({ ok: true, status: "pending" });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : "Unable to join room" });
      }
    });

    socket.on(SOCKET_EVENTS.VIEWER_APPROVAL, (payload: { roomId: string; requestId: string; approved: boolean }) => {
      const membership = roomStore.getMembership(socket.id);
      if (membership?.role !== "host" || membership.roomId !== payload.roomId) {
        return;
      }

      try {
        if (!payload.approved) {
          denyViewer(payload.roomId, payload.requestId, "The host declined your request.");
          return;
        }

        admitViewer(payload.roomId, payload.requestId, socket.id);
      } catch {
        socket.emit(SOCKET_EVENTS.VIEWER_DENIED, {
          roomId: payload.roomId,
          reason: "That join request is no longer available."
        });
      }
    });

    socket.on(SOCKET_EVENTS.VIEWER_APPROVAL_BULK, (payload: ViewerApprovalBulkPayload) => {
      const membership = roomStore.getMembership(socket.id);
      if (membership?.role !== "host" || membership.roomId !== payload.roomId) {
        return;
      }

      processAllPending(payload.roomId, payload.action, socket.id);
    });

    socket.on(SOCKET_EVENTS.ROOM_ACCESS_MODE, (payload: RoomAccessModePayload) => {
      const membership = roomStore.getMembership(socket.id);
      if (membership?.role !== "host" || membership.roomId !== payload.roomId) {
        return;
      }

      const accessMode = payload.accessMode === ROOM_ACCESS_MODES.OPEN ? ROOM_ACCESS_MODES.OPEN : ROOM_ACCESS_MODES.APPROVAL;
      roomStore.setAccessMode(payload.roomId, accessMode);
      if (accessMode === ROOM_ACCESS_MODES.OPEN) {
        processAllPending(payload.roomId, "approve", socket.id);
      }
      emitRoomState(payload.roomId);
    });

    socket.on(SOCKET_EVENTS.ROOM_LEAVE, () => {
      handleLeave(socket.id, false);
    });

    socket.on(SOCKET_EVENTS.HOST_STARTED_SHARING, (payload: { roomId: string }) => {
      const membership = roomStore.getMembership(socket.id);
      if (membership?.role !== "host" || membership.roomId !== payload.roomId) {
        return;
      }

      roomStore.markSharing(payload.roomId, true);
      io.to(roomChannel(payload.roomId)).emit(SOCKET_EVENTS.HOST_STARTED_SHARING, { roomId: payload.roomId });
      emitRoomState(payload.roomId);

      const room = roomStore.getRoom(payload.roomId);
      if (room) {
        for (const viewerId of room.viewers.keys()) {
          const viewer = roomStore.getViewer(payload.roomId, viewerId);
          socket.emit(SOCKET_EVENTS.VIEWER_JOINED, {
            roomId: payload.roomId,
            viewerId,
            displayName: viewer?.displayName ?? "Viewer"
          });
        }
      }
    });

    socket.on(SOCKET_EVENTS.HOST_STOPPED_SHARING, (payload: { roomId: string }) => {
      const membership = roomStore.getMembership(socket.id);
      if (membership?.role !== "host" || membership.roomId !== payload.roomId) {
        return;
      }

      roomStore.markSharing(payload.roomId, false);
      io.to(roomChannel(payload.roomId)).emit(SOCKET_EVENTS.HOST_STOPPED_SHARING, { roomId: payload.roomId });
      emitRoomState(payload.roomId);
    });

    socket.on(SOCKET_EVENTS.WEBRTC_OFFER, (payload: ClientOfferPayload) => {
      const membership = roomStore.getMembership(socket.id);
      if (membership?.role !== "host" || membership.roomId !== payload.roomId) {
        return;
      }

      const viewerSocketId = roomStore.getViewerSocketId(payload.roomId, payload.viewerId);
      if (viewerSocketId) {
        io.to(viewerSocketId).emit(SOCKET_EVENTS.WEBRTC_OFFER, payload);
      }
    });

    socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, (payload: ClientAnswerPayload) => {
      const membership = roomStore.getMembership(socket.id);
      if (membership?.role !== "viewer" || !membership.participantId || membership.roomId !== payload.roomId) {
        return;
      }

      const hostSocketId = roomStore.getHostSocketId(payload.roomId);
      if (hostSocketId) {
        io.to(hostSocketId).emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
          ...payload,
          viewerId: membership.participantId
        });
      }
    });

    socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, (payload: ClientIceCandidatePayload) => {
      const membership = roomStore.getMembership(socket.id);
      if (!membership || membership.roomId !== payload.roomId) {
        return;
      }

      if (membership.role === "host" && payload.targetId) {
        const viewerSocketId = roomStore.getViewerSocketId(payload.roomId, payload.targetId);
        if (viewerSocketId) {
          io.to(viewerSocketId).emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            roomId: payload.roomId,
            fromId: "host",
            candidate: payload.candidate
          });
        }
        return;
      }

      if (membership.role === "viewer" && membership.participantId) {
        const hostSocketId = roomStore.getHostSocketId(payload.roomId);
        if (hostSocketId) {
          io.to(hostSocketId).emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            roomId: payload.roomId,
            fromId: membership.participantId,
            candidate: payload.candidate
          });
        }
      }
    });

    socket.on("disconnect", () => {
      handleLeave(socket.id, true);
    });
  });

  function handleLeave(socketId: string, isDisconnect: boolean): void {
    const membership = roomStore.leaveBySocket(socketId);
    if (!membership) {
      return;
    }

    const { roomId } = membership;
    if (membership.role === "host") {
      if (roomStore.getRoom(roomId)) {
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.ROOM_STATE, {
          roomId,
          state: "host_disconnected",
          accessMode: roomStore.getRoom(roomId)?.accessMode ?? ROOM_ACCESS_MODES.APPROVAL,
          viewerCount: roomStore.getRoom(roomId)?.viewers.size ?? 0,
          isHostPresent: false,
          isSharing: false
        });
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.HOST_STOPPED_SHARING, { roomId });
        if (!isDisconnect) {
          roomStore.deleteRoom(roomId);
        }
      }
      return;
    }

    if (membership.participantId) {
      const hostSocketId = roomStore.getHostSocketId(roomId);
      if (hostSocketId) {
          io.to(hostSocketId).emit(SOCKET_EVENTS.VIEWER_LEFT, {
            roomId,
            viewerId: membership.participantId,
            displayName: membership.displayName
          });
        }
      }

    if (roomStore.getRoom(roomId)) {
      emitRoomState(roomId);
    }

    if (!isDisconnect) {
      socketFor(io, socketId)?.leave(roomChannel(roomId));
    }
  }

  return io;
}

function socketFor(io: Server, socketId: string) {
  return io.sockets.sockets.get(socketId);
}
