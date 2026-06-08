import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  ANNOTATION_COLORS,
  ROOM_ACCESS_MODES,
  SOCKET_EVENTS,
  type AnnotationStrokePayload,
  type ChatMessagePayload,
  type ReactionReceivedPayload,
  type RoomJoinAck,
  type RoomStatePayload,
  type ViewerDeniedPayload,
  type ViewerKickedPayload,
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
      accessMode: ROOM_ACCESS_MODES.APPROVAL,
      hostToken: expect.stringMatching(/^[A-Za-z0-9_-]+$/)
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

  it("protects host ownership and password-gated rooms", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    const response = await server.app.inject({
      method: "POST",
      url: "/rooms",
      payload: { accessMode: ROOM_ACCESS_MODES.OPEN, password: "secret-room", viewerLimit: 2, persistent: true }
    });
    const created = response.json() as { roomId: string; hostToken: string };
    await server.app.listen({ port: 0 });
    const host = createClient(getServerUrl(server), { transports: ["websocket"] });
    const viewer = createClient(getServerUrl(server), { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      expect((await emitJoin(host, { roomId: created.roomId, role: "host", hostToken: "wrong" })).ok).toBe(false);
      expect((await emitJoin(host, { roomId: created.roomId, role: "host", hostToken: created.hostToken })).ok).toBe(true);
      expect((await emitJoin(viewer, { roomId: created.roomId, role: "viewer", displayName: "Nani", password: "wrong" })).ok).toBe(false);
      expect((await emitJoin(viewer, { roomId: created.roomId, role: "viewer", displayName: "Nani", password: "secret-room" })).status).toBe(
        "joined"
      );
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("lets only hosts lock rooms and kick viewers", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const url = getServerUrl(server);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });
    const lateViewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer), waitForConnect(lateViewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      const hostStatePromise = waitForEventWhere<RoomStatePayload>(
        host,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.viewers.length === 1
      );
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });
      const hostState = await hostStatePromise;
      expect(hostState.viewers[0]?.displayName).toBe("Nani");

      viewer.emit(SOCKET_EVENTS.ROOM_SECURITY, { roomId: room.id, locked: true });
      await delay(20);
      expect(server.roomStore.getState(room.id).locked).toBe(false);

      host.emit(SOCKET_EVENTS.ROOM_SECURITY, { roomId: room.id, locked: true });
      await delay(20);
      expect((await emitJoin(lateViewer, { roomId: room.id, role: "viewer", displayName: "Late" })).ok).toBe(false);

      const kicked = waitForEventWhere<ViewerKickedPayload>(viewer, SOCKET_EVENTS.VIEWER_KICKED, (payload) => payload.roomId === room.id);
      host.emit(SOCKET_EVENTS.VIEWER_KICK, { roomId: room.id, viewerId: hostState.viewers[0]!.viewerId });
      expect((await kicked).reason).toContain("removed");
      expect(server.roomStore.getState(room.id).viewerCount).toBe(0);
    } finally {
      host.close();
      viewer.close();
      lateViewer.close();
    }
  });

  it("relays annotations from hosts and approved viewers while sharing", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const host = createClient(getServerUrl(server), { transports: ["websocket"] });
    const viewer = createClient(getServerUrl(server), { transports: ["websocket"] });
    const hostStroke = annotationStroke(room.id, "host-stroke");
    const viewerStroke = annotationStroke(room.id, "viewer-stroke");

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });
      const sharingState = waitForEventWhere<RoomStatePayload>(
        viewer,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.isSharing
      );
      host.emit(SOCKET_EVENTS.PRESENTER_STARTED_SHARING, { roomId: room.id });
      await sharingState;

      const receivedByViewer = waitForEventWhere<AnnotationStrokePayload>(
        viewer,
        SOCKET_EVENTS.ANNOTATION_STROKE,
        (stroke) => stroke.strokeId === hostStroke.strokeId
      );
      host.emit(SOCKET_EVENTS.ANNOTATION_STROKE, hostStroke);
      expect(await receivedByViewer).toEqual(hostStroke);

      const receivedByHost = waitForEventWhere<AnnotationStrokePayload>(
        host,
        SOCKET_EVENTS.ANNOTATION_STROKE,
        (stroke) => stroke.strokeId === viewerStroke.strokeId
      );
      viewer.emit(SOCKET_EVENTS.ANNOTATION_STROKE, viewerStroke);
      expect(await receivedByHost).toEqual(viewerStroke);
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("enforces annotation permissions and host-only controls", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const url = getServerUrl(server);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });
    const outsider = createClient(url, { transports: ["websocket"] });
    let strokesReceivedByHost = 0;
    let clearsReceivedByHost = 0;

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer), waitForConnect(outsider)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });
      const sharingState = waitForEventWhere<RoomStatePayload>(
        viewer,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.isSharing
      );
      host.emit(SOCKET_EVENTS.PRESENTER_STARTED_SHARING, { roomId: room.id });
      await sharingState;

      host.on(SOCKET_EVENTS.ANNOTATION_STROKE, () => {
        strokesReceivedByHost += 1;
      });
      host.on(SOCKET_EVENTS.ANNOTATION_CLEAR, () => {
        clearsReceivedByHost += 1;
      });

      const disabledState = waitForEventWhere<RoomStatePayload>(
        viewer,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && !state.viewerDrawingEnabled
      );
      host.emit(SOCKET_EVENTS.ANNOTATION_VIEWER_DRAWING, { roomId: room.id, enabled: false });
      await disabledState;

      viewer.emit(SOCKET_EVENTS.ANNOTATION_STROKE, annotationStroke(room.id, "blocked-viewer"));
      outsider.emit(SOCKET_EVENTS.ANNOTATION_STROKE, annotationStroke(room.id, "blocked-outsider"));
      viewer.emit(SOCKET_EVENTS.ANNOTATION_CLEAR, { roomId: room.id });
      viewer.emit(SOCKET_EVENTS.ANNOTATION_VIEWER_DRAWING, { roomId: room.id, enabled: true });
      await delay(40);

      expect(strokesReceivedByHost).toBe(0);
      expect(clearsReceivedByHost).toBe(0);
      expect(server.roomStore.getState(room.id).viewerDrawingEnabled).toBe(false);
    } finally {
      host.close();
      viewer.close();
      outsider.close();
    }
  });

  it("lets hosts hand presentation to a viewer and reclaim it", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const url = getServerUrl(server);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      const hostStatePromise = waitForEventWhere<RoomStatePayload>(
        host,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.viewers.length === 1
      );
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });
      const hostState = await hostStatePromise;
      const viewerId = hostState.viewers[0]!.viewerId;

      const invite = waitForEventWhere<{ roomId: string }>(viewer, SOCKET_EVENTS.PRESENTER_INVITED, (payload) => payload.roomId === room.id);
      host.emit(SOCKET_EVENTS.PRESENTER_INVITE, { roomId: room.id, viewerId });
      await invite;

      const viewerPresenterState = waitForEventWhere<RoomStatePayload>(
        viewer,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.presenterId === viewerId && state.selfIsPresenter
      );
      viewer.emit(SOCKET_EVENTS.PRESENTER_RESPONSE, { roomId: room.id, accepted: true });
      expect((await viewerPresenterState).presenterName).toBe("Nani");

      const sharingState = waitForEventWhere<RoomStatePayload>(
        host,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.presenterId === viewerId && state.isSharing
      );
      viewer.emit(SOCKET_EVENTS.PRESENTER_STARTED_SHARING, { roomId: room.id });
      expect((await sharingState).presenterName).toBe("Nani");

      const reclaimedState = waitForEventWhere<RoomStatePayload>(
        host,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.presenterId === "host" && state.selfIsPresenter && !state.isSharing
      );
      host.emit(SOCKET_EVENTS.PRESENTER_RECLAIM, { roomId: room.id });
      expect((await reclaimedState).selfIsPresenter).toBe(true);
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("blocks non-presenters from taking presenter controls", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const url = getServerUrl(server);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });

      viewer.emit(SOCKET_EVENTS.PRESENTER_STARTED_SHARING, { roomId: room.id });
      viewer.emit(SOCKET_EVENTS.PRESENTER_RECLAIM, { roomId: room.id });
      await delay(40);

      expect(server.roomStore.getState(room.id, "host", true)).toMatchObject({
        presenterId: "host",
        selfIsPresenter: true,
        isSharing: false
      });
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("relays chat, reactions, and raised hands for approved participants", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const url = getServerUrl(server);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });

      const chat = waitForEventWhere<ChatMessagePayload>(
        host,
        SOCKET_EVENTS.CHAT_MESSAGE,
        (payload) => payload.roomId === room.id && payload.text === "Can you zoom in?"
      );
      viewer.emit(SOCKET_EVENTS.CHAT_SEND, { roomId: room.id, text: "Can you zoom in?" });
      expect((await chat).senderName).toBe("Nani");

      const reaction = waitForEventWhere<ReactionReceivedPayload>(
        host,
        SOCKET_EVENTS.REACTION_RECEIVED,
        (payload) => payload.roomId === room.id && payload.reaction === "clap"
      );
      viewer.emit(SOCKET_EVENTS.REACTION_SEND, { roomId: room.id, reaction: "clap" });
      expect((await reaction).senderName).toBe("Nani");

      const raisedState = waitForEventWhere<RoomStatePayload>(
        host,
        SOCKET_EVENTS.ROOM_STATE,
        (state) => state.roomId === room.id && state.raisedHands.length === 1
      );
      viewer.emit(SOCKET_EVENTS.VIEWER_RAISE_HAND, { roomId: room.id, raised: true });
      expect((await raisedState).raisedHands[0]?.displayName).toBe("Nani");
    } finally {
      host.close();
      viewer.close();
    }
  });

  it("enforces host interaction settings and blocks outsiders", async () => {
    server = await buildServer({ port: 0, clientOrigins: ["http://localhost:5173"], iceServers: [], roomTtlMinutes: 30 });
    await server.app.listen({ port: 0 });
    const room = server.roomStore.createRoom(ROOM_ACCESS_MODES.OPEN);
    const url = getServerUrl(server);
    const host = createClient(url, { transports: ["websocket"] });
    const viewer = createClient(url, { transports: ["websocket"] });
    const outsider = createClient(url, { transports: ["websocket"] });
    let received = 0;

    try {
      await Promise.all([waitForConnect(host), waitForConnect(viewer), waitForConnect(outsider)]);
      await emitJoin(host, { roomId: room.id, role: "host" });
      await emitJoin(viewer, { roomId: room.id, role: "viewer", displayName: "Nani" });
      host.on(SOCKET_EVENTS.CHAT_MESSAGE, () => {
        received += 1;
      });
      host.on(SOCKET_EVENTS.REACTION_RECEIVED, () => {
        received += 1;
      });

      host.emit(SOCKET_EVENTS.ROOM_INTERACTION_SETTINGS, { roomId: room.id, chatEnabled: false, reactionsEnabled: false });
      await delay(20);
      viewer.emit(SOCKET_EVENTS.CHAT_SEND, { roomId: room.id, text: "Blocked" });
      viewer.emit(SOCKET_EVENTS.REACTION_SEND, { roomId: room.id, reaction: "heart" });
      outsider.emit(SOCKET_EVENTS.CHAT_SEND, { roomId: room.id, text: "Outsider" });
      outsider.emit(SOCKET_EVENTS.REACTION_SEND, { roomId: room.id, reaction: "clap" });
      await delay(40);

      expect(received).toBe(0);
      expect(server.roomStore.getState(room.id)).toMatchObject({ chatEnabled: false, reactionsEnabled: false });
    } finally {
      host.close();
      viewer.close();
      outsider.close();
    }
  });
});

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
}

function emitJoin(
  socket: Socket,
  payload: { roomId: string; role: "host" | "viewer"; displayName?: string; password?: string; hostToken?: string }
): Promise<RoomJoinAck> {
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

function annotationStroke(roomId: string, strokeId: string): AnnotationStrokePayload {
  return {
    roomId,
    strokeId,
    color: ANNOTATION_COLORS[0],
    points: [{ x: 0.25, y: 0.75 }],
    complete: true
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
