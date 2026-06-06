import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  ROOM_ACCESS_MODES,
  SOCKET_EVENTS,
  type RoomJoinAck,
  type RoomStatePayload,
  type ViewerDeniedPayload,
  type ViewerRequestedPayload
} from "@openshare/shared";
import { buildServer, type OpenShareServer } from "../app.js";

let server: OpenShareServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe("server HTTP API", () => {
  it("returns health", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });

    const response = await server.app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("creates rooms", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });

    const response = await server.app.inject({ method: "POST", url: "/rooms", payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      roomId: expect.stringMatching(/^[A-Za-z0-9_-]{6}$/),
      accessMode: ROOM_ACCESS_MODES.APPROVAL
    });
  });

  it("creates open rooms", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });

    const response = await server.app.inject({
      method: "POST",
      url: "/rooms",
      payload: { accessMode: ROOM_ACCESS_MODES.OPEN }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accessMode: ROOM_ACCESS_MODES.OPEN });
  });

  it("returns public WebRTC config", async () => {
    server = await buildServer({
      port: 0,
      clientOrigins: ["http://localhost:5173"],
      iceServers: [{ urls: "turn:turn.example.com:3478", username: "user", credential: "pass" }],
      roomTtlMinutes: 30
    });

    const response = await server.app.inject({ method: "GET", url: "/config" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      iceServers: [{ urls: "turn:turn.example.com:3478", username: "user", credential: "pass" }]
    });
  });
});

describe("signaling", () => {
  it("requests host approval before broadcasting viewer room state", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
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
      const requestPromise = waitForEventWhere<ViewerRequestedPayload>(
        host,
        SOCKET_EVENTS.VIEWER_REQUESTED,
        (request) => request.roomId === room.id && request.displayName === "Nani"
      );
      const statePromise = waitForEventWhere<RoomStatePayload>(
        host,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.viewerCount === 1
      );

      host.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId: room.id, role: "host" });
      viewer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomId: room.id, role: "viewer", displayName: "Nani" });

      const request = await requestPromise;
      host.emit(SOCKET_EVENTS.VIEWER_APPROVAL, { roomId: room.id, requestId: request.requestId, approved: true });

      const state = await statePromise;
      expect(state.roomId).toBe(room.id);
      expect(state.viewerCount).toBe(1);
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("immediately admits named viewers to open rooms", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const url = getServerUrl(server);
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      const statePromise = waitForEventWhere<RoomStatePayload>(
        viewer,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.viewerCount === 1 && state.accessMode === ROOM_ACCESS_MODES.OPEN
      );

      const ack = await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });
      expect(ack.status).toBe("joined");
      expect((await statePromise).viewerCount).toBe(1);
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("switching to open approves all pending viewers", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const url = getServerUrl(server);
    const room = server.roomStore.createRoom();
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });
      const approvedState = waitForEventWhere<RoomStatePayload>(
        viewer,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.viewerCount === 1 && state.accessMode === ROOM_ACCESS_MODES.OPEN
      );

      host.emit(SOCKET_EVENTS.ROOM_ACCESS_MODE, { roomId: room.id, accessMode: ROOM_ACCESS_MODES.OPEN });

      expect((await approvedState).accessMode).toBe(ROOM_ACCESS_MODES.OPEN);
      expect(server.roomStore.getRoom(room.id)?.pendingViewers.size).toBe(0);
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("bulk denies pending viewers", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const url = getServerUrl(server);
    const room = server.roomStore.createRoom();
    const host = createClient(url, { transports: ["websocket"] });
    const viewerOne = createClient(url, { transports: ["websocket"] });
    const viewerTwo = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewerOne), waitForConnect(viewerTwo)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await Promise.all([
        emitJoin(viewerOne, { roomId: room.id, role: "viewer", displayName: "One" }),
        emitJoin(viewerTwo, { roomId: room.id, role: "viewer", displayName: "Two" })
      ]);
      const deniedOne = waitForEventWhere<ViewerDeniedPayload>(viewerOne, SOCKET_EVENTS.VIEWER_DENIED, (payload) => payload.roomId === room.id);
      const deniedTwo = waitForEventWhere<ViewerDeniedPayload>(viewerTwo, SOCKET_EVENTS.VIEWER_DENIED, (payload) => payload.roomId === room.id);

      host.emit(SOCKET_EVENTS.VIEWER_APPROVAL_BULK, { roomId: room.id, action: "deny" });

      await Promise.all([deniedOne, deniedTwo]);
      expect(server.roomStore.getRoom(room.id)?.pendingViewers.size).toBe(0);
      expect(server.roomStore.getState(room.id).viewerCount).toBe(0);
    } finally {
      host.close();
      viewerOne.close();
      viewerTwo.close();
    }
  });

  it("does not let viewers change the room access mode", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const url = getServerUrl(server);
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });

      viewer.emit(SOCKET_EVENTS.ROOM_ACCESS_MODE, { roomId: room.id, accessMode: ROOM_ACCESS_MODES.APPROVAL });
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(server.roomStore.getState(room.id).accessMode).toBe(ROOM_ACCESS_MODES.OPEN);
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

function emitJoin(socket: Socket, payload: { roomId: string; role: "host" | "viewer"; displayName?: string }): Promise<RoomJoinAck> {
  return new Promise((resolve) => {
    socket.emit(SOCKET_EVENTS.ROOM_JOIN, payload, (ack: RoomJoinAck) => resolve(ack));
  });
}

function getServerUrl(openShareServer: OpenShareServer): string {
  const address = openShareServer.app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP address");
  }
  return `http://localhost:${address.port}`;
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
