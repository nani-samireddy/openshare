import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type RoomStatePayload } from "@openshare/shared";
import { buildServer, type OpenShareServer } from "../app.js";

let server: OpenShareServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("server HTTP API", () => {
  it("returns health", async () => {
    server = await buildServer({ port: 0, clientOrigin: "http://localhost:5173", roomTtlMinutes: 30 });

    const response = await server.app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("creates rooms", async () => {
    server = await buildServer({ port: 0, clientOrigin: "http://localhost:5173", roomTtlMinutes: 30 });

    const response = await server.app.inject({ method: "POST", url: "/rooms" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roomId: expect.stringMatching(/^[A-Za-z0-9_-]{6}$/) });
  });
});

describe("signaling", () => {
  it("broadcasts room state when a viewer joins", async () => {
    server = await buildServer({ port: 0, clientOrigin: "http://localhost:5173", roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const address = server.app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address");
    }

    const room = server.roomStore.createRoom();
    const url = `http://localhost:${address.port}`;
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      const statePromise = waitForEventWhere<RoomStatePayload>(
        host,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.viewerCount === 1
      );

      host.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId: room.id, role: "host" });
      viewer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId: room.id, role: "viewer" });

      const state = await statePromise;
      expect(state.roomId).toBe(room.id);
      expect(state.viewerCount).toBe(1);
    } finally {
      host.close();
      viewer.close();
    }
  });
});

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
}

function waitForEventWhere<T>(socket: Socket, event: string, predicate: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve) => {
    socket.on(event, (payload: T) => {
      if (predicate(payload)) {
        resolve(payload);
      }
    });
  });
}
