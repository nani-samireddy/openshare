import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { type CreateRoomResponse, type HealthResponse, isValidRoomId } from "@openshare/shared";
import { RoomStore } from "./rooms/room-store.js";
import { createSocketServer } from "./signaling/socket-server.js";
import type { ServerEnv } from "./env.js";

export type OpenShareServer = {
  app: FastifyInstance;
  roomStore: RoomStore;
  stop: () => Promise<void>;
};

export async function buildServer(env: ServerEnv): Promise<OpenShareServer> {
  const app = Fastify({ logger: true });
  const roomStore = new RoomStore();

  await app.register(cors, {
    origin: env.clientOrigin
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => ({ status: "ok" }));

  app.post<{ Reply: CreateRoomResponse }>("/rooms", async () => {
    const room = roomStore.createRoom();
    return { roomId: room.id };
  });

  app.get("/rooms/:roomId", async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    if (!isValidRoomId(roomId) || !roomStore.getRoom(roomId)) {
      return reply.code(404).send({ error: "Room not found" });
    }

    return roomStore.getState(roomId);
  });

  const io = createSocketServer(app.server, {
    clientOrigin: env.clientOrigin,
    roomStore
  });

  const cleanupInterval = setInterval(() => {
    roomStore.cleanupInactiveRooms(env.roomTtlMinutes * 60 * 1000);
  }, 60 * 1000);
  cleanupInterval.unref();

  return {
    app,
    roomStore,
    stop: async () => {
      clearInterval(cleanupInterval);
      await io.close();
      await app.close();
    }
  };
}
