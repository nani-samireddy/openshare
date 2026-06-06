import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  DEFAULT_VIEWER_LIMIT,
  MAX_ROOM_PASSWORD_LENGTH,
  MAX_VIEWER_LIMIT,
  MIN_ROOM_PASSWORD_LENGTH,
  ROOM_ACCESS_MODES,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type HealthResponse,
  type PublicConfigResponse,
  isValidRoomId
} from "@openshare/shared";
import { RoomStore } from "./rooms/room-store.js";
import { createHostToken, hashSecret } from "./rooms/room-security.js";
import { UpstashRoomPersistence } from "./rooms/upstash-room-persistence.js";
import { createSocketServer } from "./signaling/socket-server.js";
import type { ServerEnv } from "./env.js";

export type OpenShareServer = {
  app: FastifyInstance;
  roomStore: RoomStore;
  stop: () => Promise<void>;
};

export async function buildServer(env: ServerEnv): Promise<OpenShareServer> {
  const app = Fastify({ logger: true });
  const roomTtlMs = env.roomTtlMinutes * 60 * 1000;
  const roomPersistence =
    env.upstashRedisRestUrl && env.upstashRedisRestToken
      ? new UpstashRoomPersistence(env.upstashRedisRestUrl, env.upstashRedisRestToken)
      : undefined;
  const roomStore = new RoomStore(roomPersistence, roomTtlMs);
  await roomStore.initialize();

  await app.register(cors, {
    origin: env.clientOrigins
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => ({ status: "ok" }));

  app.get<{ Reply: PublicConfigResponse }>("/config", async () => ({
    iceServers: env.iceServers
  }));

  app.post<{ Body: CreateRoomRequest; Reply: CreateRoomResponse }>("/rooms", async (request) => {
    const accessMode = request.body?.accessMode === ROOM_ACCESS_MODES.OPEN ? ROOM_ACCESS_MODES.OPEN : ROOM_ACCESS_MODES.APPROVAL;
    const password = request.body?.password?.trim() ?? "";
    if (password && (password.length < MIN_ROOM_PASSWORD_LENGTH || password.length > MAX_ROOM_PASSWORD_LENGTH)) {
      throw Object.assign(new Error("Password must be between 4 and 64 characters"), { statusCode: 400 });
    }
    const viewerLimit = Number.isInteger(request.body?.viewerLimit)
      ? Math.min(MAX_VIEWER_LIMIT, Math.max(1, request.body.viewerLimit!))
      : DEFAULT_VIEWER_LIMIT;
    const hostToken = createHostToken();
    const room = roomStore.createRoom({
      accessMode,
      passwordHash: password ? hashSecret(password) : null,
      hostTokenHash: hashSecret(hostToken),
      locked: Boolean(request.body?.locked),
      viewerLimit,
      persistent: Boolean(request.body?.persistent)
    });
    await roomStore.flushPersistence();
    return { roomId: room.id, accessMode: room.accessMode, hostToken };
  });

  app.get("/rooms/:roomId", async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    if (!isValidRoomId(roomId) || !roomStore.getRoom(roomId)) {
      return reply.code(404).send({ error: "Room not found" });
    }

    return roomStore.getState(roomId);
  });

  const io = createSocketServer(app.server, {
    clientOrigins: env.clientOrigins,
    roomStore
  });

  const cleanupInterval = setInterval(() => {
    roomStore.cleanupInactiveRooms(roomTtlMs);
  }, 60 * 1000);
  cleanupInterval.unref();

  return {
    app,
    roomStore,
    stop: async () => {
      clearInterval(cleanupInterval);
      await io.close();
      await roomStore.flushPersistence();
      await app.close();
    }
  };
}
