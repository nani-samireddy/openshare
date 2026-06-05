import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import {
  SOCKET_EVENTS,
  type ClientAnswerPayload,
  type ClientIceCandidatePayload,
  type ClientOfferPayload,
  type RoomJoinPayload
} from "@openshare/shared";
import type { RoomStore } from "../rooms/room-store.js";

type SignalingOptions = {
  clientOrigin: string;
  roomStore: RoomStore;
};

function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function createSocketServer(httpServer: HttpServer, options: SignalingOptions): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: options.clientOrigin
    }
  });

  const { roomStore } = options;

  function emitRoomState(roomId: string): void {
    io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.ROOM_STATE, roomStore.getState(roomId));
  }

  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.ROOM_JOIN, (payload: RoomJoinPayload, ack?: (result: { ok: boolean; error?: string }) => void) => {
      try {
        if (payload.role === "host") {
          const room = roomStore.joinHost(payload.roomId, socket.id);
          socket.join(roomChannel(room.id));
          socket.emit(SOCKET_EVENTS.ROOM_STATE, roomStore.getState(room.id));
          emitRoomState(room.id);
          ack?.({ ok: true });
          return;
        }

        const { room, viewerId } = roomStore.joinViewer(payload.roomId, socket.id);
        socket.join(roomChannel(room.id));
        socket.emit(SOCKET_EVENTS.ROOM_STATE, roomStore.getState(room.id, viewerId));
        emitRoomState(room.id);

        const hostSocketId = roomStore.getHostSocketId(room.id);
        if (hostSocketId) {
          io.to(hostSocketId).emit(SOCKET_EVENTS.VIEWER_JOINED, { roomId: room.id, viewerId });
        }

        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : "Unable to join room" });
      }
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
          socket.emit(SOCKET_EVENTS.VIEWER_JOINED, { roomId: payload.roomId, viewerId });
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
          viewerCount: roomStore.getRoom(roomId)?.viewers.size ?? 0,
          isHostPresent: false,
          isSharing: false
        });
        io.to(roomChannel(roomId)).emit(SOCKET_EVENTS.HOST_STOPPED_SHARING, { roomId });
        roomStore.deleteRoom(roomId);
      }
      return;
    }

    if (membership.participantId) {
      const hostSocketId = roomStore.getHostSocketId(roomId);
      if (hostSocketId) {
        io.to(hostSocketId).emit(SOCKET_EVENTS.VIEWER_LEFT, {
          roomId,
          viewerId: membership.participantId
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
